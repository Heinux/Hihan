import { dateToJD, jdToCalendar, computeYearJump, calendarToJD, julianCalendarToJD, getTzOffsetMinutes } from '@/core/time';
import { JULIAN_UNIX_EPOCH, MS_PER_DAY, MINUTES_PER_DAY, JS_DATE_MAX_MS, GREGORIAN_CUTOVER_JD } from '@/core/constants';
import { buildTimezoneSelect } from '@/ui/tz-select';

import type { CelestialBody } from '@/core/constants';
import type { DateDisplayDeps, PanelState } from '@/core/types';
import type { AppState } from '@/core/state';

let _cachedYearInputEl: HTMLInputElement | null | undefined;
let _cachedDatetimeInputEl: HTMLInputElement | null | undefined;

function updateLongitudeDisplay(lng: number, approx: boolean): void {
  const el = document.getElementById('lon-display');
  if (!el) return;
  const dir = lng >= 0 ? 'E' : 'O';
  const approxStr = approx ? ' (approx.)' : '';
  el.textContent = `Longitude : ${Math.abs(lng).toFixed(2)}° ${dir}${approxStr}`;
}

export function setupPanel(state: AppState, celestialBodies: readonly CelestialBody[]): () => void {
  const cleanups: (() => void)[] = [];

  // ── Toggle creation ──────────────────────────────────────────────
  const togglesDiv = document.getElementById('toggles');
  if (togglesDiv) {
    const allBodies: { id: string; name: string; color: string; defaultOff?: boolean }[] = [
      ...celestialBodies,
      { id: 'zodiac', name: 'Zodiaque', color: 'rgba(200,215,235,0.6)' },
      { id: 'seasons', name: '\u00C9quinoxes / Solstices', color: 'rgba(200,230,210,0.65)' },
      { id: 'equator', name: '\u00C9quateur c\u00E9leste', color: 'rgba(160,185,215,0.45)' },
      { id: 'navstars', name: '\u00C9toiles de nav.', color: 'rgba(220,235,255,0.7)' },
      { id: 'rua', name: 'Rua (voies d\u2019\u00E9toiles)', color: 'rgba(200,180,130,0.6)', defaultOff: true },
      { id: 'pou', name: 'Pou (piliers c\u00E9lestes)', color: 'rgba(180,210,170,0.6)', defaultOff: true },
      { id: 'solarTime', name: 'Temps solaire',           color: 'rgba(245,229,184,0.7)' },
      // { id: 'neo',   name: '☄ NEO / Comètes', color: 'rgba(140,220,255,0.65)' },  // standby
    ];
    allBodies.forEach(body => {
      const label = document.createElement('label');
      label.className = 'toggle-item';
      label.innerHTML = `<input type="checkbox" id="show-${body.id}"${body.defaultOff ? '' : ' checked'}>
        <span class="toggle-dot" style="color:${body.color}"></span>${body.name}`;
      togglesDiv.appendChild(label);
      const cb = label.querySelector('input')!;
      const handler = (): void => { state.invalidateCheckboxCache(); state.needsRedraw = true; };
      cb.addEventListener('change', handler);
      cleanups.push(() => cb.removeEventListener('change', handler));
    });
  }

  // ── Now button ───────────────────────────────────────────────────
  const nowBtn = document.getElementById('nowBtn');
  if (nowBtn) {
    const handler = (): void => {
      state.currentTime = new Date();
      state.currentJD = null;
      syncDateInput(state);
      state.updateTopTimeDisplay?.();
      state.needsRedraw = true;
    };
    nowBtn.addEventListener('click', handler);
    cleanups.push(() => nowBtn.removeEventListener('click', handler));
  }

  // ── Year jump ────────────────────────────────────────────────────
  const yearJumpBtn = document.getElementById('yearJumpBtn');
  const yearInput = document.getElementById('yearInput') as HTMLInputElement | null;
  if (yearJumpBtn && yearInput) {
    const handler = (): void => {
      const yr = parseInt(yearInput.value);
      if (isNaN(yr)) return;
      // Ancient dates (Julian calendar era): force UTC timezone
      const astroYear = yr < 0 ? yr + 1 : yr;
      const probeJD = calendarToJD(astroYear, 1, 1, 12);
      if (probeJD < GREGORIAN_CUTOVER_JD && state.userTimezone !== 'UTC') {
        state.userTimezone = 'UTC';
      }
      const jump = computeYearJump(yr);
      state.currentJD = jump.currentJD;
      state.currentTime = jump.currentTime;
      state.isRealtime = false;
      syncDateInput(state);
      state.updateTopTimeDisplay?.();
      state.needsRedraw = true;
      yearInput.value = String(yr);
    };
    yearJumpBtn.addEventListener('click', handler);
    cleanups.push(() => yearJumpBtn.removeEventListener('click', handler));

    const keyHandler = (e: KeyboardEvent): void => { if (e.key === 'Enter') yearJumpBtn.click(); };
    yearInput.addEventListener('keydown', keyHandler);
    cleanups.push(() => yearInput.removeEventListener('keydown', keyHandler));
  }

  // ── Datetime jump ────────────────────────────────────────────────
  const jumpBtn = document.getElementById('jumpBtn');
  const dtInp = document.getElementById('datetime-input') as HTMLInputElement | null;
  const calSelect = document.getElementById('calendar-select') as HTMLSelectElement | null;
  if (jumpBtn && dtInp) {
    const handler = (): void => {
      const val = dtInp.value;
      if (!val) return;
      const [datePart, timePart] = val.split('T');
      const [yr, mo, dy] = datePart.split('-').map(Number);
      const [hh, mm] = (timePart || '00:00').split(':').map(Number);
      if (isNaN(yr) || isNaN(mo) || isNaN(dy)) return;

      const isJulian = calSelect?.value === 'julian';
      const jumpJD = isJulian
        ? julianCalendarToJD(yr, mo, dy, hh, mm)
        : calendarToJD(yr, mo, dy, hh, mm);
      // Ancient dates (Julian calendar era): force UTC timezone
      if (jumpJD < GREGORIAN_CUTOVER_JD && state.userTimezone !== 'UTC') {
        state.userTimezone = 'UTC';
      }
      state.currentJD = jumpJD;
      state.currentTime = new Date((state.currentJD - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
      state.isRealtime = false;

      if (yearInput) yearInput.value = String(yr);
      state.updateTopTimeDisplay?.();
      state.needsRedraw = true;
    };
    jumpBtn.addEventListener('click', handler);
    cleanups.push(() => jumpBtn.removeEventListener('click', handler));

    const keyHandler = (e: KeyboardEvent): void => { if (e.key === 'Enter') jumpBtn.click(); };
    dtInp.addEventListener('keydown', keyHandler);
    cleanups.push(() => dtInp.removeEventListener('keydown', keyHandler));
  }

  // ── Timezone selector (in side panel) ────────────────────
  // Inserted after "Time" section, before "Display" section
  const timeSection = dtInp?.closest('.section') as HTMLElement | null;
  if (timeSection) {
    const tzCleanup = buildTimezoneSelect({
      container: timeSection,
      currentTz: state.userTimezone,
      inputId: 'timezone-select',
      onChange: (tz: string) => {
        state.userTimezone = tz;
        state.needsRedraw = true;
        syncDateInput(state);
        updateLongitudeDisplay(state.observerLongitude, state.observerLongitudeApprox);
      },
    });
    cleanups.push(tzCleanup);

    // Longitude display below timezone selector
    const lonDisplay = document.createElement('div');
    lonDisplay.id = 'lon-display';
    lonDisplay.className = 'lon-display';
    const tzSelect = timeSection.querySelector('#timezone-select');
    tzSelect?.closest('.tz-combobox')?.after(lonDisplay);
    updateLongitudeDisplay(state.observerLongitude, state.observerLongitudeApprox);
  }

  // Return cleanup function
  return function cleanup(): void {
    cleanups.forEach(fn => fn());
  };
}

/**
 * Updates datetime-local and year inputs in the side panel.
 */
export function syncDateInput(state: PanelState): void {
  const jd_utc = state.currentJD !== null ? state.currentJD : dateToJD(state.currentTime);
  const ms = (jd_utc - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
  const inRange = ms > -JS_DATE_MAX_MS && ms < JS_DATE_MAX_MS;

  let offsetDays: number;
  if (inRange) {
    // Use the actual offset of the selected timezone
    const d = new Date(ms);
    const tzOffsetMin = getTzOffsetMinutes(d, state.userTimezone);
    offsetDays = -tzOffsetMin / MINUTES_PER_DAY;
  } else {
    offsetDays = 0;
  }

  const { year, month, day, hours, mins } = jdToCalendar(Math.floor(jd_utc + offsetDays + 0.5) - 0.5);

  if (!_cachedYearInputEl) _cachedYearInputEl = document.getElementById('yearInput') as HTMLInputElement | null;
  if (_cachedYearInputEl) _cachedYearInputEl.value = String(year);

  if (!_cachedDatetimeInputEl) _cachedDatetimeInputEl = document.getElementById('datetime-input') as HTMLInputElement | null;
  if (_cachedDatetimeInputEl) {
    if (year >= 1 && year <= 9999) {
      const yStr = String(year).padStart(4, '0');
      const mStr = String(month).padStart(2, '0');
      const dStr = String(day).padStart(2, '0');
      const hStr = String(hours).padStart(2, '0');
      const minStr = String(mins).padStart(2, '0');
      _cachedDatetimeInputEl.value = `${yStr}-${mStr}-${dStr}T${hStr}:${minStr}`;
    } else {
      _cachedDatetimeInputEl.value = '';
    }
  }
}

interface UpdateDateDisplayFn {
  (state: AppState, jd: number, dateDisplayEl: HTMLElement | null): void;
  _deps?: DateDisplayDeps;
  setDeps: (deps: DateDisplayDeps) => void;
}

let _cachedDateDisplayHtml = '';

export const updateDateDisplay: UpdateDateDisplayFn = Object.assign(
  function updateDateDisplay(state: AppState, jd: number, dateDisplayEl: HTMLElement | null): void {
    if (!dateDisplayEl) return;

    const { jdToDateString, jdToLocalDateString, jdToJulianDisplayString } = (updateDateDisplay as UpdateDateDisplayFn)._deps || {} as Partial<DateDisplayDeps>;

    let dateStr: string, localStr: string, julianStr: string | null = null;
    if (state.currentJD !== null && jdToDateString) {
      dateStr = jdToDateString(jd);
      // Pass the selected timezone
      localStr = jdToLocalDateString ? jdToLocalDateString(jd, state.userTimezone) : dateStr;
      julianStr = jdToJulianDisplayString ? jdToJulianDisplayString(jd) : null;
    } else {
      // Real-time mode: uses selected timezone
      const userTz = state.userTimezone;
      dateStr = state.currentTime.toLocaleString('fr-FR', {
        timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      }) + ' UTC';
      localStr = state.currentTime.toLocaleString('fr-FR', {
        timeZone: userTz,
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
      });
    }

    // Selected timezone label (e.g., "Europe/Paris" → "Paris")
    const tzLabel = buildTzLabel(state.userTimezone);

    const newHtml = `
      ${dateStr.replace(' UTC', '<br><span class="top-utc-label">UTC</span>')}
      <div class="date-display-local">
        ${localStr}${julianStr ? ' <span class="top-tz-label">(CAL. GREG)</span>' : ''}<br>
        <span class="top-tz-label">${tzLabel}</span>
      </div>
    `;
    if (newHtml !== _cachedDateDisplayHtml) {
      dateDisplayEl.innerHTML = newHtml;
      _cachedDateDisplayHtml = newHtml;
    }
  },
  {
    _deps: undefined as DateDisplayDeps | undefined,
    setDeps(deps: DateDisplayDeps): void {
      updateDateDisplay._deps = deps;
    },
  },
);

/**
 * Construit un libellé court pour afficher la timezone sélectionnée.
 * Ex: "Europe/Paris" → "PARIS", "UTC" → "UTC", "Pacific/Tahiti" → "TAHITI"
 */
function buildTzLabel(tz: string): string {
  if (!tz || tz === 'UTC') return 'LOCAL / UTC';
  const parts = tz.split('/');
  const city = parts[parts.length - 1].replace(/_/g, ' ');
  return `LOCAL (${city.toUpperCase()})`;
}

/**
 * Builds and inserts a timezone selector in the date modal (overlay).
 */
export function setupOverlayTimezoneSelect(state: PanelState, onChange: () => void): () => void {
  const modalBody = document.querySelector('.date-modal-body') as HTMLElement | null;
  if (!modalBody) return () => {};

  const existing = document.getElementById('overlay-tz-combobox');
  if (existing) existing.remove();

  const wrapper = document.createElement('div');
  wrapper.id = 'overlay-tz-combobox';
  wrapper.className = 'overlay-tz-wrapper';

  const divider = document.createElement('div');
  divider.className = 'date-modal-divider';

  modalBody.appendChild(divider);
  modalBody.appendChild(wrapper);

  const cleanup = buildTimezoneSelect({
    container: wrapper,
    currentTz: state.userTimezone,
    inputId: 'overlay-timezone-select',
    onChange: (tz: string) => {
      state.userTimezone = tz;
      state.needsRedraw = true;
      onChange();
    },
  });

  return () => {
    cleanup();
    if (divider.parentNode) divider.parentNode.removeChild(divider);
    if (wrapper.parentNode) wrapper.parentNode.removeChild(wrapper);
  };
}