import { daysInMonth } from '@/core/date-utils';

export interface ChristianFeast {
  readonly name: string;
  readonly symbol: string;
  readonly month: number;
  readonly day: number;
  readonly context: string;
}

function addDays(y: number, m: number, d: number, offset: number): { month: number; day: number } {
  let day = d + offset;
  let month = m;
  while (day > daysInMonth(y, month)) {
    day -= daysInMonth(y, month);
    month++;
  }
  while (day < 1) {
    month--;
    if (month < 1) { month = 12; y--; }
    day += daysInMonth(y, month);
  }
  return { month, day };
}

/**
 * Computes Easter Sunday date for a given year using the Computus algorithm.
 *
 * @param year - Gregorian year
 * @returns Object with month and day of Easter Sunday
 */
export function computeEaster(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const mm = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * mm + 114) / 31);
  const day = ((h + l - 7 * mm + 114) % 31) + 1;
  return { month, day };
}

interface FeastDef {
  readonly name: string;
  readonly symbol: string;
  readonly offset: number;
  readonly context: string;
}

const FEAST_DEFS: readonly FeastDef[] = [
  { name: 'Mercredi des Cendres',   symbol: '\u25C8', offset: -46, context: 'D\u00E9but du Car\u00EAme \u2014 46 jours avant P\u00E2ques (40 jours de je\u00FBne hors 6 dimanches)' },
  { name: 'Rameaux',                symbol: '\uD83C\uDF3F', offset: -7,  context: 'Entr\u00E9e du Christ \u00E0 J\u00E9rusalem \u2014 P\u00E2ques moins 7 jours' },
  { name: 'Jeudi saint',            symbol: '\uD83C\uDF74', offset: -3,  context: 'Derni\u00E8re C\u00E8ne \u2014 P\u00E2ques moins 3 jours' },
  { name: 'Vendredi saint',         symbol: '\u271E', offset: -2,  context: 'Crucifixion du Christ \u2014 P\u00E2ques moins 2 jours' },
  { name: 'Samedi saint',           symbol: '\u2026', offset: -1,  context: 'Jour d\u2019attente au tombeau \u2014 P\u00E2ques moins 1 jour' },
  { name: 'P\u00E2ques',            symbol: '\u2726', offset: 0,   context: 'R\u00E9surrection du Christ \u2014 premier jour de repos apr\u00E8s la premi\u00E8re pleine lune apr\u00E8s l\u2019\u00E9quinoxe de printemps' },
  { name: 'Ascension',              symbol: '\u2609', offset: 39,  context: 'Ascension du Christ au ciel \u2014 P\u00E2ques plus 39 jours (jeudi)' },
  { name: 'Pentec\u00F4te',         symbol: '\uD83D\uDD25', offset: 49,  context: 'Descente du Saint-Esprit \u2014 P\u00E2ques plus 49 jours' },
  { name: 'Sainte Trinit\u00E9',    symbol: '\u2261', offset: 56,  context: 'F\u00EAte de la Sainte Trinit\u00E9 \u2014 P\u00E2ques plus 56 jours' },
  { name: 'F\u00EAte-Dieu',        symbol: '\u2727', offset: 60,  context: 'F\u00EAte du Corps et du Sang du Christ \u2014 P\u00E2ques plus 60 jours' },
  { name: 'Sacré-C\u0153ur',       symbol: '\u2764', offset: 68,  context: 'F\u00EAte du Sacr\u00E9-C\u0153ur de J\u00E9sus \u2014 P\u00E2ques plus 68 jours' },
] as const;

/**
 * Returns all Christian feast dates for a given year.
 *
 * @param year - Gregorian year
 * @returns Array of ChristianFeast objects
 */
export function getChristianFeastsForYear(year: number): ChristianFeast[] {
  const easter = computeEaster(year);
  const results: ChristianFeast[] = [];
  for (const def of FEAST_DEFS) {
    const { month, day } = addDays(year, easter.month, easter.day, def.offset);
    results.push({ name: def.name, symbol: def.symbol, month, day, context: def.context });
  }
  return results;
}

/**
 * Returns Christian feasts for a specific date.
 *
 * @param year - Gregorian year
 * @param month - Month (1-12)
 * @param day - Day
 * @returns Array of ChristianFeast objects matching the date
 */
export function getChristianFeastsForDate(year: number, month: number, day: number): ChristianFeast[] {
  return getChristianFeastsForYear(year).filter(f => f.month === month && f.day === day);
}
