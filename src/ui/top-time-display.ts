import { lazyEl } from '@/ui/dom-cache';
import { dateToJD } from '@/core/time';
import { MINUTES_PER_DAY } from '@/core/constants';
import type { CalendarSnapshot } from '@/core/types';
import type { TimeService } from '@/core/time-service';
import { formatTideTopBar, getCachedTideState } from '@/main/tide-ui';

interface TopTimeState {
  currentJD: number | null;
  currentTime: Date;
  userTimezone: string;
  enochHem: 'N' | 'S';
  currentSunEclLon: number | undefined;
  observerLongitude: number;
  observerLongitudeApprox: boolean;
  observerLatitude: number;
  isVisible: (id: string) => boolean;
}

export interface TopTimeDeps {
  getState: () => TopTimeState;
  timeService: TimeService;
}

let _cachedTopDateHtml = '';
let _cachedTopHenochHtml = '';
let _lastTopTimeUpdate = 0;
const TOP_TIME_THROTTLE_MS = 200;

export function createTopTimeDisplay(deps: TopTimeDeps) {
  function update(snap?: CalendarSnapshot): void {
    const now = performance.now();
    if (now - _lastTopTimeUpdate < TOP_TIME_THROTTLE_MS) return;
    _lastTopTimeUpdate = now;

    const state = deps.getState();
    const topDateMainEl = lazyEl('topDateMain');
    const topHenochEl = lazyEl('topHenoch');

    const jd = state.currentJD !== null ? state.currentJD : dateToJD(state.currentTime);
    const snapshot = snap ?? deps.timeService.getSnapshot(
      jd, state.userTimezone, state.enochHem, state.currentSunEclLon || 0,
      undefined, state.observerLongitude, state.observerLongitudeApprox, state.observerLatitude
    );

    if (topDateMainEl) {
      const joursSemaine = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

      const jdLocal = jd - (snapshot.tzOffsetMinutes / MINUTES_PER_DAY);

      const dayIndex = Math.floor(jdLocal + 1.5) % 7;
      const nomJour = joursSemaine[dayIndex];

      const localStr = `${nomJour} ${snapshot.localDateString}`;

      const calLabel = snapshot.julianDisplayString ? ' <span class="top-cal-label">(grég.)</span>' : '';
      const julianHtml = snapshot.julianDisplayString
        ? `<br><span>${snapshot.julianDisplayString} <span class="top-cal-label">(jul.)</span></span>`
        : '';
      const newHtml = `<span class="top-date-local">${localStr}${calLabel}</span>${julianHtml}`;
      if (newHtml !== _cachedTopDateHtml) {
        topDateMainEl.innerHTML = newHtml;
        _cachedTopDateHtml = newHtml;
      }
    }

    if (topHenochEl) {
      const enochStr = `${snapshot.enoch.labelText}`;
      const hebrewStr = `${snapshot.hebrew.labelText} <span class="top-hebrew-label">(Hébraïque)</span>`;
      const newHtml =
        `<span class="top-enoch-label">${enochStr}</span>` +
        `<br><span class="top-hebrew-text">${hebrewStr}</span>`;
      if (newHtml !== _cachedTopHenochHtml) {
        topHenochEl.innerHTML = newHtml;
        _cachedTopHenochHtml = newHtml;
      }
    }

    // Solar + lunar time display
    const topSolarEl = lazyEl('topSolar');
    if (state.isVisible('solarTime')) {
      if (topSolarEl) {
        const s = snapshot.solar;
        const l = snapshot.lunar;
        const lonDir = s.longitude >= 0 ? 'E' : 'O';
        const lonStr = `${Math.abs(s.longitude).toFixed(2)}°${lonDir}`;
        const solarHtml = `<span class="solar-time-label">☀</span> ${s.lastFormatted} · <span class="solar-noon-label">Midi</span> ${s.solarNoonLocalTime} · <span class="eot-label">EoT</span> ${s.eotFormatted} · <span class="lon-label">${lonStr}</span>` +
            `<br><span class="lunar-time-label">☽</span> ${l.lunarTimeFormatted} · <span class="lunar-transit-label">Transit</span> ${l.lunarTransitLocalTime} · <span class="lunar-shift-label">Décalage</span> +${Math.round(l.lunarShiftMinutes)}min/j`;
        topSolarEl.innerHTML = solarHtml;
        topSolarEl.style.display = '';
      }
    } else if (topSolarEl) {
      topSolarEl.style.display = 'none';
    }

    // Tide display (always visible, independent of layer toggle)
    const cachedTide = getCachedTideState();
    const topTideEl = lazyEl('topTide');
    if (cachedTide) {
      if (topTideEl) {
        topTideEl.innerHTML = formatTideTopBar()!;
        topTideEl.style.display = '';
      }
    } else if (topTideEl) {
      topTideEl.style.display = 'none';
    }
  }

  return { update };
}