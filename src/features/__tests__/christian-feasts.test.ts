import { describe, it, expect } from 'vitest';
import { computeEaster, getChristianFeastsForYear, getChristianFeastsForDate } from '@/features/christian-feasts';

describe('computeEaster', () => {
  // Known Easter dates (Gregorian)
  const knownEasters: [number, number, number][] = [
    [2000, 4, 23],
    [2024, 3, 31],
    [2025, 4, 20],
    [2023, 4, 9],
    [2020, 4, 12],
    [2019, 4, 21],
    [2016, 3, 27],
    [2013, 3, 31],
    [1961, 4, 2],
    [2100, 3, 28],
  ];

  knownEasters.forEach(([year, month, day]) => {
    it(`computes Easter ${year} as ${month}/${day}`, () => {
      const result = computeEaster(year);
      expect(result.month).toBe(month);
      expect(result.day).toBe(day);
    });
  });

  it('Easter is always in March or April', () => {
    for (let y = 1900; y <= 2100; y++) {
      const { month } = computeEaster(y);
      expect(month === 3 || month === 4).toBe(true);
    }
  });
});

describe('getChristianFeastsForYear', () => {
  it('returns 11 feasts', () => {
    const feasts = getChristianFeastsForYear(2024);
    expect(feasts).toHaveLength(11);
  });

  it('includes Paques on Easter day', () => {
    const feasts = getChristianFeastsForYear(2024);
    const easter = computeEaster(2024);
    const paques = feasts.find(f => f.name === 'P\u00E2ques');
    expect(paques).toBeDefined();
    expect(paques!.month).toBe(easter.month);
    expect(paques!.day).toBe(easter.day);
  });

  it('Mercredi des Cendres is 46 days before Easter', () => {
    const feasts = getChristianFeastsForYear(2024);
    const cendres = feasts.find(f => f.name === 'Mercredi des Cendres');
    expect(cendres).toBeDefined();
    // 2024 Easter: March 31 → Cendres: Feb 14
    expect(cendres!.month).toBe(2);
    expect(cendres!.day).toBe(14);
  });

  it('Ascension is 39 days after Easter', () => {
    const feasts = getChristianFeastsForYear(2024);
    const ascension = feasts.find(f => f.name === 'Ascension');
    expect(ascension).toBeDefined();
    // 2024 Easter: March 31 + 39 = May 9
    expect(ascension!.month).toBe(5);
    expect(ascension!.day).toBe(9);
  });

  it('all feasts have valid month (1-12) and day (1-31)', () => {
    const feasts = getChristianFeastsForYear(2024);
    for (const f of feasts) {
      expect(f.month).toBeGreaterThanOrEqual(1);
      expect(f.month).toBeLessThanOrEqual(12);
      expect(f.day).toBeGreaterThanOrEqual(1);
      expect(f.day).toBeLessThanOrEqual(31);
    }
  });
});

describe('getChristianFeastsForDate', () => {
  it('finds Easter on the correct date', () => {
    const easter = computeEaster(2024);
    const feasts = getChristianFeastsForDate(2024, easter.month, easter.day);
    expect(feasts.length).toBeGreaterThanOrEqual(1);
    expect(feasts.some(f => f.name === 'P\u00E2ques')).toBe(true);
  });

  it('returns empty for a random date with no feast', () => {
    const feasts = getChristianFeastsForDate(2024, 7, 15);
    expect(feasts).toHaveLength(0);
  });
});
