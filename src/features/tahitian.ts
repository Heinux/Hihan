import { MS_PER_DAY, JULIAN_UNIX_EPOCH } from '@/core/constants';
import { getSeasonsForYear } from '@/features/seasons';
import { dateToJD } from '@/core/time';
import { findNewMoons } from '@/core/moon-utils';

// ── Interfaces ──────────────────────────────────────────────────────

export interface TahitianMonth {
  name: string;
  startJD: number;
  endJD: number;
  intercalary: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────

function jdToDate(jd: number): Date {
  return new Date((jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
}

/**
 * Get the solar event JD for a given year.
 * eventIndex: 0=vernal, 1=summer, 2=autumnal, 3=winter
 */
function getSolarEventJD(year: number, eventIndex: number): number {
  const s = getSeasonsForYear(year);
  if (!s) {
    // Fallback: approximate
    const Y = year / 1000;
    const marchEqJD = 2451623.80984 + 365242.37404 * Y + 0.05169 * Y * Y - 0.00411 * Y * Y * Y;
    const offsets = [0, 93.8283, 186.3847, 278.9418];
    return marchEqJD + offsets[eventIndex];
  }

  const events = [
    dateToJD(s.vernal),
    dateToJD(s.summer),
    dateToJD(s.autumnal),
    dateToJD(s.winter),
  ];
  return events[eventIndex];
}

// ── Core Algorithm ──────────────────────────────────────────────────

/**
 * Find Huriama: the New Moon closest to the spring equinox.
 * hemisphere N: spring = vernal equinox (index 0, ~March)
 * hemisphere S: spring = austral spring = September equinox (index 2)
 */
/**
 * Find Huriama: the New Moon closest to the spring equinox.
 * Hemisphere N: spring = vernal equinox (index 0, ~March)
 * Hemisphere S: spring = austral spring = September equinox (index 2)
 *
 * @param year - Gregorian year
 * @param hemisphere - 'N' or 'S'
 * @returns Julian Date of Huriama
 */
export function findHuriama(year: number, hemisphere: 'N' | 'S'): number {
  const springTarget = hemisphere === 'N' ? 0 : 2;
  const equinoxJD = getSolarEventJD(year, springTarget);

  const newMoons = findNewMoons(equinoxJD - 30, equinoxJD + 30);
  if (newMoons.length === 0) return equinoxJD; // fallback

  return newMoons.reduce((best, nm) =>
    Math.abs(nm - equinoxJD) < Math.abs(best - equinoxJD) ? nm : best
  );
}

/**
 * Build the Tahitian year starting from Huriama.
 *
 * Structure:
 * P1: Huriama → Te'eri → Teta'i → Varehu → Fa'ahu → Pipiri → [Ta'a'oa?] → Aunuunu
 * P2: [Manu?] → Paroro mua → Paroro muri → Muriaha → Hi'aia → [Ta'a'oa?] → [Firi'a?]
 *
 * Intercalary rules:
 * - Ta'a'oa P1: if end of Pipiri < autumn equinox
 * - Manu: if Matari'i setting (~May 20) falls during Aunuunu → replaces Paroro mua
 * - Ta'a'oa P2: if end of Hi'aia < spring equinox AND Ta'a'oa not in P1
 * - Ta'a'oa P2 + Firi'a: if end of Ta'a'oa < spring equinox (Forster)
 * - Firi'a alone: if end of Hi'aia < spring equinox AND Ta'a'oa already in P1 (Bligh)
 */
export function buildTahitianYear(huriamaStartJD: number, hemisphere: 'N' | 'S'): TahitianMonth[] {
  const newMoons = findNewMoons(huriamaStartJD - 1, huriamaStartJD + 435);

  const months: TahitianMonth[] = [];
  let cursor = huriamaStartJD;
  const nmIter = newMoons.filter(nm => nm > cursor);
  let nmIdx = 0;

  // Determine the year context from Huriama
  const huriamaDate = jdToDate(huriamaStartJD);
  const huriamaYear = huriamaDate.getUTCFullYear();

  // Determine equinox years for intercalation checks.
  // Hemisphere S: Tahitian year starts ~September Y → autumn (March) and spring (September) are both in Y+1.
  // Hemisphere N: Tahitian year starts ~March Y → autumn (September) is in Y, spring (March) in Y+1.
  const p1EquinoxYear = hemisphere === 'S' ? huriamaYear + 1 : huriamaYear;
  const p2EquinoxYear = huriamaYear + 1;

  function appendMonth(name: string, intercalary: boolean = false): void {
    if (nmIdx >= nmIter.length) return;
    const nxt = nmIter[nmIdx++];
    months.push({ name, startJD: cursor, endJD: nxt, intercalary });
    cursor = nxt;
  }

  // ── PÉRIODE 1 (tau 'auhune) ──
  for (const name of ['Huriama', "Te'eri", "Teta'i", 'Varehu', "Fa'ahu", 'Pipiri']) {
    appendMonth(name);
  }

  // Rule: Ta'a'oa in P1 if end of Pipiri before autumn equinox
  //   S hemisphere: autumn = March (index 0)
  //   N hemisphere: autumn = September (index 2)
  const p1EquinoxTarget = hemisphere === 'S' ? 0 : 2;
  const p1EqJD = getSolarEventJD(p1EquinoxYear, p1EquinoxTarget);
  const taaooaInP1 = cursor < p1EqJD;

  if (taaooaInP1) {
    appendMonth("Ta'a'oa", true);
  }

  appendMonth('Aunuunu');

  // ── PÉRIODE 2 (tau o'e) ──
  // Manu: if Matari'i setting (~May 20) falls during Aunuunu
  const aunuunu = months.find(m => m.name === 'Aunuunu');
  let manuInserted = false;

  if (aunuunu) {
    const aunuunuStart = jdToDate(aunuunu.startJD);
    const matariiDate = new Date(Date.UTC(aunuunuStart.getUTCFullYear(), 4, 20)); // May 20
    const matariiJD = dateToJD(matariiDate);

    if (matariiJD >= aunuunu.startJD && matariiJD < aunuunu.endJD) {
      appendMonth('Manu', true); // replaces Paroro mua
      for (const name of ['Paroro muri', 'Muriaha', "Hi'aia"]) {
        appendMonth(name);
      }
      manuInserted = true;
    }
  }

  if (!manuInserted) {
    for (const name of ['Paroro mua', 'Paroro muri', 'Muriaha', "Hi'aia"]) {
      appendMonth(name);
    }
  }

  // P2 equinox check — spring equinox
  //   hemisphere S : printemps = septembre (index 2)
  //   hemisphere N : printemps = mars (index 0)
  const p2EquinoxTarget = hemisphere === 'S' ? 2 : 0;
  const p2EqJD = getSolarEventJD(p2EquinoxYear, p2EquinoxTarget);

  if (cursor < p2EqJD) {
    if (taaooaInP1) {
      // Rule 15: Ta'a'oa already in P1 → Firi'a alone (Bligh)
      appendMonth("Firi'a", true);
    } else {
      // Rule 14: Ta'a'oa in P2
      appendMonth("Ta'a'oa", true);
      // Rule 16: if still not enough → Firi'a too (Forster)
      if (cursor < p2EqJD) {
        appendMonth("Firi'a", true);
      }
    }
  }

  return months;
}

/**
 * Find the Tahitian month that contains the given JD.
 * Returns the month info or null if outside the Tahitian year.
 */
export function getTahitianMonthForJD(
  months: TahitianMonth[],
  jd: number,
): { month: TahitianMonth; index: number; dayInMonth: number } | null {
  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    if (jd >= m.startJD && jd < m.endJD) {
      const dayInMonth = Math.floor(jd - m.startJD) + 1;
      return { month: m, index: i, dayInMonth };
    }
  }
  return null;
}

/**
 * Compute the Tahitian calendar state for a given JD and hemisphere.
 * Returns the full year months array and current month info.
 * Cached by day — result only changes at day boundaries.
 */
let _tahitianCache: { dayKey: number; hem: 'N' | 'S'; result: { months: TahitianMonth[]; current: { month: TahitianMonth; index: number; dayInMonth: number } | null } } | null = null;

/** Reset tahitian cache (for tests) */
export function resetTahitianCache(): void { _tahitianCache = null; }

export function computeTahitianState(
  jd: number,
  hemisphere: 'N' | 'S',
): { months: TahitianMonth[]; current: { month: TahitianMonth; index: number; dayInMonth: number } | null } {
  const dayKey = Math.floor(jd + 0.5);
  if (_tahitianCache && _tahitianCache.dayKey === dayKey && _tahitianCache.hem === hemisphere) {
    return _tahitianCache.result;
  }
  // Determine which Tahitian year we're in
  const date = jdToDate(jd);
  const year = date.getUTCFullYear();

  // Try current year and adjacent years
  for (const y of [year, year - 1, year + 1]) {
    const huriamaJD = findHuriama(y, hemisphere);
    const months = buildTahitianYear(huriamaJD, hemisphere);
    if (months.length === 0) continue;

    const lastMonth = months[months.length - 1];
    if (jd >= months[0].startJD && jd < lastMonth.endJD) {
      const current = getTahitianMonthForJD(months, jd);
      const result = { months, current };
      _tahitianCache = { dayKey, hem: hemisphere, result };
      return result;
    }
  }

  // Fallback: build from nearest year
  const huriamaJD = findHuriama(year, hemisphere);
  const months = buildTahitianYear(huriamaJD, hemisphere);
  const current = getTahitianMonthForJD(months, jd);
  const result = { months, current };
  _tahitianCache = { dayKey, hem: hemisphere, result };
  return result;
}
