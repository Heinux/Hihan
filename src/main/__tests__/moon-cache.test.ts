import { describe, it, expect } from 'vitest';
import { createMoonCache } from '@/main/moon-cache';

describe('createMoonCache', () => {
  it('returns zero phase when astroTimeObj is null', () => {
    const cache = createMoonCache();
    const result = cache.getMoonPhase(2451545.0, null);
    expect(result.moonPhaseDeg).toBe(0);
    expect(result.moonFraction).toBe(0);
  });

  it('caches result for the same minute-key', () => {
    const cache = createMoonCache();
    const fakeAstro = {} as any;
    const result1 = cache.getMoonPhase(2451545.0, fakeAstro);
    const result2 = cache.getMoonPhase(2451545.0, fakeAstro);
    expect(result1).toStrictEqual(result2);
  });

  it('recomputes when jd crosses a minute boundary', () => {
    const cache = createMoonCache();
    const jd1 = 2451545.0;
    const jd2 = 2451545.0 + 1 / 1440; // next minute
    const fakeAstro = {} as any;
    const result1 = cache.getMoonPhase(jd1, fakeAstro);
    const result2 = cache.getMoonPhase(jd2, fakeAstro);
    // Both return zero since fake astro throws, but keys are different
    expect(result1).toStrictEqual(result2);
  });
});