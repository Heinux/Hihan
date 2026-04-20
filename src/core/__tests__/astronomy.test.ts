import { describe, it, expect } from 'vitest';
import {
  getObliquity,
  precessJ2000ToDate,
  gmstFromJD,
  eclToEquatorial,
} from '@/core/astronomy';
import { calendarToJD } from '@/core/time';

describe('getObliquity', () => {
  it('returns obliquity near 23.44° for J2000 (≈0.409 radians)', () => {
    const eps = getObliquity(0);
    const epsDeg = eps * 180 / Math.PI;
    expect(epsDeg).toBeCloseTo(23.44, 1);
  });

  it('decreases slowly over time', () => {
    const eps0 = getObliquity(0);
    const eps100 = getObliquity(100);
    expect(eps100).toBeLessThan(eps0);
  });
});

describe('gmstFromJD', () => {
  it('returns a value between 0 and 360 degrees', () => {
    const jd = calendarToJD(2024, 6, 21, 12, 0);
    const gmst = gmstFromJD(jd);
    expect(gmst).toBeGreaterThanOrEqual(0);
    expect(gmst).toBeLessThan(360);
  });

  it('increases monotonically with time', () => {
    const jd1 = calendarToJD(2024, 1, 1, 0, 0);
    const jd2 = calendarToJD(2024, 1, 1, 1, 0);
    const gmst1 = gmstFromJD(jd1);
    const gmst2 = gmstFromJD(jd2);
    expect(gmst2).toBeGreaterThan(gmst1);
  });
});

describe('eclToEquatorial', () => {
  it('converts ecliptic (0°, 0°) to equatorial at J2000', () => {
    const obliquity = getObliquity(0);
    const result = eclToEquatorial(0, 0, obliquity);
    expect(result.ra).toBeCloseTo(0, 1);
    expect(result.dec).toBeCloseTo(0, 1);
  });

  it('converts 90° ecliptic longitude with proper obliquity', () => {
    const obliquity = getObliquity(0);
    const result = eclToEquatorial(90, 0, obliquity);
    expect(result.ra).toBeCloseTo(6, 1);
    expect(result.dec).toBeCloseTo(23.44, 1);
  });

  it('converts ecliptic pole to equatorial pole', () => {
    const obliquity = getObliquity(0);
    const result = eclToEquatorial(0, 90, obliquity);
    expect(result.ra).toBeCloseTo(18, 1);
    expect(result.dec).toBeCloseTo(66.56, 0);
  });
});

describe('precessJ2000ToDate', () => {
  it('leaves J2000 coordinates unchanged at T=0', () => {
    const ra0 = 180;
    const dec0 = 45;
    const result = precessJ2000ToDate(ra0, dec0, 0);
    expect(result.ra_deg).toBeCloseTo(ra0, 4);
    expect(result.dec_deg).toBeCloseTo(dec0, 4);
  });

  it('changes coordinates for non-zero T', () => {
    const ra0 = 180;
    const dec0 = 45;
    const r1 = precessJ2000ToDate(ra0, dec0, 0);
    const r2 = precessJ2000ToDate(ra0, dec0, 50);
    expect(r1.ra_deg).not.toBeCloseTo(r2.ra_deg, 2);
    expect(r1.dec_deg).not.toBeCloseTo(r2.dec_deg, 2);
  });
});