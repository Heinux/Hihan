import { describe, it, expect } from 'vitest';
import { computeHebrewFromJD } from '@/features/hebrew';
import { calendarToJD } from '@/core/time';

describe('computeHebrewFromJD', () => {
  it('returns valid Hebrew date for a known Gregorian date', () => {
    // 2024-01-01 12:00 UTC
    const jd = calendarToJD(2024, 1, 1, 12, 0);
    const result = computeHebrewFromJD(jd);
    expect(result.hebrewYear).toBeGreaterThan(5700);
    expect(result.month).toBeGreaterThanOrEqual(1);
    expect(result.month).toBeLessThanOrEqual(13);
    expect(result.day).toBeGreaterThanOrEqual(1);
    expect(result.day).toBeLessThanOrEqual(30);
    expect(result.monthName).toBeTruthy();
  });

  it('returns 5784 for dates in late 2023/early 2024', () => {
    // Rosh Hashana 5784 was Sep 15-17 2023
    // Jan 2024 is in Hebrew year 5784
    const jd = calendarToJD(2024, 1, 15, 12, 0);
    const result = computeHebrewFromJD(jd);
    expect(result.hebrewYear).toBe(5784);
  });

  it('month length is 29 or 30', () => {
    const jd = calendarToJD(2024, 6, 15, 12, 0);
    const result = computeHebrewFromJD(jd);
    expect(result.monthLength === 29 || result.monthLength === 30).toBe(true);
  });

  it('handles timezone offset', () => {
    const jd = calendarToJD(2024, 3, 20, 18, 0);
    // With a timezone offset for Jerusalem (+2h = +120min), sunset may shift the day
    const resultUTC = computeHebrewFromJD(jd, 0);
    const resultJerusalem = computeHebrewFromJD(jd, -120);
    // Both should be valid Hebrew dates
    expect(resultUTC.day).toBeGreaterThanOrEqual(1);
    expect(resultJerusalem.day).toBeGreaterThanOrEqual(1);
  });

  it('handles dates across multiple years consistently', () => {
    const years = [2020, 2021, 2022, 2023, 2024, 2025];
    for (const y of years) {
      const jd = calendarToJD(y, 6, 1, 12, 0);
      const result = computeHebrewFromJD(jd);
      expect(result.hebrewYear).toBeGreaterThan(5700);
      expect(result.hebrewYear).toBeLessThan(5900);
      expect(result.month).toBeGreaterThanOrEqual(1);
      expect(result.month).toBeLessThanOrEqual(13);
    }
  });

  it('handles ancient dates (year 33 CE)', () => {
    const jd = calendarToJD(33, 4, 3, 12, 0);
    const result = computeHebrewFromJD(jd);
    expect(result.hebrewYear).toBeGreaterThan(3700);
    expect(result.hebrewYear).toBeLessThan(3900);
    expect(result.day).toBeGreaterThanOrEqual(1);
  });
});
