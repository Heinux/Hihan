import { describe, it, expect } from 'vitest';
import { computeEnochState } from '@/features/enoch';
import { calendarToJD } from '@/core/time';

function makeState(jd: number, hem: 'N' | 'S' = 'N') {
  return {
    currentJD: jd,
    currentTime: new Date(),
    enochHem: hem,
    getAstroJD: () => jd,
    userTimezone: 'UTC',
    currentSunEclLon: undefined,
  } as any;
}

describe('computeEnochState', () => {
  it('returns a valid Enoch state for summer solstice 2024', () => {
    const jd = calendarToJD(2024, 6, 21, 12, 0);
    const state = makeState(jd);
    const result = computeEnochState(state);
    expect(result).toBeDefined();
    expect(result.curDay).toBeGreaterThanOrEqual(0);
    expect(result.curDay).toBeLessThanOrEqual(366);
    expect(result.currentMonthIdx).toBeGreaterThanOrEqual(0);
    expect(result.currentMonthIdx).toBeLessThan(12);
    expect(result.dayInMonth).toBeGreaterThanOrEqual(1);
    expect(result.dayInMonth).toBeLessThanOrEqual(31);
  });

  it('month offsets array has 12 entries', () => {
    const jd = calendarToJD(2024, 3, 25, 12, 0);
    const state = makeState(jd);
    const result = computeEnochState(state);
    expect(result.offs).toHaveLength(12);
  });

  it('handles southern hemisphere', () => {
    const jd = calendarToJD(2024, 9, 22, 12, 0);
    const state = makeState(jd, 'S');
    const result = computeEnochState(state);
    expect(result).toBeDefined();
    expect(result.curDay).toBeGreaterThanOrEqual(0);
  });

  it('dayInMonth is between 1 and 31', () => {
    for (let m = 1; m <= 12; m++) {
      const jd = calendarToJD(2024, m, 15, 12, 0);
      const state = makeState(jd);
      const result = computeEnochState(state);
      expect(result.dayInMonth).toBeGreaterThanOrEqual(1);
      expect(result.dayInMonth).toBeLessThanOrEqual(31);
    }
  });

  it('returns consistent results when called twice (caching)', () => {
    const jd = calendarToJD(2024, 6, 21, 12, 0);
    const state = makeState(jd);
    const r1 = computeEnochState(state);
    const r2 = computeEnochState(state);
    expect(r1.curDay).toBe(r2.curDay);
    expect(r1.currentMonthIdx).toBe(r2.currentMonthIdx);
    expect(r1.dayInMonth).toBe(r2.dayInMonth);
  });
});
