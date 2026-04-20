import * as Astronomy from 'astronomy-engine';
import { MS_PER_DAY, JULIAN_UNIX_EPOCH } from '@/core/constants';

export interface NewMoonResult {
  jd: number;
  date: Date;
}

/**
 * Finds the last new moon before (or at) the given date.
 *
 * @param date - Reference date
 * @returns Julian Date of the last new moon
 */
export function getLastNewMoonJD(date: Date): number {
  const astroTime = new Astronomy.AstroTime(date);
  const nm = Astronomy.SearchMoonPhase(0, astroTime, -45);
  if (!nm) {
    // Fallback: search forward from 30 days before
    const fallback = new Date(date.getTime() - 30 * MS_PER_DAY);
    const nm2 = Astronomy.SearchMoonPhase(0, new Astronomy.AstroTime(fallback), 60);
    if (nm2) return nm2.date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
    return 0;
  }
  return nm.date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
}

/**
 * Finds the new moon nearest to the given Julian Date.
 * Uses binary search on MoonPhase() — same algorithm as the classic one.
 *
 * @param targetJD - Reference Julian Date
 * @returns New moon Julian Date
 */
export function findNewMoonJD(targetJD: number): number {
  const lo = new Date(((targetJD - 20) - 2440587.5) * 86400000);
  const hi = new Date(((targetJD + 20) - 2440587.5) * 86400000);
  let pLo = Astronomy.MoonPhase(lo);
  let pHi = Astronomy.MoonPhase(hi);
  let a = lo, b = hi;

  for (let i = 0; i < 200; i++) {
    if (pHi < pLo) pHi += 360;
    const mid = new Date((a.getTime() + b.getTime()) / 2);
    const pMid = Astronomy.MoonPhase(mid);
    if (pLo <= 180 && pMid >= 180) { b = mid; pHi = pMid; }
    else { a = mid; pLo = pMid; }
    if (b.getTime() - a.getTime() < 60000) break;
  }
  return (a.getTime() + b.getTime()) / 2 / 86400000 + 2440587.5;
}

/**
 * Finds all new moons within a JD window using astronomy-engine's SearchMoonPhase.
 *
 * @param jdStart - Start of search window (Julian Date)
 * @param jdEnd - End of search window (Julian Date)
 * @returns Array of new moon Julian Dates
 */
export function findNewMoons(jdStart: number, jdEnd: number): number[] {
  const results: number[] = [];
  let cursor = jdStart;

  while (cursor < jdEnd) {
    const searchDate = jdToDate(cursor);
    let astroTime: Astronomy.AstroTime;
    try {
      astroTime = new Astronomy.AstroTime(searchDate);
    } catch {
      break;
    }

    const nm = Astronomy.SearchMoonPhase(0, astroTime, 40);
    if (!nm) break;

    const nmJD = nm.date.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
    if (nmJD >= jdEnd) break;
    if (nmJD >= jdStart - 0.5) {
      results.push(nmJD);
    }
    cursor = nmJD + 25;
  }

  return results;
}

function jdToDate(jd: number): Date {
  return new Date((jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
}