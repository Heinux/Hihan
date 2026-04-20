import { formatCountdown } from '@/core/formatters';
import { SEASON_DEFS, EVENT_LABELS_N, EVENT_LABELS_S, JULIAN_UNIX_EPOCH, MS_PER_DAY, MONTH_NAMES_FR } from '@/core/constants';
import { getYearFromJD, jdToCalendar, formatAstroYear } from '@/core/time';
import * as Astronomy from 'astronomy-engine';
import type { EventLabelsMap } from '@/core/constants';
import type { SeasonDeps, SeasonResult, SeasonJDs, SeasonEvent, CurrentSeasonInfo } from '@/core/types';

const seasonsCache: Record<number, SeasonResult | null> = {};
const _seasonClickBound = new WeakSet<HTMLElement>();

// Unified JD cache — covers all year ranges, no duplicates
const seasonsJDCache: Record<number, SeasonJDs | null> = {};

let lastEventPanelRef = 0;
let lastEventPanelYear: number | null = null;
let lastEventPanelHem: string | null = null;
let lastSeasonBarUpdate = 0;
let lastCountdownUpdate = 0;

// Pre-built card DOM nodes reused across rebuilds to avoid innerHTML thrashing
const _cardEls: HTMLElement[] = [];
let _onJump: ((jd: number) => void) | null = null;
let _cardJDs: number[] = [];

export function getSeasonsForYear(year: number): SeasonResult | null {
  if (seasonsCache[year] !== undefined) return seasonsCache[year];
  try {
    if (year >= 0 && year <= 99) {
      const s = Astronomy.Seasons(year + 2000);           // calcul précis avec l’éphéméride moderne
      const offsetMs = 2000 * 365.2425 * MS_PER_DAY;     // ← EXACTEMENT la moyenne grégorienne proleptique
      const r: SeasonResult = {
        vernal:   new Date(s.mar_equinox.date.getTime() - offsetMs),
        summer:   new Date(s.jun_solstice.date.getTime() - offsetMs),
        autumnal: new Date(s.sep_equinox.date.getTime() - offsetMs),
        winter:   new Date(s.dec_solstice.date.getTime() - offsetMs),
      };
      seasonsCache[year] = r;
      seasonsJDCache[year] = {
        vernal:   r.vernal.getTime()   / MS_PER_DAY + JULIAN_UNIX_EPOCH,
        summer:   r.summer.getTime()   / MS_PER_DAY + JULIAN_UNIX_EPOCH,
        autumnal: r.autumnal.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH,
        winter:   r.winter.getTime()   / MS_PER_DAY + JULIAN_UNIX_EPOCH,
      };
      return r;
    }
    const s = Astronomy.Seasons(year);
    const vYear = s.mar_equinox.date.getUTCFullYear();
    if (Math.abs(vYear - year) > 1) {
      seasonsCache[year] = null;
      return null;
    }
    const r: SeasonResult = {
      vernal:   s.mar_equinox.date,
      summer:   s.jun_solstice.date,
      autumnal: s.sep_equinox.date,
      winter:   s.dec_solstice.date,
    };
    seasonsCache[year] = r;
    // Also populate JD cache as side-effect
    seasonsJDCache[year] = {
      vernal:   r.vernal.getTime()   / MS_PER_DAY + JULIAN_UNIX_EPOCH,
      summer:   r.summer.getTime()   / MS_PER_DAY + JULIAN_UNIX_EPOCH,
      autumnal: r.autumnal.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH,
      winter:   r.winter.getTime()   / MS_PER_DAY + JULIAN_UNIX_EPOCH,
    };
    return r;
  } catch (e) {
    console.warn('[seasons] getSeasonsForYear failed', year, e);
    seasonsCache[year] = null;
    return null;
  }
}

function getApproxSeasonJDs(year: number): SeasonJDs {
  const Y = (year - 2000) / 1000;
  const marchEquinoxJD = 2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y * Y * Y - 0.00057 * Y * Y * Y * Y;
  return {
    vernal:   marchEquinoxJD,
    summer:   marchEquinoxJD + 93.8283,
    autumnal: marchEquinoxJD + 186.3847,
    winter:   marchEquinoxJD + 278.9418,
  };
}

// Single entry point for JD data — fully cached, no duplicate Astronomy calls
function getSeasonJDsForYear(year: number): SeasonJDs | null {
  if (seasonsJDCache[year] !== undefined) return seasonsJDCache[year];

  const jsMaxYear = 275760;

  if (year >= 0 && year <= jsMaxYear) {
    // getSeasonsForYear populates seasonsJDCache as side-effect
    getSeasonsForYear(year);
    const r = seasonsJDCache[year] ?? null;
    seasonsJDCache[year] = r;
    return r;
  }

  // Historical / far-future: cheap approximation formula, no Astronomy call
  const r = getApproxSeasonJDs(year);
  seasonsJDCache[year] = r;
  return r;
}

// getUpcomingSeasons — cached by year, reused while year stays the same
let _upcomingCache: { year: number; events: SeasonEvent[] } | null = null;

export function getUpcomingSeasons(_state: SeasonDeps, currentJD: number): SeasonEvent[] {
  const year = getYearFromJD(currentJD);

  if (_upcomingCache && _upcomingCache.year === year) return _upcomingCache.events;

  const events: SeasonEvent[] = [];
  for (const y of [year - 1, year, year + 1]) {
    const jdData = getSeasonJDsForYear(y);
    if (!jdData) continue;
    for (const def of SEASON_DEFS) {
      const jd = jdData[def.key as keyof SeasonJDs];
      events.push({ def, date: new Date(0), jd, year: y });
    }
  }
  events.sort((a, b) => a.jd - b.jd);
  _upcomingCache = { year, events };
  return events;
}

export function getCurrentSeason(state: SeasonDeps, currentJD: number): CurrentSeasonInfo {
  try {
    const jsMinYear = -271821;
    const jsMaxYear = 275760;
    const year = getYearFromJD(currentJD);

    if (year >= 100 && year >= jsMinYear && year <= jsMaxYear) {
      const s  = getSeasonsForYear(year);
      const sp = getSeasonsForYear(year - 1);
      const sn = getSeasonsForYear(year + 1);
      if (!s || !sp || !sn) return { season: '\u2014', progress: 0 };

      // Avoid creating a Date object — work in ms directly
      const t = (currentJD - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
      const isS = state.enochHem === 'S';
      const namesN: Record<string, string> = { vernal: 'Printemps', summer: '\u00C9t\u00E9', autumnal: 'Automne', winter: 'Hiver' };
      const namesS: Record<string, string> = { vernal: 'Automne', summer: 'Hiver', autumnal: 'Printemps', winter: '\u00C9t\u00E9' };
      const names = isS ? namesS : namesN;

      const points: { key: string; t: number }[] = [
        { key: 'vernal',   t: sp.vernal.getTime() },
        { key: 'summer',   t: sp.summer.getTime() },
        { key: 'autumnal', t: sp.autumnal.getTime() },
        { key: 'winter',   t: sp.winter.getTime() },
        { key: 'vernal',   t: s.vernal.getTime() },
        { key: 'summer',   t: s.summer.getTime() },
        { key: 'autumnal', t: s.autumnal.getTime() },
        { key: 'winter',   t: s.winter.getTime() },
        { key: 'vernal',   t: sn.vernal.getTime() },
      ];

      for (let i = points.length - 2; i >= 0; i--) {
        if (t >= points[i].t) {
          const progress = (t - points[i].t) / (points[i + 1].t - points[i].t);
          return { season: names[points[i].key], progress: Math.min(progress, 1) };
        }
      }
    } else {
      const sunLon = state.currentSunEclLon;
      if (sunLon !== undefined && sunLon !== null) {
        const isS = state.enochHem === 'S';
        const namesN: Record<string, string> = { 0: 'Printemps', 90: '\u00C9t\u00E9', 180: 'Automne', 270: 'Hiver' };
        const namesS: Record<string, string> = { 0: 'Automne', 90: 'Hiver', 180: 'Printemps', 270: '\u00C9t\u00E9' };
        const names = isS ? namesS : namesN;
        const boundaries = [0, 90, 180, 270];
        let closestIdx = 0;
        let minDist = 360;
        for (let i = 0; i < boundaries.length; i++) {
          const dist = Math.abs(sunLon - boundaries[i]);
          const minD = Math.min(dist, 360 - dist);
          if (minD < minDist) { minDist = minD; closestIdx = i; }
        }
        const prevB = boundaries[(closestIdx + 3) % 4];
        const progress = closestIdx === 0
          ? (sunLon >= prevB ? sunLon - prevB : sunLon + 360 - prevB) / 90
          : (sunLon - prevB) / 90;
        return { season: names[boundaries[closestIdx]], progress: Math.max(0, Math.min(1, progress)) };
      }

      const cal = jdToCalendar(currentJD);
      const isS = state.enochHem === 'S';
      let seasonIdx: number;
      if (cal.month >= 3 && cal.month <= 5)  seasonIdx = isS ? 2 : 0;
      else if (cal.month >= 6 && cal.month <= 8)  seasonIdx = isS ? 3 : 1;
      else if (cal.month >= 9 && cal.month <= 11) seasonIdx = isS ? 0 : 2;
      else seasonIdx = isS ? 1 : 3;
      return { season: ['Printemps', '\u00C9t\u00E9', 'Automne', 'Hiver'][seasonIdx], progress: 0 };
    }
  } catch (e) {
    console.warn('[seasons] getCurrentSeason failed', e);
  }
  return { season: '\u2014', progress: 0 };
}

export function getEventLabels(state: SeasonDeps): EventLabelsMap {
  return state.enochHem === 'S' ? EVENT_LABELS_S : EVENT_LABELS_N;
}

type EventKey = 'vernal' | 'summer' | 'autumnal' | 'winter';

export function forceEventPanelRefresh(): void {
  lastEventPanelRef = 0;
  lastEventPanelYear = null;
  lastEventPanelHem = null;
  _upcomingCache = null;
}

// Fast-scrub guard: skip DOM rebuild if year changes faster than this threshold
const FAST_SCRUB_GUARD_MS = 150;
let _lastRebuildMs = 0;

// updateEventPanel — DOM node reuse, zero innerHTML on year change
//
// Optimisations vs original:
//  1. Card nodes created once, updated in-place — no innerHTML/layout thrashing
//  2. Single delegated click listener on panel set once — no per-card listener leak
//  3. Fast-scrub guard skips DOM work during rapid year scrubbing
//  4. Countdown updates use indexed _cardJDs array — no querySelectorAll
export function updateEventPanel(
  state: SeasonDeps,
  panelEl: HTMLElement | null,
  currentJD: number,
): ((onJump: (jd: number) => void) => void) | undefined {
  if (!panelEl) return;

  const currentYear = getYearFromJD(currentJD);
  const currentHem = state.enochHem || 'N';
  const now = Date.now();

  const yearOrHemChanged = currentYear !== lastEventPanelYear || currentHem !== lastEventPanelHem;
  const timedOut = (now - lastEventPanelRef) >= 30000;
  const scrubbing = yearOrHemChanged && (now - _lastRebuildMs) < FAST_SCRUB_GUARD_MS;
  const shouldRebuild = (yearOrHemChanged || timedOut) && !scrubbing;

  if (!shouldRebuild) {
    _updateCardCountdowns(currentJD, now);
    return _makeAttachFn();
  }

  _lastRebuildMs = now;
  lastEventPanelRef = now;
  lastEventPanelYear = currentYear;
  lastEventPanelHem = currentHem;

  try {
    const events = getUpcomingSeasons(state, currentJD);
    const futureIdx = events.findIndex(e => e.jd > currentJD);
    const startIdx = Math.max(0, futureIdx - 1);
     const slice = events.slice(startIdx, startIdx + 5);
    const labels = getEventLabels(state);

    // Ensure we have enough card nodes — create missing, never destroy
    while (_cardEls.length < slice.length) {
      const card = document.createElement('div');
      card.className = 'event-card';
      const icon = document.createElement('span');
      icon.className = 'event-icon';
      const info = document.createElement('div');
      info.className = 'event-info';
      const nameEl = document.createElement('div');
      nameEl.className = 'event-name';
      const dateEl = document.createElement('div');
      dateEl.className = 'event-date';
      info.appendChild(nameEl);
      info.appendChild(dateEl);
      const countdown = document.createElement('div');
      countdown.className = 'event-countdown';
      card.appendChild(icon);
      card.appendChild(info);
      card.appendChild(countdown);
      _cardEls.push(card);
    }

    // Detach surplus cards (keep in _cardEls pool for reuse)
    while (panelEl.children.length > slice.length) {
      panelEl.removeChild(panelEl.lastChild!);
    }

    // Populate each card in-place
    _cardJDs = [];
    for (let i = 0; i < slice.length; i++) {
      const { def, jd } = slice[i];
      const msDays = jd - currentJD;
      const ms = msDays * MS_PER_DAY;
      const cal = jdToCalendar(jd);
      const dateStr = `${String(cal.day).padStart(2, '0')} ${MONTH_NAMES_FR[cal.month]} ${formatAstroYear(cal.year)} ${String(cal.hours).padStart(2, '0')}:${String(cal.mins).padStart(2, '0')} UTC`;
      const lbl = labels[def.key as EventKey] || def;

      const card = _cardEls[i];
      card.dataset.jd = String(jd);
      card.classList.toggle('active-event', Math.abs(msDays) < 0.5);

      const icon = card.children[0] as HTMLElement;
      icon.style.color = lbl.color;
      icon.textContent = lbl.symbol;

      const info = card.children[1];
      (info.children[0] as HTMLElement).textContent = lbl.label;
      (info.children[1] as HTMLElement).textContent = dateStr;

      const countdownEl = card.children[2] as HTMLElement;
      countdownEl.textContent = formatCountdown(ms);
      countdownEl.classList.toggle('past', msDays < 0);
      countdownEl.classList.toggle('soon', msDays > 0 && msDays < 7);

      if (card.parentNode !== panelEl) panelEl.appendChild(card);
      _cardJDs.push(jd);
    }

    // Single delegated listener — set once, never removed
    if (!_seasonClickBound.has(panelEl)) {
      panelEl.addEventListener('click', (e: Event) => {
        const card = (e.target as HTMLElement).closest('.event-card') as HTMLElement | null;
        if (!card || !_onJump) return;
        const jd = parseFloat(card.dataset.jd!);
        if (!isNaN(jd)) _onJump(jd);
      });
      _seasonClickBound.add(panelEl);
    }

  } catch (e) {
    console.warn('[seasons] updateEventPanel failed', e);
    panelEl.textContent = 'Hors plage de calcul (précession longue période)';
  }

  return _makeAttachFn();
}

function _makeAttachFn() {
  return function attachEventCardListeners(onJump: (jd: number) => void): void {
    _onJump = onJump;
  };
}

// In-place countdown update — indexed array, no querySelectorAll
function _updateCardCountdowns(currentJD: number, now: number): void {
  if (now - lastCountdownUpdate < 1000) return;
  lastCountdownUpdate = now;
  for (let i = 0; i < _cardEls.length && i < _cardJDs.length; i++) {
    const card = _cardEls[i];
    if (!card.parentNode) continue;
    const msDays = _cardJDs[i] - currentJD;
    const ms = msDays * MS_PER_DAY;
    const countdownEl = card.children[2] as HTMLElement;
    countdownEl.textContent = formatCountdown(ms);
    countdownEl.classList.toggle('past', msDays < 0);
    countdownEl.classList.toggle('soon', msDays > 0 && msDays < 7);
  }
}

export function updateEventCountdowns(_state: SeasonDeps, panelEl: HTMLElement | null, currentJD: number): void {
  if (!panelEl) return;
  _updateCardCountdowns(currentJD, Date.now());
}

export function updateSeasonBar(state: SeasonDeps, barEl: HTMLElement | null): void {
  if (!barEl) return;
  if (Date.now() - lastSeasonBarUpdate < 2000) return;
  lastSeasonBarUpdate = Date.now();
  try {
    const currentJD = state.currentJD !== null
      ? state.currentJD
      : state.currentTime.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
    const { season, progress } = getCurrentSeason(state, currentJD);
    // Update child spans in-place instead of replacing innerHTML each time
    if (!barEl.firstElementChild) {
      barEl.innerHTML = '<span></span>\u00A0\u00B7\u00A0<span></span>';
    }
    (barEl.children[0] as HTMLElement).textContent = season;
    (barEl.children[1] as HTMLElement).textContent = `${Math.round(progress * 100)}% écoulé`;
  } catch (e) {
    console.warn('[seasons] updateSeasonBar failed', e);
    barEl.textContent = '\u2014';
  }
}