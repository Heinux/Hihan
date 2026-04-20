import { BIBLICAL_EVENTS, EVENT_LABELS_N, EVENT_LABELS_S, JULIAN_UNIX_EPOCH, MS_PER_DAY } from '@/core/constants';
import { getChristianFeastsForDate } from '@/features/christian-feasts';
import { getIslamicFeastsForDate } from '@/features/islamic-feasts';
import { getJewishFeastsForEnochDay, getJewishFeastsForHebrewDay } from '@/features/jewish-feasts';
import { getSeasonsForYear } from '@/features/seasons';
import { calendarToJD } from '@/core/time';
import { escapeHtml, escapeAttr } from '@/core/utils';
import type { BiblicalEvent } from '@/core/constants';
import type { ChristianFeast } from '@/features/christian-feasts';
import type { IslamicFeast } from '@/features/islamic-feasts';
import type { JewishFeast } from '@/features/jewish-feasts';

const ENOCH_60_1_URL = 'https://fr.wikisource.org/wiki/Livre_d%E2%80%99H%C3%A9noch_(%C3%A9thiopien)/Livre_d%E2%80%99H%C3%A9noch#CH060';

let lastCacheKey = '';
let clickDelegationReady = false;
let stripDelegationReady = false;
let lastIsMobile: boolean | null = null;
let mobileBackdrop: HTMLElement | null = null;

function hasChapterAndVerse(ref: string): boolean {
  return /\d+:\d+/.test(ref);
}

function buildBibleGatewayUrl(ref: string): string {
  return `https://www.biblegateway.com/passage/?search=${encodeURIComponent(ref)}&version=LSG`;
}

function openReference(ref: string): void {
  if (ref === 'I Enoch 60:1') {
    window.open(ENOCH_60_1_URL, '_blank', 'noopener');
    return;
  }
  if (!hasChapterAndVerse(ref)) return;
  window.open(buildBibleGatewayUrl(ref), '_blank', 'noopener');
}

export function getRestDayNumber(curDay: number): number | null {
  if (curDay < 0 || curDay % 7 !== 6) return null;
  return Math.floor(curDay / 7) + 1;
}

export function getMatchingBiblicalEvents(enochMonthIdx: number, enochDayInMonth: number): BiblicalEvent[] {
  const bibMonth = enochMonthIdx + 1;
  return BIBLICAL_EVENTS.filter(ev => {
    if (ev.month !== bibMonth) return false;
    if (ev.day === null) return false;
    if (ev.day_range) {
      return enochDayInMonth >= ev.day_range[0] && enochDayInMonth <= ev.day_range[1];
    }
    return ev.day === enochDayInMonth;
  });
}

function buildBiblicalEventHtml(ev: BiblicalEvent): string {
  const isEnoch = ev.reference === 'I Enoch 60:1';
  const clickable = hasChapterAndVerse(ev.reference) || isEnoch;
  const clickClass = clickable ? 'bib-clickable' : '';
  const linkIcon = clickable ? '<span class="bib-link-icon">\u2197</span>' : '';
  return `<div class="bib-event-card ${clickClass}" data-ref="${escapeAttr(ev.reference)}">
    <div class="bib-event-info">
      <div class="bib-event-ref">${escapeHtml(ev.reference)} ${linkIcon}</div>
      <div class="bib-event-context">${escapeHtml(ev.context)}</div>
    </div>
  </div>`;
}

function buildRestDayHtml(restDayNum: number): string {
  return `<div class="bib-event-card bib-rest-card">
    <span class="bib-rest-icon">\u2724</span>
    <div class="bib-feast-info">
      <div class="bib-rest-name">Jour de Repos</div>
      <div class="bib-rest-context">${restDayNum}e jour de repos \u2014 7e jour de la semaine</div>
    </div>
  </div>`;
}

function buildJewishFeastHtml(feast: JewishFeast): string {
  return `<div class="bib-event-card bib-feast-card">
    <span class="bib-feast-icon">${feast.icon}</span>
    <div class="bib-feast-info">
      <div class="bib-feast-name">${escapeHtml(feast.name)}</div>
      <div class="bib-feast-context">${escapeHtml(feast.context)}</div>
    </div>
  </div>`;
}

function buildChristianFeastHtml(feast: ChristianFeast): string {
  return `<div class="bib-event-card bib-christian-card">
    <span class="bib-christian-icon">${feast.symbol}</span>
    <div class="bib-feast-info">
      <div class="bib-christian-name">${escapeHtml(feast.name)}</div>
      <div class="bib-feast-context">${escapeHtml(feast.context)}</div>
    </div>
  </div>`;
}

function buildIslamicFeastHtml(feast: IslamicFeast): string {
  return `<div class="bib-event-card bib-islamic-card">
    <span class="bib-islamic-icon">${feast.symbol}</span>
    <div class="bib-feast-info">
      <div class="bib-islamic-name">${escapeHtml(feast.name)}</div>
      <div class="bib-feast-context">${escapeHtml(feast.context)}</div>
    </div>
  </div>`;
}

function buildSeasonHtml(season: { label: string; symbol: string; color: string }): string {
  return `<div class="bib-event-card bib-season-card">
    <span class="bib-season-icon" style="color: ${season.color}">${season.symbol}</span>
    <div class="bib-feast-info">
      <div class="bib-season-name">${escapeHtml(season.label)}</div>
    </div>
  </div>`;
}

function buildPanelHtml(
  biblicalEvents: BiblicalEvent[],
  jewishFeasts: JewishFeast[],
  hebrewFeasts: JewishFeast[],
  christianFeasts: ChristianFeast[],
  islamicFeasts: IslamicFeast[],
  restDayNum: number | null,
  matchingSeasons: { key: string; label: string; symbol: string; color: string }[],
): string {
  let html = '<div class="bib-events-title">\u2726 \u00C9v\u00E9nements</div>';
  html += '<div class="bib-events-list">';

  if (restDayNum !== null) {
    html += buildRestDayHtml(restDayNum);
  }

  for (const ev of biblicalEvents) {
    html += buildBiblicalEventHtml(ev);
  }

  if (matchingSeasons.length > 0) {
    html += '<div class="bib-christian-divider">Événements astronomique</div>';
    for (const season of matchingSeasons) {
      html += buildSeasonHtml(season);
    }
  }

  if (hebrewFeasts.length > 0) {
    html += '<div class="bib-christian-divider">F\u00EAte H\u00E9bra\u00EFque</div>';
    for (const feast of hebrewFeasts) {
      html += buildJewishFeastHtml(feast);
    }
  }

  if (jewishFeasts.length > 0) {
    html += '<div class="bib-christian-divider">F\u00EAte H\u00E9bra\u00EFque H\u00E9noch</div>';
    for (const feast of jewishFeasts) {
      html += buildJewishFeastHtml(feast);
    }
  }

  if (christianFeasts.length > 0) {
    html += '<div class="bib-christian-divider">F\u00EAtes chr\u00E9tiennes</div>';
    for (const feast of christianFeasts) {
      html += buildChristianFeastHtml(feast);
    }
  }

  if (islamicFeasts.length > 0) {
    html += '<div class="bib-islamic-divider">F\u00EAtes musulmanes</div>';
    for (const feast of islamicFeasts) {
      html += buildIslamicFeastHtml(feast);
    }
  }

  html += '</div>';
  return html;
}

export interface RenderPanelOptions {
  container: HTMLElement;
  enochMonthIdx: number;
  enochDayInMonth: number;
  enochCurDay: number;
  gregYear: number;
  gregMonth: number;
  gregDay: number;
  hebrewMonth: number;
  hebrewDay: number;
  enochHem: 'N' | 'S';
}

export function renderBiblicalEventsPanel(opts: RenderPanelOptions): void {
  const { container, enochMonthIdx, enochDayInMonth, enochCurDay, gregYear, gregMonth, gregDay, hebrewMonth, hebrewDay, enochHem } = opts;
  const isMobile = window.matchMedia('(max-width: 639px)').matches;
  const modeSwitched = lastIsMobile !== null && lastIsMobile !== isMobile;
  lastIsMobile = isMobile;

  const biblicalEvents = getMatchingBiblicalEvents(enochMonthIdx, enochDayInMonth);
  const hebrewFeasts = hebrewMonth > 0 ? getJewishFeastsForHebrewDay(hebrewMonth, hebrewDay) : [];
  const enochFeasts = getJewishFeastsForEnochDay(enochMonthIdx, enochDayInMonth);
  const christianFeasts = getChristianFeastsForDate(gregYear, gregMonth, gregDay);
  const islamicFeasts = getIslamicFeastsForDate(gregYear, gregMonth, gregDay);
  const restDay = getRestDayNumber(enochCurDay);

  const jd = calendarToJD(gregYear, gregMonth, gregDay, 12, 0);
  const seasons = getSeasonsForYear(gregYear);
  const matchingSeasons: { key: string; label: string; symbol: string; color: string }[] = [];
  if (seasons) {
    const seasonKeys = ['vernal', 'summer', 'autumnal', 'winter'] as const;
    const labels = enochHem === 'S' ? EVENT_LABELS_S : EVENT_LABELS_N;
    for (const key of seasonKeys) {
      const seasonDate = seasons[key];
      const seasonJD = seasonDate.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
      if (Math.abs(seasonJD - jd) < 1) {
        matchingSeasons.push({ key, label: labels[key].label, symbol: labels[key].symbol, color: labels[key].color });
      }
    }
  }

  const hasEvents = biblicalEvents.length > 0 || hebrewFeasts.length > 0 || enochFeasts.length > 0 || christianFeasts.length > 0 || islamicFeasts.length > 0 || restDay !== null || matchingSeasons.length > 0;

  if (!hasEvents) {
    if (lastCacheKey !== '') {
      container.innerHTML = '';
      container.classList.remove('has-events');
      container.classList.remove('bib-mobile-visible');
      if (mobileBackdrop) { mobileBackdrop.remove(); mobileBackdrop = null; }
      const strip = document.getElementById('bibStrip');
      if (strip) { strip.innerHTML = ''; strip.classList.remove('has-events'); }
      lastCacheKey = '';
    }
    return;
  }

  const bibKey = biblicalEvents.map(e => e.reference).join('|');
  const hebrewKey = hebrewFeasts.map(f => f.name).join('|');
  const enochKey = enochFeasts.map(f => f.name).join('|');
  const chrKey = christianFeasts.map(f => f.name).join('|');
  const islKey = islamicFeasts.map(f => f.name).join('|');
  const restKey = restDay !== null ? `R${restDay}` : '';
  const seasonsKey = matchingSeasons.map(s => s.key).join('|');
  const modeKey = isMobile ? 'M' : 'D';
  const cacheKey = modeKey + '#' + bibKey + '#' + hebrewKey + '#' + enochKey + '#' + chrKey + '#' + islKey + '#' + restKey + '#' + seasonsKey;

  if (cacheKey === lastCacheKey) return;
  lastCacheKey = cacheKey;

  // Clean up old mode state when switching
  if (modeSwitched) {
    container.classList.remove('bib-mobile-visible');
    if (mobileBackdrop) { mobileBackdrop.remove(); mobileBackdrop = null; }
    const strip = document.getElementById('bibStrip');
    if (strip) { strip.innerHTML = ''; strip.classList.remove('has-events'); }
  }

  container.classList.add('has-events');
  container.innerHTML = buildPanelHtml(biblicalEvents, enochFeasts, hebrewFeasts, christianFeasts, islamicFeasts, restDay, matchingSeasons);

  if (!clickDelegationReady) {
    clickDelegationReady = true;
    container.addEventListener('click', (e) => {
      const target = (e.target as HTMLElement).closest<HTMLElement>('.bib-event-card[data-ref]');
      if (!target) return;
      const ref = target.dataset.ref;
      if (ref) openReference(ref);
    });
  }

  if (isMobile) {
    const closeBtn = document.createElement('div');
    closeBtn.className = 'bib-mobile-close';
    closeBtn.textContent = '\u2715';
    closeBtn.addEventListener('click', (e) => { e.stopPropagation(); closeMobileBibPanel(container); });
    container.appendChild(closeBtn);
    updateMobileStrip(biblicalEvents, enochFeasts, hebrewFeasts, christianFeasts, islamicFeasts, restDay, matchingSeasons, container);
  } else {
    const strip = document.getElementById('bibStrip');
    if (strip) strip.classList.remove('has-events');
  }
}

function buildPill(label: string, cls: string): string {
  return `<span class="bib-pill ${cls}">${escapeHtml(label)}</span>`;
}

function updateMobileStrip(
  biblicalEvents: BiblicalEvent[],
  enochFeasts: JewishFeast[],
  hebrewFeasts: JewishFeast[],
  christianFeasts: ChristianFeast[],
  islamicFeasts: IslamicFeast[],
  restDayNum: number | null,
  matchingSeasons: { key: string; label: string; symbol: string; color: string }[],
  _container: HTMLElement,
): void {
  const strip = document.getElementById('bibStrip');
  if (!strip) return;

  let pills = '';
  if (restDayNum !== null) {
    pills += buildPill(`Jour de Repos (${restDayNum}e)`, 'bib-pill-rest');
  }
  for (const ev of biblicalEvents) {
    const shortRef = ev.reference.length > 20 ? ev.reference.slice(0, 18) + '\u2026' : ev.reference;
    pills += buildPill(shortRef, 'bib-pill-event');
  }
  for (const f of hebrewFeasts) {
    pills += buildPill(f.name + ' (H)', 'bib-pill-jewish');
  }
  for (const f of enochFeasts) {
    pills += buildPill(f.name + ' (E)', 'bib-pill-jewish');
  }
  for (const f of christianFeasts) {
    pills += buildPill(f.name, 'bib-pill-christian');
  }
  for (const f of islamicFeasts) {
    pills += buildPill(f.name, 'bib-pill-islamic');
  }
  for (const s of matchingSeasons) {
    pills += buildPill(s.label, 'bib-pill-season');
  }

  strip.innerHTML = pills;
  strip.classList.add('has-events');

  if (!stripDelegationReady) {
    stripDelegationReady = true;
    strip.addEventListener('click', () => {
      const panel = document.getElementById('biblicalEventsPanel');
      if (!panel) return;
      if (panel.classList.contains('bib-mobile-visible')) {
        closeMobileBibPanel(panel);
      } else {
        openMobileBibPanel(panel);
      }
    });
  }
}

function openMobileBibPanel(container: HTMLElement): void {
  container.classList.add('bib-mobile-visible');
  if (!mobileBackdrop) {
    mobileBackdrop = document.createElement('div');
    mobileBackdrop.className = 'bib-mobile-backdrop';
    mobileBackdrop.addEventListener('click', () => closeMobileBibPanel(container));
    document.body.appendChild(mobileBackdrop);
  }
}

function closeMobileBibPanel(container: HTMLElement): void {
  container.classList.remove('bib-mobile-visible');
  if (mobileBackdrop) {
    mobileBackdrop.remove();
    mobileBackdrop = null;
  }
}
