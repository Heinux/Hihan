import { MOON_PHASE_BOUNDARIES, TARENA, JULIAN_UNIX_EPOCH, MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '@/core/constants';
import type { TarenaDay } from '@/core/constants';
import { getLastNewMoonJD } from '@/core/moon-utils';

/**
 * Formats right ascension in hours, minutes, seconds.
 *
 * @param ra - Right ascension in hours
 * @returns Formatted RA string (e.g., "12h 34m 56s")
 */
export function formatRA(ra: number): string {
  let h: number = Math.floor(ra);
  let m: number = Math.floor((ra - h) * 60);
  let s: number = Math.round(((ra - h) * 60 - m) * 60);
  if (s >= 60) { s -= 60; m++; }
  if (m >= 60) { m -= 60; h++; }
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

/**
 * Formats declination in degrees and minutes.
 *
 * @param dec - Declination in degrees
 * @returns Formatted dec string (e.g., "+45° 30'")
 */
export function formatDec(dec: number): string {
  const sign: string = dec >= 0 ? '+' : '\u2212';
  const d: number = Math.floor(Math.abs(dec));
  const m: number = Math.floor((Math.abs(dec) - d) * 60);
  return `${sign}${String(d).padStart(2, '0')}\u00B0 ${String(m).padStart(2, '0')}'`;
}

/**
 * Returns the moon phase name for a given degree (0-360).
 *
 * @param deg - Moon phase in degrees (0 = new moon, 90 = first quarter, etc.)
 * @returns Moon phase name in French
 */
export function getMoonPhaseName(deg: number): string {
  if (deg < 4 || deg >= 356) return 'Nouvelle Lune';
  for (const boundary of MOON_PHASE_BOUNDARIES) {
    if (deg < boundary.max) return boundary.name;
  }
  return 'Nouvelle Lune';
}

/**
 * Returns the Tarena day for a given date and hemisphere.
 * Counts days since the last new moon rather than mapping raw phase degrees,
 * which eliminates gaps and duplicates caused by the 360°/30 mismatch
 * with the 29.53-day synodic month.
 *
 * @param date - Current date
 * @param isNorth - True for northern hemisphere
 * @returns TarenaDay object
 */
export function getTarenaDay(date: Date, isNorth: boolean): TarenaDay {
  const jd = date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
  const nlJD = getLastNewMoonJD(date);
  const daysSinceNL = jd - nlJD;

  let lunarDay = Math.min(Math.floor(daysSinceNL) + 1, 30);
  lunarDay = Math.max(lunarDay, 1);

  let targetDay = isNorth
    ? (lunarDay === 1 ? 1 : 32 - lunarDay)
    : lunarDay;
  targetDay = Math.min(Math.max(targetDay, 1), 30);
  return TARENA.find((e: TarenaDay) => e.day === targetDay) || TARENA[0];
}

/**
 * Formats a countdown duration in French.
 *
 * @param ms - Duration in milliseconds (negative for past)
 * @returns Formatted countdown string (e.g., "Dans 3j 5h" or "Il y a 2h 30m")
 */
export function formatCountdown(ms: number): string {
  const abs: number = Math.abs(ms);
  const past: boolean = ms < 0;
  const d: number = Math.floor(abs / MS_PER_DAY);
  const h: number = Math.floor((abs % MS_PER_DAY) / MS_PER_HOUR);
  const m: number = Math.floor((abs % MS_PER_HOUR) / MS_PER_MINUTE);
  let str: string = d > 0 ? `${d}j ${h}h` : h > 0 ? `${h}h ${m}m` : `${m}m`;
  return past ? `Il y a ${str}` : `Dans ${str}`;
}
