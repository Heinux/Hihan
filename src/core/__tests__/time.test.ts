import { describe, it, expect } from 'vitest';
import {
  calendarToJD,
  jdToCalendar,
  julianCalendarToJD,
  jdToJulianCalendar,
  dateToJD,
  formatAstroYear,
  getYearFromJD,
  advanceTime,
} from '@/core/time';
import type { AppState } from '@/core/state';

function createMockState(overrides: Partial<AppState>): AppState {
  return {
    currentJD: null,
    currentTime: new Date('2024-01-01T12:00:00Z'),
    timeStepUnit: 'day',
    timeStepVal: 1,
    getAstroJD: () => 2450000,
    ...overrides,
  } as AppState;
}

describe('calendarToJD', () => {
  it('converts Gregorian date 2000-01-01 12:00 to JD ~2451545.0', () => {
    const jd = calendarToJD(2000, 1, 1, 12, 0);
    expect(jd).toBeCloseTo(2451545.0, 1);
  });

  it('converts date with fractional hours correctly', () => {
    const jd = calendarToJD(2024, 6, 21, 0, 0);
    const jdNoon = calendarToJD(2024, 6, 21, 12, 0);
    expect(jdNoon - jd).toBeCloseTo(0.5, 1);
  });

  it('handles negative years (astronomical year 0 = 1 BC)', () => {
    const jd = calendarToJD(0, 1, 1, 12, 0);
    expect(jd).toBeGreaterThan(0);
  });
});

describe('jdToCalendar', () => {
  it('round-trips JD 2451545.0 to 2000-01-01', () => {
    const jd = calendarToJD(2000, 1, 1, 12, 0);
    const result = jdToCalendar(jd);
    expect(result.year).toBe(2000);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
  });

  it('handles dates before Gregorian reform (1582)', () => {
    const jd = calendarToJD(1582, 10, 4, 12, 0);
    const result = jdToCalendar(jd);
    expect(result.year).toBe(1582);
    expect(result.month).toBe(10);
    expect(result.day).toBe(4);
  });
});

describe('jdToCalendar / calendarToJD round-trip', () => {
  const testDates = [
    [2024, 6, 21, 12, 0],
    [2024, 1, 1, 0, 0],
    [2000, 1, 1, 12, 0],
    [1999, 12, 31, 23, 59],
    [1000, 5, 15, 6, 30],
    [-500, 1, 1, 12, 0],
  ];

  testDates.forEach(([y, m, d, h, min]) => {
    it(`round-trips ${y}-${m}-${d} ${h}:${min}`, () => {
      const jd = calendarToJD(y as number, m as number, d as number, h as number, min as number);
      const result = jdToCalendar(jd);
      expect(result.year).toBe(y);
      expect(result.month).toBe(m);
      expect(result.day).toBe(d);
    });
  });
});

describe('julianCalendarToJD and jdToJulianCalendar', () => {
  it('converts Julian date and round-trips', () => {
    const jd = julianCalendarToJD(2000, 1, 1, 12, 0);
    expect(jd).toBeGreaterThan(2400000);
    const result = jdToJulianCalendar(jd);
    expect(result.year).toBe(2000);
    expect(result.month).toBe(1);
    expect(result.day).toBe(1);
  });

  it('Julian date differs from Gregorian for same calendar date', () => {
    const julianJD = julianCalendarToJD(1582, 10, 4, 12, 0);
    const gregorianJD = calendarToJD(1582, 10, 4, 12, 0);
    expect(julianJD).not.toBeCloseTo(gregorianJD, 0);
  });
});

describe('dateToJD', () => {
  it('converts JS Date to JD', () => {
    const d = new Date('2024-06-21T12:00:00Z');
    const jd = dateToJD(d);
    expect(jd).toBeGreaterThan(2460000);
    expect(jd).toBeLessThan(2470000);
  });

  it('round-trips with calendarToJD', () => {
    const d = new Date('2024-06-21T12:00:00Z');
    const jd = dateToJD(d);
    const { year, month, day, hours, mins } = jdToCalendar(jd);
    expect(year).toBe(2024);
    expect(month).toBe(6);
    expect(day).toBe(21);
    expect(hours).toBe(12);
    expect(mins).toBe(0);
  });
});

describe('formatAstroYear', () => {
  it('formats positive years normally', () => {
    expect(formatAstroYear(2024)).toBe('2024');
    expect(formatAstroYear(1)).toBe('1');
  });

  it('formats year 0 as -1 (astronomical convention)', () => {
    expect(formatAstroYear(0)).toBe('-1');
  });

  it('formats negative years (astronomical: year N < 0 → -(N-1))', () => {
    expect(formatAstroYear(-1)).toBe('-2');
    expect(formatAstroYear(-100)).toBe('-101');
  });
});

describe('getYearFromJD', () => {
  it('extracts year from JD', () => {
    const jd = calendarToJD(2024, 6, 21, 12, 0);
    expect(getYearFromJD(jd)).toBe(2024);
  });

  it('handles year 0', () => {
    const jd = calendarToJD(0, 1, 1, 12, 0);
    const year = getYearFromJD(jd);
    expect(year).toBeLessThanOrEqual(0);
  });
});

describe('advanceTime', () => {
  it('advances by days correctly (currentJD path)', () => {
    const state = createMockState({
      currentJD: calendarToJD(2024, 1, 1, 12, 0),
      timeStepUnit: 'day',
      timeStepVal: 1,
    });
    const initialJD = state.currentJD!;
    advanceTime(state);
    expect(state.currentJD).toBeCloseTo(initialJD + 1, 1);
  });

  it('advances by hours correctly (currentJD path)', () => {
    const state = createMockState({
      currentJD: calendarToJD(2024, 1, 1, 12, 0),
      timeStepUnit: 'hour',
      timeStepVal: 24,
    });
    const initialJD = state.currentJD!;
    advanceTime(state);
    expect(state.currentJD).toBeCloseTo(initialJD + 1, 1);
  });

  it('handles month stepping with 30.436875 days/month', () => {
    const state = createMockState({
      currentJD: calendarToJD(2024, 1, 1, 12, 0),
      timeStepUnit: 'month',
      timeStepVal: 1,
    });
    const initialJD = state.currentJD!;
    advanceTime(state);
    expect(state.currentJD).toBeCloseTo(initialJD + 30.436875, 2);
  });

  it('handles year stepping with 365.25 days/year', () => {
    const state = createMockState({
      currentJD: calendarToJD(2024, 1, 1, 12, 0),
      timeStepUnit: 'year',
      timeStepVal: 1,
    });
    const initialJD = state.currentJD!;
    advanceTime(state);
    expect(state.currentJD).toBeCloseTo(initialJD + 365.25, 2);
  });

  it('advances by days correctly (currentTime path)', () => {
    const state = createMockState({
      currentJD: null,
      currentTime: new Date('2024-01-01T12:00:00Z'),
      timeStepUnit: 'day',
      timeStepVal: 1,
    });
    const initialTime = state.currentTime.getTime();
    advanceTime(state);
    expect(state.currentTime.getTime()).toBe(initialTime + 86400000);
  });

  it('advances by months correctly (currentTime path)', () => {
    const state = createMockState({
      currentJD: null,
      currentTime: new Date('2024-01-01T12:00:00Z'),
      timeStepUnit: 'month',
      timeStepVal: 1,
    });
    const initialTime = state.currentTime.getTime();
    advanceTime(state);
    expect(state.currentTime.getTime()).toBe(initialTime + 30.436875 * 86400000);
  });

  it('advances by seconds correctly (currentJD path) - BUG FIX', () => {
    const state = createMockState({
      currentJD: calendarToJD(2024, 1, 1, 12, 0),
      timeStepUnit: 'sec',
      timeStepVal: 3600,
    });
    const initialJD = state.currentJD!;
    advanceTime(state);
    expect(state.currentJD).toBeCloseTo(initialJD + (3600 / 86400), 6);
  });

  it('advances by seconds correctly (currentTime path) - BUG FIX', () => {
    const state = createMockState({
      currentJD: null,
      currentTime: new Date('2024-01-01T12:00:00Z'),
      timeStepUnit: 'sec',
      timeStepVal: 3600,
    });
    const initialTime = state.currentTime.getTime();
    advanceTime(state);
    expect(state.currentTime.getTime()).toBe(initialTime + 3600000);
  });
});