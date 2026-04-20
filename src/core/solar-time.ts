import * as Astronomy from 'astronomy-engine';
import { TZ_LOCATION_MAP } from '@/data/tz-locations';
import { getTzOffsetMinutes } from '@/core/time';

/**
 * Derive observer longitude from an IANA timezone string.
 * Looks up TZ_LOCATION_MAP first; falls back to deriving from UTC offset.
 *
 * @returns longitude in degrees East and whether it's approximate
 */
export function getLongitudeForTimezone(tz: string, refDate: Date = new Date()): {
  lng: number; lat: number; approx: boolean;
} {
  const loc = TZ_LOCATION_MAP[tz];
  if (loc) return { lng: loc.lng, lat: loc.lat, approx: false };

  // Fallback: derive longitude from UTC offset
  const offsetMin = getTzOffsetMinutes(refDate, tz);
  const lng = -offsetMin / 4; // 1 hour = 15 degrees, offsetMin/60*15 = offsetMin/4
  return { lng, lat: 0, approx: true };
}

/**
 * Compute Local Sidereal Time from GMST and observer longitude.
 *
 * @param gmstHours - Greenwich Mean Sidereal Time in hours
 * @param longitudeDeg - Observer longitude in degrees East
 * @returns Local Sidereal Time in hours [0, 24)
 */
export function computeLST(gmstHours: number, longitudeDeg: number): number {
  let lst = gmstHours + longitudeDeg / 15;
  lst = ((lst % 24) + 24) % 24;
  return lst;
}

/**
 * Compute the Sun's hour angle at the observer's meridian.
 *
 * @param lstHours - Local Sidereal Time in hours
 * @param sunRAHours - Sun's right ascension in hours
 * @returns Hour angle in hours [0, 24)
 */
export function computeSunHA(lstHours: number, sunRAHours: number): number {
  let ha = lstHours - sunRAHours;
  ha = ((ha % 24) + 24) % 24;
  return ha;
}

/**
 * Compute Local Apparent Solar Time (LAST) from the Sun's hour angle.
 * When the Sun is at the meridian (HA=0), LAST = 12h (solar noon).
 *
 * @param sunHAHours - Sun's hour angle in hours
 * @returns Local Apparent Solar Time in hours [0, 24)
 */
export function computeLAST(sunHAHours: number): number {
  let last = sunHAHours + 12;
  last = ((last % 24) + 24) % 24;
  return last;
}

/**
 * Compute the Equation of Time.
 *
 * EoT = Apparent Solar Time - Mean Solar Time
 * Positive EoT means the sundial is ahead of the clock.
 *
 * @param lastHours - Local Apparent Solar Time in hours
 * @param utcHours - Current UTC hours (fractional)
 * @param longitudeDeg - Observer longitude in degrees East
 * @returns Equation of Time in minutes (typically -17 to +14)
 */
export function computeEOT(lastHours: number, utcHours: number, longitudeDeg: number): number {
  const localMeanTime = utcHours + longitudeDeg / 15;
  let diff = lastHours - localMeanTime;
  // Normalize to [-12, 12] before converting to minutes
  if (diff > 12) diff -= 24;
  if (diff < -12) diff += 24;
  return diff * 60;
}

/**
 * Format solar time as "HHh MM".
 *
 * @param hours - Solar time in hours [0, 24)
 * @returns Formatted string, e.g. "14h 32"
 */
export function formatSolarTime(hours: number): string {
  const h = Math.floor(hours);
  const m = Math.floor((hours - h) * 60);
  return `${h}h ${String(m).padStart(2, '0')}`;
}

/**
 * Format Equation of Time value.
 *
 * @param minutes - EoT in minutes
 * @returns Formatted string, e.g. "+4m 12s" or "-14m 48s"
 */
export function formatEOT(minutes: number): string {
  const sign = minutes >= 0 ? '+' : '-';
  const absMin = Math.abs(minutes);
  const m = Math.floor(absMin);
  const s = Math.round((absMin - m) * 60);
  if (s === 60) return `${sign}${m + 1}m 00s`;
  return `${sign}${m}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Find solar noon (Sun transit at HA=0) for a given observer and date.
 * Uses astronomy-engine's iterative SearchHourAngle solver.
 * Returns null if the date is out of JS Date range or search fails.
 */
export function findSolarNoon(
  observer: Astronomy.Observer,
  dateStart: Date
): Date | null {
  try {
    const result = Astronomy.SearchHourAngle(
      Astronomy.Body.Sun,
      observer,
      0,
      dateStart
    );
    return result?.time?.date ?? null;
  } catch {
    return null;
  }
}

/**
 * Format a JS Date as local civil time "HHh MM" using the given timezone.
 */
export function formatCivilTimeInTz(date: Date, tz: string): string {
  try {
    const parts = new Intl.DateTimeFormat('fr-FR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).formatToParts(date);
    const h = parts.find(p => p.type === 'hour')?.value ?? '12';
    const m = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `${h}h ${m}`;
  } catch {
    return '--h --';
  }
}

// ── Solar noon cache (once per local day) ────────────────────────────

interface SolarNoonCacheEntry {
  localDayIndex: number;
  longitude: number;
  noonDate: Date | null;
}

let _solarNoonCache: SolarNoonCacheEntry | null = null;

/**
 * Get solar noon for the current local day, cached per day/longitude.
 *
 * @param jdUTC - Current Julian Date (UTC)
 * @param tzOffsetMinutes - Timezone offset in minutes
 * @param longitudeDeg - Observer longitude in degrees East
 * @param latitudeDeg - Observer latitude in degrees
 * @returns Solar noon as a JS Date, or null if unavailable
 */
export function getCachedSolarNoon(
  jdUTC: number,
  tzOffsetMinutes: number,
  longitudeDeg: number,
  latitudeDeg: number
): Date | null {
  const jdLocal = jdUTC - tzOffsetMinutes / 1440;
  const localDayIndex = Math.floor(jdLocal + 0.5);

  if (_solarNoonCache
      && _solarNoonCache.localDayIndex === localDayIndex
      && _solarNoonCache.longitude === longitudeDeg) {
    return _solarNoonCache.noonDate;
  }

  // Seed search from local noon expressed in UTC
  const noonLocalInUTC_JD = localDayIndex + tzOffsetMinutes / 1440;
  const noonMs = (noonLocalInUTC_JD - 2440587.5) * 86400000;
  const noonDate = new Date(noonMs);

  if (isNaN(noonDate.getTime())) {
    _solarNoonCache = { localDayIndex, longitude: longitudeDeg, noonDate: null };
    return null;
  }

  const observer = new Astronomy.Observer(latitudeDeg, longitudeDeg, 0);
  const result = findSolarNoon(observer, noonDate);

  _solarNoonCache = { localDayIndex, longitude: longitudeDeg, noonDate: result };
  return result;
}

/** Reset solar noon cache (for tests) */
export function resetSolarNoonCache(): void { _solarNoonCache = null; }

// ── Lunar time ────────────────────────────────────────────────────────

/**
 * Compute lunar time from the Moon's hour angle.
 * When the Moon is at the meridian (HA=0), lunar time = 12h (lunar noon).
 */
export function computeLunarTime(moonHAHours: number): number {
  let lt = moonHAHours + 12;
  lt = ((lt % 24) + 24) % 24;
  return lt;
}

/**
 * Compute the Moon's hour angle at the observer's meridian.
 */
export function computeMoonHA(lstHours: number, moonRAHours: number): number {
  let ha = lstHours - moonRAHours;
  ha = ((ha % 24) + 24) % 24;
  return ha;
}

/**
 * Compute the daily lunar shift (how much lunar time slips vs solar time).
 * The lunar day is ~24h 50min, so the shift is ~50 min/day.
 * Measured as the difference between the Moon's transit time today vs yesterday.
 *
 * @param todayTransit - Today's lunar transit time in hours (civil)
 * @param yesterdayTransit - Yesterday's lunar transit time in hours (civil)
 * @returns Daily shift in minutes (positive = lunar clock drifts later)
 */
export function computeLunarShift(todayTransitHours: number, yesterdayTransitHours: number): number {
  let diff = todayTransitHours - yesterdayTransitHours;
  // Normalize: the shift is typically +0.5h to +1.1h per day
  if (diff < 0) diff += 24;
  if (diff > 24) diff -= 24;
  return diff * 60;
}

/**
 * Find lunar transit (Moon at HA=0) for a given observer and date.
 * Returns null if the date is out of JS Date range or search fails.
 */
export function findLunarTransit(
  observer: Astronomy.Observer,
  dateStart: Date
): Date | null {
  try {
    const result = Astronomy.SearchHourAngle(
      Astronomy.Body.Moon,
      observer,
      0,
      dateStart
    );
    return result?.time?.date ?? null;
  } catch {
    return null;
  }
}

// ── Lunar transit cache (once per local day) ───────────────────────────

interface LunarTransitCacheEntry {
  localDayIndex: number;
  longitude: number;
  transitDate: Date | null;
  prevTransitDate: Date | null;
}

let _lunarTransitCache: LunarTransitCacheEntry | null = null;

/**
 * Get lunar transit for the current local day, cached per day/longitude.
 * Also returns the previous day's transit for computing the daily shift.
 */
export function getCachedLunarTransit(
  jdUTC: number,
  tzOffsetMinutes: number,
  longitudeDeg: number,
  latitudeDeg: number
): { transit: Date | null; prevTransit: Date | null } {
  const jdLocal = jdUTC - tzOffsetMinutes / 1440;
  const localDayIndex = Math.floor(jdLocal + 0.5);

  if (_lunarTransitCache
      && _lunarTransitCache.localDayIndex === localDayIndex
      && _lunarTransitCache.longitude === longitudeDeg) {
    return { transit: _lunarTransitCache.transitDate, prevTransit: _lunarTransitCache.prevTransitDate };
  }

  // Seed search from local midnight expressed in UTC
  const midnightLocalInUTC_JD = localDayIndex - 0.5 + tzOffsetMinutes / 1440;
  const midnightMs = (midnightLocalInUTC_JD - 2440587.5) * 86400000;
  const midnightDate = new Date(midnightMs);

  if (isNaN(midnightDate.getTime())) {
    _lunarTransitCache = { localDayIndex, longitude: longitudeDeg, transitDate: null, prevTransitDate: null };
    return { transit: null, prevTransit: null };
  }

  const observer = new Astronomy.Observer(latitudeDeg, longitudeDeg, 0);
  const transit = findLunarTransit(observer, midnightDate);

  // Find previous day's transit for shift calculation
  const prevMidnightMs = midnightMs - 86400000;
  const prevMidnightDate = new Date(prevMidnightMs);
  const prevTransit = isNaN(prevMidnightDate.getTime()) ? null : findLunarTransit(observer, prevMidnightDate);

  _lunarTransitCache = { localDayIndex, longitude: longitudeDeg, transitDate: transit, prevTransitDate: prevTransit };
  return { transit, prevTransit };
}

/** Reset lunar transit cache (for tests) */
export function resetLunarTransitCache(): void { _lunarTransitCache = null; }