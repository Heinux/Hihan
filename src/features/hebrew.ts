import * as Astronomy from 'astronomy-engine';
import { getTzOffsetMinutes } from '@/core/time';
import { TZ_LOCATION_MAP } from '@/data/tz-locations';

const JERUSALEM_LAT = 31.7784;
const JERUSALEM_LON = 35.2066;
const JERUSALEM_ALT = 754;

// Re-export for backward compatibility
export { TZ_LOCATION_MAP } from '@/data/tz-locations';


function getEffectiveObserver(
  lat?: number,
  lng?: number,
  userTz?: string
): Astronomy.Observer {
  let effectiveLat = lat ?? JERUSALEM_LAT;
  let effectiveLng = lng ?? JERUSALEM_LON;

  // Priority: explicit coordinates > timezone > Jerusalem
  if (userTz && lat === undefined && lng === undefined) {
    const loc = TZ_LOCATION_MAP[userTz];
    if (loc) {
      effectiveLat = loc.lat;
      effectiveLng = loc.lng;
    }
  }

  return new Astronomy.Observer(effectiveLat, effectiveLng, JERUSALEM_ALT);
}

/**
 * Compute the sunset time for a given JD in UTC, as a JD in **local** time.
 *
 * The returned value is jdLocal such that comparing it to the local JD
 * of the input tells whether sunset has occurred:
 *   jdLocal >= sunsetLocalJD → new Hebrew day
 *
 * IMPORTANT: SearchRiseSet must be seeded with **local noon expressed in UTC**
 * (i.e. noon at the observer's timezone, converted to UTC). If we use noon UT,
 * timezones far ahead of UTC (e.g. Asia/Hong_Kong at +8) will have their
 * local noon already past, and SearchRiseSet will return the NEXT day's sunset.
 */
// Cache getSunsetJDUTC by day — result only changes per local day
let _sunsetCache: { dayKey: number; lat: number; lng: number; tz: string; result: number } | null = null;

/** Reset sunset cache (for tests) */
export function resetSunsetCache(): void { _sunsetCache = null; }

function getSunsetJDUTC(
  jdUTC: number,
  observer: Astronomy.Observer,
  userTz?: string
): number {
  // Check cache
  const oLat = observer.latitude;
  const oLng = observer.longitude;
  const tz = userTz || '';
  const dayKey = Math.floor(jdUTC + 0.5);
  if (_sunsetCache && _sunsetCache.dayKey === dayKey
      && _sunsetCache.lat === oLat
      && _sunsetCache.lng === oLng
      && _sunsetCache.tz === tz) {
    return _sunsetCache.result;
  }

  const jdn = Math.floor(jdUTC + 0.5);

  // ── Compute local day index and timezone offset ────────────────
  let tzOffsetMin = 0;
  let localDayIndex: number;

  if (userTz) {
    const ms = (jdUTC - 2440587.5) * 86400000;
    const d = new Date(ms);
    tzOffsetMin = getTzOffsetMinutes(d, userTz);
    const tzOffsetDays = -tzOffsetMin / 1440;
    const jdLocal = jdUTC + tzOffsetDays;
    localDayIndex = Math.floor(jdLocal + 0.5);
  } else {
    localDayIndex = jdn;
  }

  // ── Compute local-noon-in-UTC as seed for SearchRiseSet ────────
  // localDayIndex - 0.5 = midnight local in local JD
  // + 0.5 = noon local in local JD
  // + tzOffsetMin / 1440 = noon local in UTC JD
  const noonLocalInUTC_JD = localDayIndex + tzOffsetMin / 1440;
  const noonMs = (noonLocalInUTC_JD - 2440587.5) * 86400000;
  const noonDate = new Date(noonMs);

  // ── Search for sunset ──────────────────────────────────────────
  try {
    const result = Astronomy.SearchRiseSet(
      Astronomy.Body.Sun,
      observer,
      -1,      // direction = set
      noonDate,
      1        // search up to 1 day forward
    );
    if (result) {
      const sunsetJD = result.date.getTime() / 86400000 + 2440587.5;
      // Convert sunset UTC → sunset local JD
      let retVal: number;
      if (userTz) {
        const sunsetTzOff = getTzOffsetMinutes(new Date(result.date.getTime()), userTz);
        retVal = sunsetJD - sunsetTzOff / 1440;
      } else {
        retVal = sunsetJD;
      }
      _sunsetCache = { dayKey, lat: oLat, lng: oLng, tz, result: retVal };
      return retVal;
    }
  } catch (e) {
    console.warn('[hebrew] Astronomy.SearchRiseSet failed', e);
  }

  // ── Fallback: approximate sunset at 16:00 local ────────────────
  let fallback: number;
  if (userTz) {
    fallback = localDayIndex - 0.5 + 16 / 24;
  } else {
    fallback = jdn - 0.5 + 16 / 24;
  }
  _sunsetCache = { dayKey, lat: oLat, lng: oLng, tz, result: fallback };
  return fallback;
}


const MONTH_NAMES: string[] = ['', 'Tishri', 'Heshvan', 'Kislev', 'Tevet', 'Shevat',
  'Adar', 'Nissan', 'Iyar', 'Sivan', 'Tammouz', 'Av', 'Eloul'];

export interface HebrewResult {
  day: number;
  month: number;
  monthLength: number;
  hebrewYear: number;
  monthName: string;
}

// ── Embolismic year (Metonic cycle: positions 3,6,8,11,14,17,19) ─

function isEmb(y: number): boolean {
  const p = ((y - 1) % 19) + 1;
  return p === 3 || p === 6 || p === 8 || p === 11 || p === 14 || p === 17 || p === 19;
}

// ── Mathematical calculation of Rosh Hashana (from Year 1) ──────

/**
 * Computes the total number of months elapsed since Creation to the start of year y.
 */
function getElapsedMonths(y: number): number {
  const ym1 = y - 1;
  const cycles = Math.floor(ym1 / 19);
  const yearsInCycle = ym1 % 19;
  return cycles * 235 + Math.floor((yearsInCycle * 235) / 19);
}

/**
 * Computes the Julian Day Number (JDN) of 1 Tishri (Rosh Hashana) for any Hebrew year >= 1.
 */
function getRoshHashanaJDN(y: number): number {
  const M = getElapsedMonths(y);
  
  // 1 month = 29 days, 12 hours, 793 parts
  // Total parts = 29 * 25920 + 12 * 1080 + 793 = 765433 parts
  // Tohu (Molad of year 1) = Monday (day 2, Sunday=1), 5 hours, 204 parts.
  // In elapsed parts from Sunday 18:00 (start of week) = 1 * 25920 + 5 * 1080 + 204 = 31524.
  const totalParts = 31524 + M * 765433;
  
  const d = Math.floor(totalParts / 25920); // Days elapsed
  const t = totalParts % 25920;             // Hours/parts remaining in day
  let dw = d % 7;                           // Day of week (0 = Sunday, 1 = Monday, etc.)

  let delay = 0;
  let isZaken = false;

  // Rule 2: Molad Zaken (New moon after noon -> pushed to next day)
  // 18 hours * 1080 = 19440
  if (t >= 19440) {
    delay = 1;
    dw = (dw + 1) % 7;
    isZaken = true;
  }

  // Apply other postponement rules (Dehiyyot)
  if (dw === 0 || dw === 3 || dw === 5) {
    // Rule 1: ADU (No Rosh Hashana on Sunday, Wednesday, or Friday)
    delay += 1;
  } else if (dw === 2 && t >= 9924 && !isEmb(y) && !isZaken) {
    // Rule 3: GaTRaD (Tuesday, >= 9h 204p, common year) -> Pushed to Thursday
    delay += 2;
  } else if (dw === 1 && t >= 16789 && isEmb(y - 1) && !isZaken) {
    // Rule 4: BeTUTKaP (Monday, >= 15h 589p, following embolismic year) -> Pushed to Tuesday
    delay += 1;
  }

  // JDN 347998 corresponds to the Sunday preceding year 1.
  return d + delay + 347997;
}

// ── Find Hebrew year from JDN dynamically ─────────────────────────

function findYear(jdn: number): number {
  // Estimate year based on average year of 365.2468 days
  // 347998 is the anchor JDN for creation
  const estimatedYear = Math.floor((jdn - 347998) / 365.2468) + 1;
  
  if (estimatedYear < 1) return 1;

  const rh = getRoshHashanaJDN(estimatedYear);
  if (jdn < rh) {
    return estimatedYear - 1;
  }
  
  const rhNext = getRoshHashanaJDN(estimatedYear + 1);
  if (jdn >= rhNext) {
    return estimatedYear + 1;
  }
  
  return estimatedYear;
}

// ── Build year structure ──────────────────────────────────────────

interface HYInfo {
  year: number; jdn: number; len: number; leap: boolean;
  months: { n: number; day: number; len: number }[];
}

function buildHY(y: number): HYInfo {
  const j = getRoshHashanaJDN(y);
  const jn = getRoshHashanaJDN(y + 1);
  const len = jn - j;
  const lp = isEmb(y);
  let hv: number, kv: number;
  
  if (lp) {
    if (len <= 383) { hv = 29; kv = 29; }
    else if (len <= 384) { hv = 29; kv = 30; }
    else { hv = 30; kv = 30; }
  } else {
    if (len <= 353) { hv = 29; kv = 29; }
    else if (len <= 354) { hv = 29; kv = 30; }
    else { hv = 30; kv = 30; }
  }
  
  const md = lp
    ? [30, hv, kv, 29, 30, 30, 29, 30, 29, 30, 29, 30, 29]
    : [30, hv, kv, 29, 30, 29, 30, 29, 30, 29, 30, 29];
    
  let cum = 0;
  const ms = md.map((l, i) => { 
    const n = i + 1; 
    const info = { n, day: cum, len: l }; 
    cum += l; 
    return info; 
  });
  
  return { year: y, jdn: j, len, leap: lp, months: ms };
}

// ── Main export ───────────────────────────────────────────────────

let _hebrewCache: { jdn: number; result: HebrewResult } | null = null;

/**
 * Computes Hebrew calendar data for a given Julian Date.
 *
 * @param jdUTC - Julian Date in UTC
 * @param tzOffsetMinutes - Timezone offset in minutes (default 0, kept for backwards compatibility)
 * @param lat - Latitude override (optional)
 * @param lng - Longitude override (optional)
 * @param userTz - User's IANA timezone (optional)
 * @returns HebrewResult with day, month, year, etc.
 */
export function computeHebrewFromJD(
  jdUTC: number,
  tzOffsetMinutes: number = 0,   // kept for backwards compatibility
  lat?: number,
  lng?: number,
  userTz?: string
): HebrewResult {
  const observer = getEffectiveObserver(lat, lng, userTz);
  const sunsetJD = getSunsetJDUTC(jdUTC, observer, userTz);

  let jdLocal = jdUTC;
  if (userTz) {
    const ms = (jdUTC - 2440587.5) * 86400000;
    const d = new Date(ms);
    const tzOff = getTzOffsetMinutes(d, userTz);
    jdLocal = jdUTC - tzOff / 1440;
  } else if (tzOffsetMinutes !== 0) {
    jdLocal = jdUTC - tzOffsetMinutes / 1440;
  }

  const localDayIndex = Math.floor(jdLocal + 0.5);
  const localDayFraction = jdLocal - (localDayIndex - 0.5);
  const sunsetDayFraction = sunsetJD - (localDayIndex - 0.5);
  const jdnHebrew = localDayFraction >= sunsetDayFraction ? localDayIndex + 1 : localDayIndex;

  if (_hebrewCache && _hebrewCache.jdn === jdnHebrew) return _hebrewCache.result;

  const y = findYear(jdnHebrew);
  const hy = buildHY(y);
  const doy = jdnHebrew - hy.jdn + 1;

  const toBiblical = hy.leap
    ? [0, 7, 8, 9, 10, 11, 12, 13, 1, 2, 3, 4, 5, 6]
    : [0, 7, 8, 9, 10, 11, 12,  1, 2, 3, 4, 5, 6];

  let result: HebrewResult;
  if (doy < 1 || doy > hy.len) {
    result = { day: 1, month: 1, monthLength: 30, hebrewYear: y, monthName: 'Tishri' };
  } else {
    result = { day: 1, month: 7, monthLength: 30, hebrewYear: y, monthName: 'Tishri' };
    for (const mi of hy.months) {
      if (doy <= mi.day + mi.len) {
        const day = doy - mi.day;
        let name = MONTH_NAMES[mi.n];
        if (mi.n === 6 && hy.leap) name = 'Adar I';
        if (mi.n === 7 && hy.leap) name = 'Adar II';
        result = { day, month: toBiblical[mi.n], monthLength: mi.len, hebrewYear: y, monthName: name };
        break;
      }
    }
  }

  _hebrewCache = { jdn: jdnHebrew, result };
  return result;
}