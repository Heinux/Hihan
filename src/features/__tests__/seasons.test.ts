import { describe, it, expect } from 'vitest';
import { getSeasonsForYear, getCurrentSeason, getUpcomingSeasons } from '@/features/seasons';
import { calendarToJD } from '@/core/time';

describe('getSeasonsForYear', () => {
  it('returns season dates for 2024', () => {
    const result = getSeasonsForYear(2024);
    expect(result).not.toBeNull();
    expect(result!.vernal).toBeInstanceOf(Date);
    expect(result!.summer).toBeInstanceOf(Date);
    expect(result!.autumnal).toBeInstanceOf(Date);
    expect(result!.winter).toBeInstanceOf(Date);
  });

  it('vernal equinox 2024 is around March 20', () => {
    const result = getSeasonsForYear(2024);
    expect(result).not.toBeNull();
    const v = result!.vernal;
    expect(v.getUTCMonth()).toBe(2); // March = 2
    expect(v.getUTCDate()).toBeGreaterThanOrEqual(19);
    expect(v.getUTCDate()).toBeLessThanOrEqual(21);
  });

  it('summer solstice 2024 is around June 20-21', () => {
    const result = getSeasonsForYear(2024);
    expect(result).not.toBeNull();
    const s = result!.summer;
    expect(s.getUTCMonth()).toBe(5); // June = 5
    expect(s.getUTCDate()).toBeGreaterThanOrEqual(19);
    expect(s.getUTCDate()).toBeLessThanOrEqual(22);
  });

  it('seasons are in chronological order', () => {
    const result = getSeasonsForYear(2024)!;
    expect(result.vernal.getTime()).toBeLessThan(result.summer.getTime());
    expect(result.summer.getTime()).toBeLessThan(result.autumnal.getTime());
    expect(result.autumnal.getTime()).toBeLessThan(result.winter.getTime());
  });

  it('caches results (same reference on second call)', () => {
    const r1 = getSeasonsForYear(2023);
    const r2 = getSeasonsForYear(2023);
    expect(r1).toBe(r2);
  });

  it('returns valid results for year 2000', () => {
    const result = getSeasonsForYear(2000);
    expect(result).not.toBeNull();
    expect(result!.vernal.getUTCFullYear()).toBe(2000);
  });
});

describe('getCurrentSeason', () => {
  function makeState(hem: 'N' | 'S', jd: number) {
    return {
      currentJD: jd,
      currentTime: new Date(),
      enochHem: hem,
      getAstroJD: () => jd,
    };
  }

  it('returns Printemps in March for northern hemisphere', () => {
    const jd = calendarToJD(2024, 3, 25, 12, 0);
    const state = makeState('N', jd);
    const result = getCurrentSeason(state, jd);
    expect(result.season).toBe('Printemps');
    expect(result.progress).toBeGreaterThan(0);
    expect(result.progress).toBeLessThan(1);
  });

  it('returns Automne in March for southern hemisphere', () => {
    const jd = calendarToJD(2024, 3, 25, 12, 0);
    const state = makeState('S', jd);
    const result = getCurrentSeason(state, jd);
    expect(result.season).toBe('Automne');
  });

  it('returns \u00c9t\u00e9 in July for northern hemisphere', () => {
    const jd = calendarToJD(2024, 7, 15, 12, 0);
    const state = makeState('N', jd);
    const result = getCurrentSeason(state, jd);
    expect(result.season).toBe('\u00C9t\u00E9');
  });

  it('progress is between 0 and 1', () => {
    const jd = calendarToJD(2024, 5, 1, 12, 0);
    const state = makeState('N', jd);
    const result = getCurrentSeason(state, jd);
    expect(result.progress).toBeGreaterThanOrEqual(0);
    expect(result.progress).toBeLessThanOrEqual(1);
  });
});

describe('getUpcomingSeasons', () => {
  it('returns season events sorted by JD', () => {
    const jd = calendarToJD(2024, 6, 1, 12, 0);
    const state = {
      currentJD: jd,
      currentTime: new Date(),
      enochHem: 'N' as const,
      getAstroJD: () => jd,
    };
    const events = getUpcomingSeasons(state, jd);
    expect(events.length).toBeGreaterThan(0);
    for (let i = 1; i < events.length; i++) {
      expect(events[i].jd).toBeGreaterThanOrEqual(events[i - 1].jd);
    }
  });

  it('includes events from year-1, year, and year+1', () => {
    const jd = calendarToJD(2024, 6, 1, 12, 0);
    const state = {
      currentJD: jd,
      currentTime: new Date(),
      enochHem: 'N' as const,
      getAstroJD: () => jd,
    };
    const events = getUpcomingSeasons(state, jd);
    const years = new Set(events.map(e => e.year));
    expect(years.has(2023)).toBe(true);
    expect(years.has(2024)).toBe(true);
    expect(years.has(2025)).toBe(true);
  });
});
