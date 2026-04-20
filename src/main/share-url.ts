// ── Share URL: parse GET params + build share link ─────────────────────

import { JULIAN_UNIX_EPOCH, MS_PER_DAY, MINUTES_PER_DAY } from '@/core/constants';
import { calendarToJD, julianCalendarToJD, dateToJD, jdToCalendar } from '@/core/time';
import type { AppState } from '@/core/state';
import type { TimeService } from '@/core/time-service';
import { syncDateInput } from '@/ui/ui-panel';
import { updateEventPanel } from '@/features/seasons';

const URL_DATE_FORMATS = {
  SLASH: '/',
  DASH: '-',
} as const;

const DEFAULT_HOUR = 12;
const DEFAULT_MINUTE = 0;

interface ShareDeps {
  state: AppState;
  timeService: TimeService;
  applyProjection: () => void;
  eventListEl: HTMLElement | null;
}

function parseDateParam(raw: string): { yr: number; mo: number; dy: number } | null {
  if (raw.includes(URL_DATE_FORMATS.SLASH)) {
    const [d, m, y] = raw.split(URL_DATE_FORMATS.SLASH).map(Number);
    return !isNaN(d) && !isNaN(m) && !isNaN(y) ? { yr: y, mo: m, dy: d } : null;
  }
  // Split only on dashes that aren't part of a negative year prefix
  const parts = raw.split(/(?!^)-/).map(Number);
  if (parts.length === 3 && parts.every(n => !isNaN(n))) {
    return { yr: parts[0], mo: parts[1], dy: parts[2] };
  }
  return null;
}

function setJDFromDate(
  yr: number, mo: number, dy: number, hh: number, mm: number,
  calendar: 'gregorian' | 'julian', state: AppState,
): void {
  const astroYear = yr < 0 ? yr + 1 : yr;
  const jd_input = calendar === 'julian'
    ? julianCalendarToJD(astroYear, mo, dy, hh, mm)
    : calendarToJD(astroYear, mo, dy, hh, mm);
  const ms = (jd_input - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
  const tzOffsetMin = getTzOffsetMinutes(new Date(ms), state.userTimezone);
  state.currentJD = jd_input + tzOffsetMin / MINUTES_PER_DAY;
  state.currentTime = new Date((state.currentJD - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
  state.isRealtime = false;
}

function setHemisphereButtons(hem: 'N' | 'S'): void {
  const hemN = document.getElementById('hemN');
  const hemS = document.getElementById('hemS');
  hemN?.classList.toggle('active', hem === 'N');
  hemS?.classList.toggle('active', hem === 'S');
}

// Import getTzOffsetMinutes from time module
import { getTzOffsetMinutes } from '@/core/time';

export function applyUrlParams(deps: ShareDeps): void {
  const { state, timeService, applyProjection, eventListEl } = deps;
  const params = new URLSearchParams(window.location.search);
  const dateParam = params.get('date');
  const heureParam = params.get('heure') ?? params.get('hour');
  const minuteParam = params.get('minute') ?? params.get('min');
  const hemParam = params.get('hem') ?? params.get('hemisphere');
  const calParam = params.get('cal') ?? params.get('calendar');
  const tzParam = params.get('tz') ?? params.get('timezone');

  let changed = false;

  if (tzParam) {
    state.userTimezone = tzParam;
    timeService.invalidate();
    changed = true;
  }

  if (dateParam) {
    const parsed = parseDateParam(dateParam);
    if (parsed) {
      const hh = heureParam ? parseInt(heureParam, 10) : DEFAULT_HOUR;
      const mm = minuteParam ? parseInt(minuteParam, 10) : DEFAULT_MINUTE;
      if (!isNaN(hh) && !isNaN(mm)) {
        const calendar = calParam === 'julian' || calParam === 'Jul' ? 'julian' : 'gregorian';
        setJDFromDate(parsed.yr, parsed.mo, parsed.dy, hh, mm, calendar, state);
        changed = true;
      }
    }
  } else if (heureParam || minuteParam) {
    const hh = heureParam ? parseInt(heureParam, 10) : 0;
    const mm = minuteParam ? parseInt(minuteParam, 10) : 0;
    if (!isNaN(hh) && !isNaN(mm)) {
      const now = new Date();
      now.setHours(hh, mm, 0, 0);
      state.currentTime = now;
      state.currentJD = null;
      state.isRealtime = false;
      changed = true;
    }
  }

  if (hemParam) {
    const hem = hemParam.toUpperCase() as 'N' | 'S';
    if (hem === 'N' || hem === 'S') {
      state.enochHem = hem;
      setHemisphereButtons(hem);
      updateEventPanel(state, eventListEl, state.getAstroJD());
      changed = true;
    }
  }

  if (changed) {
    syncDateInput(state);
    applyProjection();
    state.needsRedraw = true;
  }
}

export function setupShareButton(state: AppState): void {
  const shareBtn = document.getElementById('shareBtn') as HTMLButtonElement | null;
  if (!shareBtn) return;

  let shareToast: HTMLElement | null = null;

  function buildShareUrl(): string {
    const jd = state.currentJD !== null ? state.currentJD : dateToJD(state.currentTime);
    const ms = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
    const tzOffsetMin = getTzOffsetMinutes(new Date(ms), state.userTimezone);
    const jdLocal = jd - tzOffsetMin / MINUTES_PER_DAY;
    const cal = jdToCalendar(jdLocal);
    const hh = String(cal.hours).padStart(2, '0');
    const mm = String(cal.mins).padStart(2, '0');
    const dateStr = `${String(cal.year).padStart(4, '0')}-${String(cal.month).padStart(2, '0')}-${String(cal.day).padStart(2, '0')}`;

    const params = new URLSearchParams();
    params.set('date', dateStr);
    params.set('heure', hh);
    params.set('minute', mm);
    params.set('hem', state.enochHem);
    params.set('tz', state.userTimezone);

    return `${window.location.origin}${window.location.pathname}?${params.toString()}`;
  }

  function showToast(message: string): void {
    if (shareToast) shareToast.remove();
    shareToast = document.createElement('div');
    shareToast.textContent = message;
    shareToast.className = 'share-toast';
    document.body.appendChild(shareToast);
    requestAnimationFrame(() => { if (shareToast) shareToast.style.opacity = '1'; });
    setTimeout(() => {
      if (shareToast) { shareToast.style.opacity = '0'; setTimeout(() => shareToast?.remove(), 200); shareToast = null; }
    }, 2000);
  }

  shareBtn.addEventListener('click', async () => {
    const url = buildShareUrl();
    if (navigator.share) {
      try {
        await navigator.share({ title: 'Calendrier Hénoch', url });
        return;
      } catch {
        // User cancelled or share failed — fall back to clipboard
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      showToast('URL copiée !');
    } catch {
      const input = document.createElement('input');
      input.value = url;
      input.style.position = 'fixed';
      input.style.top = '0';
      input.style.opacity = '0';
      document.body.appendChild(input);
      input.focus();
      input.select();
      input.setSelectionRange(0, 99999);
      try { document.execCommand('copy'); showToast('URL copiée !'); } catch { showToast('Copiez : ' + url); }
      input.remove();
    }
  });
}