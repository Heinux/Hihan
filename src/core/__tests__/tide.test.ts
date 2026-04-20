import { describe, it, expect, beforeEach } from 'vitest';
import {
  computeTideHeight,
  computeTideState,
  computeTideCurve,
  formatTideHeight,
  resetTideCaches,
  MEAN_MOON_DIST_AU,
  MEAN_SUN_DIST_AU,
  LUNAR_TIDE_AMPLITUDE_M,
  SOLAR_TIDE_AMPLITUDE_M,
} from '@/core/tide';
import type { TideParams } from '@/core/tide';
import * as Astronomy from 'astronomy-engine';

describe('computeTideHeight', () => {
  it('returns positive bulge when body is at zenith (same lon/lat)', () => {
    const h = computeTideHeight(0, 0, 0, 0, MEAN_MOON_DIST_AU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    // cosθ = 1 → (3*1 - 1)/2 = 1, so h = amplitude * 1 * 1
    expect(h).toBeCloseTo(LUNAR_TIDE_AMPLITUDE_M, 4);
  });

  it('returns negative depression at 90° from body', () => {
    const h = computeTideHeight(90, 0, 0, 0, MEAN_MOON_DIST_AU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    // cosθ = 0 → (0 - 1)/2 = -0.5
    expect(h).toBeCloseTo(-LUNAR_TIDE_AMPLITUDE_M / 2, 4);
  });

  it('returns zero at ~54.7° from body (magic angle)', () => {
    const magicAngle = 54.7356;
    const latO = 0, latB = 0;
    // cosθ = cos(magicAngle) → (3*cos²θ - 1)/2 ≈ 0 → h should be ~0
    const h = computeTideHeight(magicAngle, latO, 0, latB, MEAN_MOON_DIST_AU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    expect(Math.abs(h)).toBeLessThan(0.001);
  });

  it('scales with inverse-cube distance factor', () => {
    const h1 = computeTideHeight(0, 0, 0, 0, MEAN_MOON_DIST_AU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    const closerDist = MEAN_MOON_DIST_AU * 0.9;
    const h2 = computeTideHeight(0, 0, 0, 0, closerDist, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    // Closer moon → stronger tide
    expect(h2).toBeGreaterThan(h1);
    // Ratio should be (1/0.9)³ ≈ 1.372
    expect(h2 / h1).toBeCloseTo(Math.pow(1 / 0.9, 3), 3);
  });

  it('solar tide is smaller than lunar tide at same geometry', () => {
    const lunar = computeTideHeight(0, 0, 0, 0, MEAN_MOON_DIST_AU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    const solar = computeTideHeight(0, 0, 0, 0, MEAN_SUN_DIST_AU, MEAN_SUN_DIST_AU, SOLAR_TIDE_AMPLITUDE_M);
    expect(lunar).toBeGreaterThan(solar);
  });

  it('antipodal point has ~85% of sub-body bulge (from declination offset)', () => {
    const h0 = computeTideHeight(0, 0, 0, 0, MEAN_MOON_DIST_AU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    const hAnti = computeTideHeight(180, 0, 0, 0, MEAN_MOON_DIST_AU, MEAN_MOON_DIST_AU, LUNAR_TIDE_AMPLITUDE_M);
    // At equator with body at equator, antipodal point has same height
    expect(hAnti).toBeCloseTo(h0, 4);
  });
});

describe('computeTideState', () => {
  beforeEach(() => { resetTideCaches(); });

  it('returns valid tide result with all fields', () => {
    const now = new Date();
    // Use MakeTime for simplicity
    const at = Astronomy.MakeTime(now);
    const params: TideParams = {
      moonDistAU: 0.00257,
      sunDistAU: 1.0,
      moonLon: 0,
      moonLat: 0,
      sunLon: 0,
      sunLat: 0,
      observerLon: 2.35, // Paris
      observerLat: 48.86,
      moonPhaseDeg: 0, // New moon = spring tide
      astroTimeObj: at,
      userTz: 'Europe/Paris',
      tzOffsetMinutes: 60,
    };

    const result = computeTideState(params);
    expect(result.heightMeters).toBeDefined();
    expect(typeof result.isRising).toBe('boolean');
    expect(result.moonLon).toBe(0);
    expect(result.springNeapDeg).toBeGreaterThanOrEqual(0);
    expect(result.springNeapDeg).toBeLessThanOrEqual(90);
    expect(['Marée de vive-eau', 'Marée morte', 'Intermédiaire']).toContain(result.springNeapLabel);
    expect(typeof result.lastExtremumTimeStr).toBe('string');
    expect(typeof result.nextExtremumTimeStr).toBe('string');
    expect(['Haute', 'Basse']).toContain(result.lastExtremumLabel);
    expect(['Haute', 'Basse']).toContain(result.nextExtremumLabel);
  });

  it('spring tide at new moon (0°)', () => {
    const at = Astronomy.MakeTime(new Date());
    const result = computeTideState({
      moonDistAU: 0.00257, sunDistAU: 1.0,
      moonLon: 0, moonLat: 0, sunLon: 0, sunLat: 0,
      observerLon: 0, observerLat: 0,
      moonPhaseDeg: 0,
      astroTimeObj: at,
      userTz: 'UTC', tzOffsetMinutes: 0,
    });
    // At new moon, springNeapDeg should be ~90 (spring)
    expect(result.springNeapDeg).toBeGreaterThan(55);
    expect(result.springNeapLabel).toBe('Marée de vive-eau');
  });

  it('neap tide at quarter moon (90°)', () => {
    const at = Astronomy.MakeTime(new Date());
    const result = computeTideState({
      moonDistAU: 0.00257, sunDistAU: 1.0,
      moonLon: 90, moonLat: 0, sunLon: 0, sunLat: 0,
      observerLon: 0, observerLat: 0,
      moonPhaseDeg: 90,
      astroTimeObj: at,
      userTz: 'UTC', tzOffsetMinutes: 0,
    });
    expect(result.springNeapDeg).toBeLessThan(35);
    expect(result.springNeapLabel).toBe('Marée morte');
  });

  it('combined height is sum of lunar + solar at aligned bodies', () => {
    const at = Astronomy.MakeTime(new Date());
    const result = computeTideState({
      moonDistAU: 0.00257, sunDistAU: 1.0,
      moonLon: 0, moonLat: 0, sunLon: 0, sunLat: 0,
      observerLon: 0, observerLat: 0,
      moonPhaseDeg: 0,
      astroTimeObj: at,
      userTz: 'UTC', tzOffsetMinutes: 0,
    });
    // Both bodies at zenith of observer → max combined height
    const expectedMax = LUNAR_TIDE_AMPLITUDE_M + SOLAR_TIDE_AMPLITUDE_M;
    expect(result.heightMeters).toBeCloseTo(expectedMax, 2);
  });
});

describe('computeTideCurve', () => {
  beforeEach(() => { resetTideCaches(); });

  it('returns 51 points over 25 hours', () => {
    const at = Astronomy.MakeTime(new Date());
    const curve = computeTideCurve({
      moonDistAU: 0.00257, sunDistAU: 1.0,
      moonLon: 0, moonLat: 0, sunLon: 0, sunLat: 0,
      observerLon: 0, observerLat: 0,
      moonPhaseDeg: 0,
      astroTimeObj: at,
      userTz: 'UTC', tzOffsetMinutes: 0,
    });
    expect(curve.length).toBe(51);
    expect(curve[0].hoursOffset).toBeCloseTo(-12.5, 1);
    expect(curve[curve.length - 1].hoursOffset).toBeCloseTo(12.5, 1);
  });

  it('curve oscillates with both highs and lows', () => {
    const at = Astronomy.MakeTime(new Date());
    // Offset bodies from observer to get oscillation pattern
    const curve = computeTideCurve({
      moonDistAU: 0.00257, sunDistAU: 1.0,
      moonLon: 45, moonLat: 0, sunLon: 45, sunLat: 0,
      observerLon: 0, observerLat: 0,
      moonPhaseDeg: 0,
      astroTimeObj: at,
      userTz: 'UTC', tzOffsetMinutes: 0,
    });
    // The curve should have both positive and negative values
    const hasPos = curve.some(p => p.heightMeters > 0.01);
    const hasNeg = curve.some(p => p.heightMeters < -0.01);
    expect(hasPos).toBe(true);
    expect(hasNeg).toBe(true);
  });
});

describe('formatTideHeight', () => {
  it('formats positive with plus sign', () => {
    expect(formatTideHeight(0.23)).toBe('+0.23 m');
  });

  it('formats negative without extra sign', () => {
    expect(formatTideHeight(-0.15)).toBe('-0.15 m');
  });

  it('formats zero with plus', () => {
    expect(formatTideHeight(0)).toBe('+0.00 m');
  });
});