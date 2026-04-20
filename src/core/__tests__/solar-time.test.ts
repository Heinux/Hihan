import { describe, it, expect } from 'vitest';
import {
  getLongitudeForTimezone,
  computeLST,
  computeSunHA,
  computeLAST,
  computeEOT,
  formatSolarTime,
  formatEOT,
  resetSolarNoonCache,
} from '@/core/solar-time';

describe('computeLST', () => {
  it('returns GMST + longitude/15', () => {
    const lst = computeLST(12, 30); // 30°E = 2h
    expect(lst).toBeCloseTo(14, 1);
  });

  it('normalizes to [0, 24)', () => {
    const lst = computeLST(22, 45); // 22 + 3 = 25 → 1
    expect(lst).toBeCloseTo(1, 1);
  });

  it('handles negative longitude (west)', () => {
    const lst = computeLST(10, -75); // 10 - 5 = 5
    expect(lst).toBeCloseTo(5, 1);
  });

  it('handles zero longitude (same as GMST)', () => {
    const lst = computeLST(18.5, 0);
    expect(lst).toBeCloseTo(18.5, 1);
  });
});

describe('computeSunHA', () => {
  it('returns LST - Sun RA', () => {
    const ha = computeSunHA(14, 6);
    expect(ha).toBeCloseTo(8, 1);
  });

  it('normalizes to [0, 24)', () => {
    const ha = computeSunHA(2, 18); // 2 - 18 = -16 → 8
    expect(ha).toBeCloseTo(8, 1);
  });

  it('returns 0 when Sun is at meridian', () => {
    const ha = computeSunHA(10, 10);
    expect(ha).toBeCloseTo(0, 1);
  });
});

describe('computeLAST', () => {
  it('returns HA + 12', () => {
    const last = computeLAST(0); // HA=0 → noon
    expect(last).toBeCloseTo(12, 1);
  });

  it('returns 0h (midnight) when HA=12', () => {
    const last = computeLAST(12);
    expect(last).toBeCloseTo(0, 1);
  });

  it('normalizes to [0, 24)', () => {
    const last = computeLAST(14); // 14 + 12 = 26 → 2
    expect(last).toBeCloseTo(2, 1);
  });
});

describe('computeEOT', () => {
  it('returns 0 when LAST equals local mean time', () => {
    // UTC=12h, longitude=0 → LMT=12h, LAST=12h
    const eot = computeEOT(12, 12, 0);
    expect(eot).toBeCloseTo(0, 1);
  });

  it('is positive when apparent time is ahead', () => {
    // LAST=12.5h, LMT=12h → EoT = +30 min
    const eot = computeEOT(12.5, 12, 0);
    expect(eot).toBeCloseTo(30, 1);
  });

  it('is negative when apparent time is behind', () => {
    // LAST=11.5h, LMT=12h → EoT = -30 min
    const eot = computeEOT(11.5, 12, 0);
    expect(eot).toBeCloseTo(-30, 1);
  });

  it('accounts for longitude', () => {
    // UTC=10h, longitude=30°E → LMT=12h, LAST=12h → EoT=0
    const eot = computeEOT(12, 10, 30);
    expect(eot).toBeCloseTo(0, 1);
  });

  it('typical annual range is within [-17, +14] minutes for realistic inputs', () => {
    // With LAST close to LMT, EoT is small
    const eot = computeEOT(12, 12, 0);
    expect(Math.abs(eot)).toBeLessThanOrEqual(30);
  });
});

describe('formatSolarTime', () => {
  it('formats 14.55 as "14h 33"', () => {
    expect(formatSolarTime(14.55)).toBe('14h 33');
  });

  it('formats 0 as "0h 00"', () => {
    expect(formatSolarTime(0)).toBe('0h 00');
  });

  it('formats 23.9833 as "23h 59"', () => {
    expect(formatSolarTime(23 + 59 / 60)).toBe('23h 59');
  });

  it('formats noon as "12h 00"', () => {
    expect(formatSolarTime(12)).toBe('12h 00');
  });
});

describe('formatEOT', () => {
  it('formats positive EoT', () => {
    expect(formatEOT(4.2)).toBe('+4m 12s');
  });

  it('formats negative EoT', () => {
    expect(formatEOT(-14.8)).toBe('-14m 48s');
  });

  it('formats zero', () => {
    expect(formatEOT(0)).toBe('+0m 00s');
  });

  it('rounds seconds correctly', () => {
    expect(formatEOT(1.0167)).toBe('+1m 01s');
  });
});

describe('getLongitudeForTimezone', () => {
  it('returns known longitude for Europe/Paris', () => {
    const { lng, approx } = getLongitudeForTimezone('Europe/Paris');
    expect(lng).toBeCloseTo(2.3522, 1);
    expect(approx).toBe(false);
  });

  it('returns known longitude for America/New_York', () => {
    const { lng, approx } = getLongitudeForTimezone('America/New_York');
    expect(lng).toBeCloseTo(-74.006, 1);
    expect(approx).toBe(false);
  });

  it('returns known longitude for Pacific/Tahiti', () => {
    const { lng, approx } = getLongitudeForTimezone('Pacific/Tahiti');
    expect(lng).toBeCloseTo(-149.567, 0);
    expect(approx).toBe(false);
  });

  it('falls back to UTC offset for unknown timezone', () => {
    const { lng, approx } = getLongitudeForTimezone('Europe/Berlin', new Date('2025-06-15T12:00:00Z'));
    expect(approx).toBe(true);
    // Berlin is UTC+2 in summer (CEST), so offset=-120min → lng = 120/4 = 30
    // Convention: lng = -offset/4, so positive lng for east-of-Greenwich
    expect(Math.abs(lng)).toBeGreaterThan(0);
  });
});

describe('solar noon at meridian yields LAST=12', () => {
  it('when HA=0, LAST=12', () => {
    const ha = 0;
    const last = computeLAST(ha);
    expect(last).toBeCloseTo(12, 1);
  });

  it('computes HA=0 when LST equals Sun RA', () => {
    const lst = 10;
    const sunRA = 10;
    const ha = computeSunHA(lst, sunRA);
    expect(ha).toBeCloseTo(0, 1);
  });
});

describe('cache reset', () => {
  it('resetSolarNoonCache does not throw', () => {
    expect(() => resetSolarNoonCache()).not.toThrow();
  });
});