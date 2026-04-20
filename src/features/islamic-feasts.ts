import { calendarToJD, jdToCalendar } from '@/core/time';
import { findNewMoonJD } from '@/core/moon-utils';

export interface IslamicFeast {
  readonly name: string;
  readonly symbol: string;
  readonly month: number;
  readonly day: number;
  readonly context: string;
}

const SYNODIC = 29.53059;
const CRESCENT_OFF = 1.0;

// ── Feast days per Islamic month ───────────────────────────────────────

interface FeastDay { hDay: number; name: string; symbol: string; context: string; }

const FEAST_BY_MONTH: Record<number, FeastDay[]> = {
  1: [{ hDay: 1, name: '1er Muharram', symbol: '\uD83C\uDF1F', context: 'Nouvelle ann\u00E9e islamique' },
      { hDay: 10, name: 'Achoura', symbol: '\u2726', context: 'Jour d\u2019expiation' }],
  3: [{ hDay: 12, name: 'Mawlid an-Nabi', symbol: '\u2605', context: 'Naissance du proph\u00E8te Muhammad' }],
  7: [{ hDay: 27, name: 'Isra et Mi\'raj', symbol: '\u2191', context: 'Voyage nocturne et ascension' }],
  9: [{ hDay: 1,  name: 'Ramadan', symbol: '\uD83C\uDF19', context: 'D\u00E9but du je\u00FBne \u2014 30 jours' },
      { hDay: 27, name: 'Laylat al-Qadr', symbol: '\u2727', context: 'Nuit du Destin' }],
  10: [{ hDay: 1, name: 'Eid al-Fitr', symbol: '\u2726', context: 'F\u00EAte de la rupture du je\u00FBne' }],
  12: [{ hDay: 10, name: 'Eid al-Adha', symbol: '\uD83D\uDC0E', context: 'F\u00EAte du Sacrifice' }],
};

// ── Public API ────────────────────────────────────────────────────────

let cachedYear = 0;
let cachedFeasts: IslamicFeast[] = [];

function getIslamicFeastsForYear(gregYear: number): IslamicFeast[] {
  if (cachedYear === gregYear) return cachedFeasts;

  const results: IslamicFeast[] = [];

  for (const anchorMonth of [1, 7]) {
    const anchorJD = calendarToJD(gregYear, anchorMonth, 1);
      const prevJD = calendarToJD(gregYear - 1, 7, 1);

    for (const nmBase of [prevJD, anchorJD]) {
      const nmJD = findNewMoonJD(nmBase);

      for (let i = 0; i < 12; i++) {
        const hMonth = (i % 12) + 1;
        const crescentJD = Math.round(nmJD + i * SYNODIC + CRESCENT_OFF);
        const feastDays = FEAST_BY_MONTH[hMonth] || [];

        for (const fd of feastDays) {
          const g = jdToCalendar(crescentJD + fd.hDay - 1);
          if (g.year !== gregYear) continue;
          if (results.some(r => r.name === fd.name && r.month === g.month && r.day === g.day)) continue;
          results.push({ name: fd.name, symbol: fd.symbol, month: g.month, day: g.day, context: fd.context });
        }

        if (hMonth === 9) {
          for (let d = 2; d <= 30; d++) {
            if (d === 27) continue;
            const g = jdToCalendar(crescentJD + d - 1);
            if (g.year !== gregYear) continue;
            if (results.some(r => r.name === `Ramadan \u2014 Jour ${d}` && r.month === g.month && r.day === g.day)) continue;
            results.push({ name: `Ramadan \u2014 Jour ${d}`, symbol: '\uD83C\uDF19', month: g.month, day: g.day, context: 'Mois de je\u00FBne' });
          }
        }
      }
    }
  }

  results.sort((a, b) => a.month - b.month || a.day - b.day);
  cachedYear = gregYear;
  cachedFeasts = results;
  return results;
}

export function getIslamicFeastsForDate(gregYear: number, gregMonth: number, gregDay: number): IslamicFeast[] {
  return getIslamicFeastsForYear(gregYear).filter(f => f.month === gregMonth && f.day === gregDay);
}
