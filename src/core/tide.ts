import * as Astronomy from 'astronomy-engine';

// ── Constants ────────────────────────────────────────────────────────

export const MEAN_MOON_DIST_AU = 0.00257;   // 384400 km / 149597870.7 km
export const MEAN_SUN_DIST_AU = 1.0;
export const LUNAR_TIDE_AMPLITUDE_M = 0.358; // mean equilibrium lunar semidiurnal amplitude (m)
export const SOLAR_TIDE_AMPLITUDE_M = 0.164; // mean equilibrium solar amplitude (m)
const DEG2RAD = Math.PI / 180;

// ── Types ──────────────────────────────────────────────────────────────

export interface TideResult {
  heightMeters: number;
  isRising: boolean;
  moonLon: number;
  moonLat: number;
  springNeapDeg: number;    // 0 = neap, 90 = spring
  springNeapLabel: string;  // 'Marée de vive-eau' | 'Marée morte' | 'Intermédiaire'
  lastExtremumTimeStr: string;
  lastExtremumLabel: string;  // 'Haute' | 'Basse'
  nextExtremumTimeStr: string;
  nextExtremumLabel: string;  // 'Haute' | 'Basse'
}

export interface TideCurvePoint {
  hoursOffset: number;
  heightMeters: number;
}

export interface TideParams {
  moonDistAU: number;
  sunDistAU: number;
  moonLon: number;
  moonLat: number;
  sunLon: number;
  sunLat: number;
  observerLon: number;
  observerLat: number;
  moonPhaseDeg: number;
  astroTimeObj: Astronomy.AstroTime;
  userTz: string;
  tzOffsetMinutes: number;
}

// ── Core computation ──────────────────────────────────────────────────

/**
 * Compute equilibrium tide height from a single tide-generating body.
 *
 * Uses the tide-generating potential formula:
 *   h = amplitude × (meanDist/dist)³ × (3cos²θ - 1) / 2
 *
 * where θ is the zenith angle of the body at the observer.
 *
 * @returns Height in meters (positive = bulge, negative = depression)
 */
export function computeTideHeight(
  observerLon: number,
  observerLat: number,
  bodyLon: number,
  bodyLat: number,
  bodyDistAU: number,
  meanDistAU: number,
  amplitudeM: number,
): number {
  const latO = observerLat * DEG2RAD;
  const latB = bodyLat * DEG2RAD;
  const dLon = (observerLon - bodyLon) * DEG2RAD;

  const cosTheta = Math.sin(latO) * Math.sin(latB)
    + Math.cos(latO) * Math.cos(latB) * Math.cos(dLon);

  const distFactor = Math.pow(meanDistAU / bodyDistAU, 3);
  return amplitudeM * distFactor * (3 * cosTheta * cosTheta - 1) / 2;
}

/**
 * Compute the full tide state at the observer's location.
 */
export function computeTideState(params: TideParams): TideResult {
  const {
    moonDistAU, sunDistAU,
    moonLon, moonLat,
    sunLon, sunLat,
    observerLon, observerLat,
    moonPhaseDeg,
    astroTimeObj,
    userTz,
    tzOffsetMinutes,
  } = params;

  const lunarH = computeTideHeight(
    observerLon, observerLat,
    moonLon, moonLat,
    moonDistAU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M,
  );

  const solarH = computeTideHeight(
    observerLon, observerLat,
    sunLon, sunLat,
    sunDistAU, MEAN_SUN_DIST_AU, SOLAR_TIDE_AMPLITUDE_M,
  );

  const heightMeters = lunarH + solarH;

  // Determine rising/falling by checking 10 minutes ahead
  let isRising = false;
  try {
    const futureTime = Astronomy.AstroTime.FromTerrestrialTime(astroTimeObj.tt + 10 / 86400);
    const futureMoonEqu = Astronomy.Equator(Astronomy.Body.Moon, futureTime, new Astronomy.Observer(observerLat, observerLon, 0), true, true);
    const futureSunEqu = Astronomy.Equator(Astronomy.Body.Sun, futureTime, new Astronomy.Observer(observerLat, observerLon, 0), true, true);
    const gmstFuture = gmstHoursFromTT(futureTime.tt);
    const futureMoonLon = normLonDeg((futureMoonEqu.ra - gmstFuture) * 15);
    const futureSunLon = normLonDeg((futureSunEqu.ra - gmstFuture) * 15);
    const futureLunarH = computeTideHeight(observerLon, observerLat, futureMoonLon, futureMoonEqu.dec, futureMoonEqu.dist, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    const futureSolarH = computeTideHeight(observerLon, observerLat, futureSunLon, futureSunEqu.dec, futureSunEqu.dist, MEAN_SUN_DIST_AU, SOLAR_TIDE_AMPLITUDE_M);
    isRising = (futureLunarH + futureSolarH) > heightMeters;
  } catch {
    isRising = false;
  }

  // Spring/neap from Moon phase
  const sn = Math.abs(((moonPhaseDeg % 180) + 180) % 180 - 90); // 0=neap, 90=spring
  let springNeapLabel: string;
  if (sn > 55) springNeapLabel = 'Marée de vive-eau';
  else if (sn < 35) springNeapLabel = 'Marée morte';
  else springNeapLabel = 'Intermédiaire';

  // Next high/low tide times
  const { last, next, lastIsHigh, nextIsHigh } = findTideExtrema(
    astroTimeObj, observerLon, observerLat,
  );

  return {
    heightMeters,
    isRising,
    moonLon,
    moonLat,
    springNeapDeg: sn,
    springNeapLabel,
    lastExtremumTimeStr: last ? formatCivilTimeFromJD(last, tzOffsetMinutes, userTz) : '--h --',
    lastExtremumLabel: lastIsHigh ? 'Haute' : 'Basse',
    nextExtremumTimeStr: next ? formatCivilTimeFromJD(next, tzOffsetMinutes, userTz) : '--h --',
    nextExtremumLabel: nextIsHigh ? 'Haute' : 'Basse',
  };
}

// ── Tide curve ──────────────────────────────────────────────────────────

/**
 * Compute a 25-hour tide height curve at the observer's location.
 */
export function computeTideCurve(params: TideParams & { hoursRange?: number; stepMinutes?: number }): TideCurvePoint[] {
  const {
    observerLon, observerLat,
    astroTimeObj,
    hoursRange = 25,
    stepMinutes = 30,
  } = params;

  const points: TideCurvePoint[] = [];
  const halfRange = hoursRange / 2;
  const observer = new Astronomy.Observer(observerLat, observerLon, 0);

  for (let h = -halfRange; h <= halfRange; h += stepMinutes / 60) {
    const offsetDays = h / 24;
    try {
      const t = astroTimeObj.AddDays(offsetDays);
      const moonEqu = Astronomy.Equator(Astronomy.Body.Moon, t, observer, true, true);
      const sunEqu = Astronomy.Equator(Astronomy.Body.Sun, t, observer, true, true);
      const gmst = gmstHoursFromTT(t.tt);
      const mLon = normLonDeg((moonEqu.ra - gmst) * 15);
      const sLon = normLonDeg((sunEqu.ra - gmst) * 15);

      const lh = computeTideHeight(observerLon, observerLat, mLon, moonEqu.dec, moonEqu.dist, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
      const sh = computeTideHeight(observerLon, observerLat, sLon, sunEqu.dec, sunEqu.dist, MEAN_SUN_DIST_AU, SOLAR_TIDE_AMPLITUDE_M);
      points.push({ hoursOffset: h, heightMeters: lh + sh });
    } catch {
      points.push({ hoursOffset: h, heightMeters: 0 });
    }
  }

  return points;
}

// ── Helpers ─────────────────────────────────────────────────────────────

function normLonDeg(lon: number): number {
  return ((lon % 360) + 540) % 360 - 180;
}

function gmstHoursFromTT(tt: number): number {
  const jd = tt + 2451545.0;
  const T = (jd - 2451545.0) / 36525;
  const jdFrac = (jd - 2451545.0) % 1;
  const jdWhole = (jd - 2451545.0) - jdFrac;
  let gmst = 280.46061837
    + 360.98564736629 * jdWhole
    + 360.98564736629 * jdFrac
    + 0.000387933 * T * T
    - T * T * T / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst / 15;
}

// Cached Intl.DateTimeFormat for formatCivilTimeFromJD
let _tideCivilFmt: Intl.DateTimeFormat | null = null;
let _tideCivilFmtKey = '';

function getTideCivilFmt(tz: string): Intl.DateTimeFormat {
  if (tz !== _tideCivilFmtKey || !_tideCivilFmt) {
    _tideCivilFmt = new Intl.DateTimeFormat('fr-FR', {
      timeZone: tz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    _tideCivilFmtKey = tz;
  }
  return _tideCivilFmt;
}

function formatCivilTimeFromJD(jd: number, _tzOffsetMinutes: number, tz: string): string {
  const ms = (jd - 2440587.5) * 86400000;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return '--h --';
  try {
    const parts = getTideCivilFmt(tz).formatToParts(d);
    const h = parts.find(p => p.type === 'hour')?.value ?? '--';
    const m = parts.find(p => p.type === 'minute')?.value ?? '--';
    return `${h}h ${m}`;
  } catch {
    return '--h --';
  }
}

// ── Tide extrema cache ────────────────────────────────────────────────

interface TideExtremaCache {
  jdKey: number;
  longitude: number;
  last: number | null;
  next: number | null;
  lastIsHigh: boolean;
  nextIsHigh: boolean;
}

let _tideExtremaCache: TideExtremaCache | null = null;

/**
 * Find the last and next tide extrema by scanning -12h..+13h around now,
 * detecting zero-crossings of dH/dt, and refining with bisection.
 */
function findTideExtrema(
  astroTimeObj: Astronomy.AstroTime,
  observerLon: number,
  observerLat: number,
): { last: number | null; next: number | null; lastIsHigh: boolean; nextIsHigh: boolean } {
  const jd = astroTimeObj.tt + 2451545.0;
  const jdKey = Math.floor(jd * 96);
  const observer = new Astronomy.Observer(observerLat, observerLon, 0);

  if (_tideExtremaCache && _tideExtremaCache.jdKey === jdKey && _tideExtremaCache.longitude === observerLon) {
    return { last: _tideExtremaCache.last, next: _tideExtremaCache.next, lastIsHigh: _tideExtremaCache.lastIsHigh, nextIsHigh: _tideExtremaCache.nextIsHigh };
  }

  const extrema: { jd: number; isHigh: boolean }[] = [];

  try {
    const stepDays = 20 / 1440; // 20-min steps
    const startDays = -12 / 24;
    const endDays = 13 / 24;

    let prevH = evalTideAtJD(jd + startDays, observerLon, observerLat, observer);
    let prevDh = 0;

    for (let t = startDays + stepDays; t <= endDays; t += stepDays) {
      const h = evalTideAtJD(jd + t, observerLon, observerLat, observer);
      const dh = h - prevH;

      if (prevDh > 0 && dh < 0) {
        // High tide
        const extJD = bisectExtremum(jd + t - stepDays, jd + t, observerLon, observerLat, observer, 10);
        if (extJD !== null) extrema.push({ jd: extJD, isHigh: true });
      } else if (prevDh < 0 && dh > 0) {
        // Low tide
        const extJD = bisectExtremum(jd + t - stepDays, jd + t, observerLon, observerLat, observer, 10);
        if (extJD !== null) extrema.push({ jd: extJD, isHigh: false });
      }

      prevH = h;
      prevDh = dh;
    }
  } catch {
    // Fallback
  }

  // Split into past and future relative to now
  let last: number | null = null;
  let next: number | null = null;
  let lastIsHigh = false;
  let nextIsHigh = false;

  for (const ex of extrema) {
    if (ex.jd <= jd) {
      if (last === null || ex.jd > last) { last = ex.jd; lastIsHigh = ex.isHigh; }
    } else {
      if (next === null || ex.jd < next) { next = ex.jd; nextIsHigh = ex.isHigh; }
    }
  }

  _tideExtremaCache = { jdKey, longitude: observerLon, last, next, lastIsHigh, nextIsHigh };
  return { last, next, lastIsHigh, nextIsHigh };
}

/**
 * Bisection search for the exact JD where the tide rate changes sign.
 * Evaluates 3-point central derivative at midpoint; narrows to the bracket
 * where derivative flips. Returns the JD of the extremum.
 */
function bisectExtremum(
  loJD: number,
  hiJD: number,
  observerLon: number,
  observerLat: number,
  observer: Astronomy.Observer,
  iterations: number,
): number | null {
  const eps = 0.5 / 1440; // 30 seconds precision
  const dt = 1 / 1440; // 1 minute for derivative step

  for (let i = 0; i < iterations; i++) {
    const mid = (loJD + hiJD) / 2;
    if (hiJD - loJD < eps) return mid;

    // Central derivative at midpoint
    const hm = evalTideAtJD(mid - dt, observerLon, observerLat, observer);
    const hp = evalTideAtJD(mid + dt, observerLon, observerLat, observer);
    const rate = hp - hm;

    // Derivative at lo end
    const hlm = evalTideAtJD(loJD - dt, observerLon, observerLat, observer);
    const hlp = evalTideAtJD(loJD + dt, observerLon, observerLat, observer);
    const loRate = hlp - hlm;

    // Keep the bracket where rate changes sign
    if (loRate * rate < 0) {
      hiJD = mid;
    } else {
      loJD = mid;
    }
  }

  return (loJD + hiJD) / 2;
}

function evalTideAtJD(jd: number, observerLon: number, observerLat: number, observer: Astronomy.Observer): number {
  try {
    const t = Astronomy.AstroTime.FromTerrestrialTime(jd - 2451545.0);
    const moonEqu = Astronomy.Equator(Astronomy.Body.Moon, t, observer, true, true);
    const sunEqu = Astronomy.Equator(Astronomy.Body.Sun, t, observer, true, true);
    const gmst = gmstHoursFromTT(t.tt);
    const mLon = normLonDeg((moonEqu.ra - gmst) * 15);
    const sLon = normLonDeg((sunEqu.ra - gmst) * 15);
    const lh = computeTideHeight(observerLon, observerLat, mLon, moonEqu.dec, moonEqu.dist, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    const sh = computeTideHeight(observerLon, observerLat, sLon, sunEqu.dec, sunEqu.dist, MEAN_SUN_DIST_AU, SOLAR_TIDE_AMPLITUDE_M);
    return lh + sh;
  } catch {
    return 0;
  }
}

// ── Formatters ─────────────────────────────────────────────────────────

export function formatTideHeight(meters: number): string {
  const sign = meters >= 0 ? '+' : '';
  return `${sign}${meters.toFixed(2)} m`;
}

/** Reset caches (for tests) */
export function resetTideCaches(): void { _tideExtremaCache = null; }