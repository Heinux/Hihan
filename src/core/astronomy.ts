import { J2000_EPOCH, JULIAN_CENTURY_DAYS, ARCSEC_TO_RAD, OBLIQUITY_COEFFS } from '@/core/constants';

export interface PrecessionAngles {
  zeta: number;
  z: number;
  theta: number;
}

export interface EquatorialCoords {
  ra_deg: number;
  dec_deg: number;
}

export interface EquatorialHours {
  ra: number;
  dec: number;
}

export interface TernaryMinimumResult {
  jdMin: number;
  sepMin: number;
}

interface CelestialObject {
  ra: number;
  dec: number;
}

/**
 * Computes mean obliquity of the ecliptic.
 *
 * Uses the IAU 2006 polynomial from Capitaine et al. (2003),
 * Astronomy & Astrophysics, 412, 567-586.
 *
 * @param T - Julian centuries from J2000.0
 * @returns Obliquity in radians
 */
export function getObliquity(T: number): number {
  const U: number = T / 100;
  let eps0: number = OBLIQUITY_COEFFS[0];
  let Upow: number = U;
  for (let i = 1; i < OBLIQUITY_COEFFS.length; i++) {
    eps0 += OBLIQUITY_COEFFS[i] * Upow;
    Upow *= U;
  }
  return eps0 * ARCSEC_TO_RAD;
}

/**
 * Computes precession angles (zeta, z, theta) for a given epoch.
 *
 * @param T - Julian centuries from J2000.0
 * @returns Precession angles in radians
 */
export function getPrecessionAngles(T: number): PrecessionAngles {
  const T2: number = T * T;
  const T3: number = T2 * T;
  const T4: number = T3 * T;
  const T5: number = T4 * T;

  const zeta: number  = 2.5976176 + 2306.083227 * T + 0.3024236 * T2 + 0.0179963 * T3 - 0.00003173 * T4 - 0.000000343 * T5;
  const z: number     = -2.5976176 + 2306.077181 * T + 1.0927348 * T2 + 0.01826837 * T3 - 0.000028596 * T4 - 0.0000002904 * T5;
  const theta: number = 2004.191903 * T - 0.4294934 * T2 - 0.04182264 * T3 - 0.000007089 * T4 - 0.0000001274 * T5;

  return {
    zeta:  zeta  * ARCSEC_TO_RAD,
    z:     z     * ARCSEC_TO_RAD,
    theta: theta * ARCSEC_TO_RAD,
  };
}

// Cache for getPrecessionAngles — T changes by ~3.8e-10 per second,
// so rounding to 8 decimals gives ~10s stability. All ~170 calls per frame
// share the same T, so the cache hits after the first call.
let _precAngleKey = NaN;
let _precAngleCache: PrecessionAngles | null = null;

// Cache for final precessed coordinates of static stars (no proper motion).
// Keyed on "ra:dec:T_rounded" — the result only changes when any input changes.
const _precessCache = new Map<string, EquatorialCoords>();
const PRECESS_CACHE_MAX = 512;

/**
 * Precesses equatorial coordinates from J2000.0 to a given epoch.
 *
 * @param ra_deg - Right ascension at J2000.0 (degrees)
 * @param dec_deg - Declination at J2000.0 (degrees)
 * @param T - Julian centuries from J2000.0
 * @param pm_ra - Proper motion in RA (mas/yr, optional)
 * @param pm_dec - Proper motion in dec (mas/yr, optional)
 * @returns Precessed equatorial coordinates in degrees
 */
export function precessJ2000ToDate(
  ra_deg: number, dec_deg: number, T: number,
  pm_ra?: number, pm_dec?: number,
): EquatorialCoords {
  const hasPM = pm_ra !== undefined && pm_dec !== undefined && (pm_ra !== 0 || pm_dec !== 0);

  if (hasPM) {
    const years: number = T * 100;
    const decRad0: number = dec_deg * Math.PI / 180;
    const cosDec: number = Math.cos(decRad0);
    ra_deg  += (pm_ra * years) / (cosDec * 3600000);
    dec_deg += (pm_dec * years) / 3600000;
  }

  if (Math.abs(T) < 1e-6) return { ra_deg, dec_deg };

  // Use cached precession angles — all calls in a frame share the same T
  const tKey = Math.round(T * 1e8);
  let angles: PrecessionAngles;
  if (tKey === _precAngleKey && _precAngleCache) {
    angles = _precAngleCache;
  } else {
    angles = getPrecessionAngles(T);
    _precAngleKey = tKey;
    _precAngleCache = angles;
  }

  // For static stars (no proper motion), cache the final result too
  if (!hasPM) {
    const cacheKey = `${ra_deg.toFixed(4)}:${dec_deg.toFixed(4)}:${tKey}`;
    const cached = _precessCache.get(cacheKey);
    if (cached) return cached;

    const result = _precessRaw(ra_deg, dec_deg, angles);
    if (_precessCache.size >= PRECESS_CACHE_MAX) _precessCache.clear();
    _precessCache.set(cacheKey, result);
    return result;
  }

  return _precessRaw(ra_deg, dec_deg, angles);
}

function _precessRaw(ra_deg: number, dec_deg: number, { zeta, z, theta }: PrecessionAngles): EquatorialCoords {
  const ra0: number  = ra_deg  * Math.PI / 180;
  const dec0: number = dec_deg * Math.PI / 180;

  const A: number = Math.cos(dec0) * Math.sin(ra0 + zeta);
  const B: number = Math.cos(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) - Math.sin(theta) * Math.sin(dec0);
  const C: number = Math.sin(theta) * Math.cos(dec0) * Math.cos(ra0 + zeta) + Math.cos(theta) * Math.sin(dec0);

  const raRad: number = Math.atan2(A, B) + z;
  const decRad: number = Math.asin(Math.max(-1, Math.min(1, C)));

  let raDeg: number = (raRad * 180 / Math.PI) % 360;
  if (raDeg < 0) raDeg += 360;
  const decDeg: number = decRad * 180 / Math.PI;

  return { ra_deg: raDeg, dec_deg: decDeg };
}

/**
 * Computes Greenwich Mean Sidereal Time from Julian Date.
 *
 * @param jd - Julian Date
 * @returns GMST in hours
 */
export function gmstFromJD(jd: number): number {
  const T: number = (jd - J2000_EPOCH) / JULIAN_CENTURY_DAYS;
  const jdFrac = (jd - J2000_EPOCH) % 1;
  const jdWhole = (jd - J2000_EPOCH) - jdFrac;
  let gmst: number = 280.46061837
    + 360.98564736629 * jdWhole
    + 360.98564736629 * jdFrac
    + 0.000387933 * T * T
    - T * T * T / 38710000.0;
  gmst = ((gmst % 360) + 360) % 360;
  return gmst / 15;
}

/**
 * Converts ecliptic coordinates to equatorial coordinates.
 *
 * @param lambdaDeg - Ecliptic longitude (degrees)
 * @param betaDeg - Ecliptic latitude (degrees)
 * @param epsRad - Mean obliquity of the ecliptic (radians)
 * @returns Equatorial coordinates (RA in hours, dec in degrees)
 */
export function eclToEquatorial(lambdaDeg: number, betaDeg: number, epsRad: number): EquatorialHours {
  const lR: number = lambdaDeg * Math.PI / 180;
  const bR: number = betaDeg * Math.PI / 180;
  const cosB: number = Math.cos(bR), sinB: number = Math.sin(bR);
  const x: number = cosB * Math.cos(lR);
  const y: number = cosB * Math.sin(lR);
  const z: number = sinB;
  const ce: number = Math.cos(epsRad), se: number = Math.sin(epsRad);
  const ye: number = y * ce - z * se;
  const ze: number = y * se + z * ce;
  let raRad: number = Math.atan2(ye, x);
  if (raRad < 0) raRad += 2 * Math.PI;
  return { ra: raRad * 12 / Math.PI, dec: Math.asin(ze) * 180 / Math.PI };
}

/**
 * Normalizes an angle to the range [-180, 180] degrees.
 *
 * @param lon - Angle in degrees
 * @returns Normalized angle in degrees
 */
export function normLon(lon: number): number {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

function angularSeparation(ra1_deg: number, dec1_deg: number, ra2_deg: number, dec2_deg: number): number {
  const r1: number = ra1_deg * Math.PI / 180, d1: number = dec1_deg * Math.PI / 180;
  const r2: number = ra2_deg * Math.PI / 180, d2: number = dec2_deg * Math.PI / 180;
  const c: number = Math.sin(d1) * Math.sin(d2) + Math.cos(d1) * Math.cos(d2) * Math.cos(r1 - r2);
  return Math.acos(Math.max(-1, Math.min(1, c))) * 180 / Math.PI;
}

function zenithEquatorial(lonDeg: number, latDeg: number, gmst_hours: number): EquatorialCoords {
  const raDeg: number = ((gmst_hours * 15 + lonDeg) % 360 + 360) % 360;
  return { ra_deg: raDeg, dec_deg: latDeg };
}

/**
 * Computes angular separation between a celestial object and a site at a given time.
 *
 * @param obj - Celestial object with ra (hours) and dec (degrees)
 * @param siteLon - Site longitude (degrees)
 * @param siteLat - Site latitude (degrees)
 * @param jd_query - Julian Date to query
 * @returns Angular separation in degrees
 */
export function sepAtJD(obj: CelestialObject, siteLon: number, siteLat: number, jd_query: number): number {
  const T_q: number = (jd_query - J2000_EPOCH) / JULIAN_CENTURY_DAYS;
  const { ra_deg, dec_deg }: EquatorialCoords = precessJ2000ToDate(obj.ra * 15, obj.dec, T_q);
  const gmst_q: number = gmstFromJD(jd_query);
  const z: EquatorialCoords = zenithEquatorial(siteLon, siteLat, gmst_q);
  return angularSeparation(ra_deg, dec_deg, z.ra_deg, z.dec_deg);
}

/**
 * Finds the ternary minimum separation between a celestial object and a site.
 *
 * @param obj - Celestial object with ra (hours) and dec (degrees)
 * @param siteLon - Site longitude (degrees)
 * @param siteLat - Site latitude (degrees)
 * @param jd0 - Start Julian Date
 * @param jd1 - End Julian Date
 * @param maxIter - Maximum iterations (default 48)
 * @returns Object with jdMin (JD of minimum) and sepMin (minimum separation in degrees)
 */
export function ternaryMinimum(obj: CelestialObject, siteLon: number, siteLat: number, jd0: number, jd1: number, maxIter?: number): TernaryMinimumResult {
  let lo: number = jd0, hi: number = jd1;
  for (let i = 0; i < (maxIter || 48); i++) {
    const m1: number = lo + (hi - lo) / 3;
    const m2: number = hi - (hi - lo) / 3;
    if (sepAtJD(obj, siteLon, siteLat, m1) < sepAtJD(obj, siteLon, siteLat, m2)) {
      hi = m2;
    } else {
      lo = m1;
    }
  }
  const jdMin: number = (lo + hi) / 2;
  const sepMin: number = sepAtJD(obj, siteLon, siteLat, jdMin);
  return { jdMin, sepMin };
}

/**
 * Linear interpolation between two angles, taking the shortest path.
 *
 * @param a - Start angle (degrees)
 * @param b - End angle (degrees)
 * @param t - Interpolation factor [0, 1]
 * @returns Interpolated angle (degrees)
 */
export function lerpAngle(a: number, b: number, t: number): number {
  let d: number = b - a;
  while (d > 180) d -= 360;
  while (d < -180) d += 360;
  return a + d * t;
}
