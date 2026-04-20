import * as Astronomy from 'astronomy-engine';
import {
  J2000_EPOCH,
  JULIAN_UNIX_EPOCH,
  MS_PER_DAY,
  JS_DATE_MAX_MS,
  MINUTES_PER_DAY,
  HOURS_PER_DAY,
  DAYS_PER_YEAR,
  MS_PER_HOUR,
  MS_PER_MINUTE,
  GREGORIAN_CUTOVER_JD,
  MONTH_NAMES_FR,
  JULIAN_CENTURY_DAYS,
  SECONDS_PER_DAY,
  AVG_MONTH_DAYS,
} from '@/core/constants';
import type { AppState } from '@/core/state';

export interface CalendarDate {
  year: number;
  month: number;
  day: number;
  hours: number;
  mins: number;
}

interface ComputedData {
  jd: number;
  T: number;
}

function calendarFromZ(Z: number, F: number, useGregorian: boolean): CalendarDate {
  let A: number;
  // Apply Gregorian correction when useGregorian is true, for ALL dates.
  // The alpha formula with negative values for pre-1582 dates correctly
  // inverts calendarToJD's proleptic Gregorian formula.
  if (useGregorian) {
    const alpha: number = Math.floor((Z - 1867216.25) / 36524.25);
    A = Z + 1 + alpha - Math.floor(alpha / 4);
  } else {
    A = Z;
  }
  const B: number = A + 1524;
  const C: number = Math.floor((B - 122.1) / 365.25);
  const D: number = Math.floor(365.25 * C);
  const E: number = Math.floor((B - D) / 30.6001);
  const day: number = B - D - Math.floor(30.6001 * E);
  const month: number = E < 14 ? E - 1 : E - 13;
  const year: number = month > 2 ? C - 4716 : C - 4715;
  const totalMinutes: number = Math.round(F * 24 * 60);
  const hours: number = Math.floor(totalMinutes / 60) % 24;
  const mins: number = totalMinutes % 60;
  return { year, month, day, hours, mins };
}

/**
 * Converts Julian Date to Gregorian calendar date.
 *
 * @param jd - Julian Date
 * @returns Calendar date with year, month, day, hours, mins
 */
export function jdToCalendar(jd: number): CalendarDate {
  const jdp: number = jd + 0.5;
  const Z: number = Math.floor(jdp);
  const F: number = jdp - Z;
  return calendarFromZ(Z, F, true);
}

/**
 * Converts Julian Date to Julian calendar date.
 *
 * @param jd - Julian Date
 * @returns Calendar date with year, month, day, hours, mins
 */
export function jdToJulianCalendar(jd: number): CalendarDate {
  const jdp: number = jd + 0.5;
  const Z: number = Math.floor(jdp);
  const F: number = jdp - Z;
  return calendarFromZ(Z, F, false);
}

/**
 * Formats an astronomical year (handles negative years for BCE).
 *
 * @param year - Astronomical year (year 0 = 1 BCE, year -1 = 2 BCE, etc.)
 * @returns Formatted year string
 */
export function formatAstroYear(year: number): string {
  return year <= 0 ? `-${Math.abs(year - 1)}` : `${year}`;
}


/**
 * Converts a Gregorian calendar date to Julian Date.
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @param day - Day
 * @param hours - Hours (default 0)
 * @param mins - Minutes (default 0)
 * @returns Julian Date
 */
export function calendarToJD(year: number, month: number, day: number, hours: number = 0, mins: number = 0): number {
  let Y: number = year, M: number = month;
  const D: number = day + (hours + mins / 60) / 24;
  if (M <= 2) { Y--; M += 12; }
  const A: number = Math.floor(Y / 100);
  const B: number = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D + B - 1524.5;
}

/**
 * Converts a Julian calendar date to Julian Date.
 *
 * @param year - Year
 * @param month - Month (1-12)
 * @param day - Day
 * @param hours - Hours (default 0)
 * @param mins - Minutes (default 0)
 * @returns Julian Date
 */
export function julianCalendarToJD(year: number, month: number, day: number, hours: number = 0, mins: number = 0): number {
  let Y: number = year, M: number = month;
  const D: number = day + (hours + mins / 60) / 24;
  if (M <= 2) { Y--; M += 12; }
  return Math.floor(365.25 * (Y + 4716)) + Math.floor(30.6001 * (M + 1)) + D - 1524.5;
}

/**
 * Converts a JavaScript Date object to Julian Date.
 *
 * @param d - JavaScript Date object
 * @returns Julian Date
 */
export function dateToJD(d: Date): number {
  return d.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
}

/**
 * Result of a year jump operation.
 */
export interface JumpResult {
  currentJD: number | null;
  currentTime: Date;
}

/**
 * Computes the target state for a year jump.
 *
 * @param yr - Target year (supports years outside JS Date range)
 * @returns Jump result with either currentJD or currentTime set
 */
export function computeYearJump(yr: number): JumpResult {
  if (yr >= 1 && yr <= 9999) {
    return {
      currentJD: null,
      currentTime: new Date(`${String(yr).padStart(4, '0')}-01-01T12:00:00Z`),
    };
  }
  let astroYear: number = yr;
  if (yr < 0) astroYear = yr + 1;
  else if (yr === 0) astroYear = 0;
  const jd: number = calendarToJD(astroYear, 1, 1, 12);
  return {
    currentJD: jd,
    currentTime: new Date((jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY),
  };
}

/**
 * Formats a Julian Date as a UTC date string.
 *
 * @param jd - Julian Date
 * @returns Formatted date string in UTC
 */
export function jdToDateString(jd: number): string {
  const { year, month, day, hours, mins }: CalendarDate = jdToCalendar(jd);
  const yearStr: string = formatAstroYear(year);
  return `${String(day).padStart(2, '0')} ${MONTH_NAMES_FR[month]} ${yearStr} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')} UTC`;
}



/**
 * Converts Julian Date to local date string in the given timezone.
 *
 * For dates outside JS range (very distant dates), uses basic UTC calculation.
 *
 * @param jd - Julian Date
 * @param tz - IANA timezone (e.g. "Europe/Paris"). Default: system timezone.
 * @returns Formatted local date string
 */
export function jdToLocalDateString(jd: number, tz?: string): string {
  const ms: number = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
  const inRange: boolean = ms > -JS_DATE_MAX_MS && ms < JS_DATE_MAX_MS;

  // For dates outside JS range, timezone cannot be applied:
  // display in UTC via direct Julian calculation.
  if (!inRange) {
    const { year, month, day, hours, mins }: CalendarDate = jdToCalendar(jd);
    const yearStr: string = year <= 0 ? `-${Math.abs(year - 1)}` : `${year}`;
    return `${String(day).padStart(2, '0')} ${MONTH_NAMES_FR[month]} ${yearStr} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }

  const d = new Date(ms);
  const userTz = tz || Intl.DateTimeFormat().resolvedOptions().timeZone;

  try {
    // Use Intl API to convert to the correct timezone
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: userTz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      era: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(d);

    const p: Record<string, string> = {};
    parts.forEach(({ type, value }) => { p[type] = value; });

    // Short month in fr-FR: "janv.", "fevr.", etc. — harmonize with MONTH_NAMES_FR by retrieving month via local date in tz
    const isBCE = p.era === 'av. J.-C.';
    const localYear = isBCE ? 1 - parseInt(p.year ?? '0') : parseInt(p.year ?? '0');
    const localMonth = getMonthInTz(d, userTz); // 1-based
    const localDay = parseInt(p.day ?? '0');
    const localHour = (p.hour ?? '00').replace(':', '').padStart(2, '0').slice(0, 2);
    const localMin = (p.minute ?? '00').replace(':', '').padStart(2, '0').slice(0, 2);

    const yearStr = localYear <= 0 ? `-${Math.abs(localYear - 1)}` : `${localYear}`;
    return `${String(localDay).padStart(2, '0')} ${MONTH_NAMES_FR[localMonth]} ${yearStr} ${localHour}:${localMin}`;
  } catch {
    // Fallback if timezone is not recognized — use UTC
    const { year, month, day, hours, mins }: CalendarDate = jdToCalendar(jd);
    const yearStr: string = year <= 0 ? `-${Math.abs(year - 1)}` : `${year}`;
    return `${String(day).padStart(2, '0')} ${MONTH_NAMES_FR[month]} ${yearStr} ${String(hours).padStart(2, '0')}:${String(mins).padStart(2, '0')}`;
  }
}

/**
 * Returns the month number (1-12) for a date in a given IANA timezone.
 *
 * @param d - JavaScript Date object
 * @param tz - IANA timezone identifier
 * @returns Month number (1-12)
 */
export function getMonthInTz(d: Date, tz: string): number {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, month: 'numeric' }).formatToParts(d);
    const monthPart = parts.find(p => p.type === 'month');
    return monthPart ? parseInt(monthPart.value) : d.getUTCMonth() + 1;
  } catch {
    return d.getUTCMonth() + 1;
  }
}

/**
 * Returns the timezone offset in minutes for an IANA timezone on a given date.
 * Positive = behind UTC, negative = ahead of UTC (same convention as getTimezoneOffset).
 * Returns 0 (UTC) for dates outside JS range or on error.
 * Handles years < 1000 correctly (issue with Date constructor and 2-digit years).
 *
 * @param d - JavaScript Date object
 * @param tz - IANA timezone identifier
 * @returns Offset in minutes
 */
export function getTzOffsetMinutes(d: Date, tz: string): number {
  if (isNaN(d.getTime())) return 0;
  try {
    const utcMs = d.getTime();

    const pTz = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
    const pt: Record<string, string> = {};
    pTz.forEach(({ type, value }) => { pt[type] = value; });

    const tzYear = parseInt(pt.year);
    const tzMonth = parseInt(pt.month) - 1;
    const tzDay = parseInt(pt.day);
    const tzHours = parseInt(pt.hour);
    const tzMinutes = parseInt(pt.minute);

    // Create a UTC date for the timezone using setUTCFullYear to avoid
    // JavaScript's interpretation of years 0-99 as 1900-1999
    const tzDate = new Date(0);
    tzDate.setUTCFullYear(tzYear, tzMonth, tzDay);
    tzDate.setUTCHours(tzHours, tzMinutes, 0, 0);

    const rawOffset = Math.round((utcMs - tzDate.getTime()) / 60000);

    // Intl.DateTimeFormat can return slightly off offsets for historical dates
    // (e.g. 599 instead of 600 for Tahiti). Snap to nearest hour when the offset
    // is not already a standard fractional offset (multiple of 15 min).
    const nearestHour = Math.round(rawOffset / 60) * 60;
    const isStandardFractional = (rawOffset % 15) === 0;
    if (!isStandardFractional && Math.abs(rawOffset - nearestHour) <= 2) {
      return nearestHour;
    }
    return rawOffset;
  } catch {
    return 0;
  }
}

/**
 * Formats a Julian Date as a Julian calendar display string.
 * Returns null if the date is after the Gregorian reform.
 *
 * @param jd - Julian Date
 * @returns Formatted Julian calendar string, or null if after Gregorian reform
 */
export function jdToJulianDisplayString(jd: number): string | null {
  if (jd >= GREGORIAN_CUTOVER_JD) return null;
  const jul: CalendarDate = jdToJulianCalendar(jd);
  const yearStr: string = jul.year <= 0 ? `-${Math.abs(jul.year - 1)} ` : `${jul.year}`;
  return `${String(jul.day).padStart(2, '0')} ${MONTH_NAMES_FR[jul.month]} ${yearStr}`;
}

/**
 * Extracts the year from a Julian Date.
 *
 * @param jd - Julian Date
 * @returns Year number
 */
export function getYearFromJD(jd: number): number {
  return jdToCalendar(jd).year;
}

/**
 * Advances time by the configured time step.
 *
 * @param state - AppState with timeStepUnit and timeStepVal configured
 */
/**
 * Returns the delta in days for one step of the current time settings.
 * Used for smooth fractional advancement in the draw loop.
 */
export function advanceTimeDeltaDays(state: AppState): number {
  if (state.timeStepUnit === 'sec')       return state.timeStepVal / SECONDS_PER_DAY;
  if (state.timeStepUnit === 'min')       return state.timeStepVal / MINUTES_PER_DAY;
  if (state.timeStepUnit === 'hour')      return state.timeStepVal / HOURS_PER_DAY;
  if (state.timeStepUnit === 'day')        return state.timeStepVal;
  if (state.timeStepUnit === 'month')     return state.timeStepVal * AVG_MONTH_DAYS;
  if (state.timeStepUnit === 'year')      return state.timeStepVal * DAYS_PER_YEAR;
  return 0;
}

export function advanceTime(state: AppState): void {
  if (state.currentJD !== null) {
    let deltaDays: number;
    if (state.timeStepUnit === 'sec')       deltaDays = state.timeStepVal / SECONDS_PER_DAY;
    else if (state.timeStepUnit === 'min')   deltaDays = state.timeStepVal / MINUTES_PER_DAY;
    else if (state.timeStepUnit === 'hour')  deltaDays = state.timeStepVal / HOURS_PER_DAY;
    else if (state.timeStepUnit === 'day')    deltaDays = state.timeStepVal;
    else if (state.timeStepUnit === 'month') deltaDays = state.timeStepVal * AVG_MONTH_DAYS;
    else if (state.timeStepUnit === 'year')  deltaDays = state.timeStepVal * DAYS_PER_YEAR;
    else deltaDays = 0;
    state.currentJD += deltaDays;
  } else {
    let ms: number;
    if (state.timeStepUnit === 'sec')       ms = state.timeStepVal * 1000;
    else if (state.timeStepUnit === 'min')  ms = state.timeStepVal * MS_PER_MINUTE;
    else if (state.timeStepUnit === 'hour') ms = state.timeStepVal * MS_PER_HOUR;
    else if (state.timeStepUnit === 'day')  ms = state.timeStepVal * MS_PER_DAY;
    else if (state.timeStepUnit === 'month') ms = state.timeStepVal * AVG_MONTH_DAYS * MS_PER_DAY;
    else if (state.timeStepUnit === 'year') ms = state.timeStepVal * DAYS_PER_YEAR * MS_PER_DAY;
    else ms = 0;
    state.currentTime = new Date(state.currentTime.getTime() + ms);
  }
}

let _cachedComputedJD: number | null = null;
let _cachedComputedResult: ComputedData | null = null;

/**
 * Returns cached computed data (JD and T) for the current state.
 *
 * @param state - AppState
 * @returns Object with jd and T (Julian centuries from J2000.0)
 */
export function getComputedData(state: AppState): ComputedData {
  const jd: number = state.getAstroJD();
  if (_cachedComputedJD === jd && _cachedComputedResult !== null) {
    return _cachedComputedResult;
  }
  const T: number = (jd - J2000_EPOCH) / JULIAN_CENTURY_DAYS;
  _cachedComputedJD = jd;
  _cachedComputedResult = { jd, T };
  return _cachedComputedResult;
}

/**
 * Creates an Astronomy.AstroTime object if the current state is valid.
 *
 * @param state - AppState
 * @returns AstroTime object or null if invalid
 */
export function getAstroTimeIfValid(state: AppState): Astronomy.AstroTime | null {
  if (state.currentJD !== null) {
    const ms: number = (state.getAstroJD() - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
    if (ms > -JS_DATE_MAX_MS && ms < JS_DATE_MAX_MS) {
      try {
        return new Astronomy.AstroTime(new Date(ms));
      } catch (e: unknown) {
        const msg: string = e instanceof Error ? e.message : String(e);
        console.warn('[time] AstroTime creation failed for JD mode:', msg);
      }
    }
    return null;
  }
  try {
    return new Astronomy.AstroTime(state.currentTime);
  } catch (e: unknown) {
    const msg: string = e instanceof Error ? e.message : String(e);
    console.warn('[time] AstroTime creation failed:', msg);
    return null;
  }
}