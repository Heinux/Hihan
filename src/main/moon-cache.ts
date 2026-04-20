import * as Astronomy from 'astronomy-engine';

export interface MoonCacheResult {
  moonPhaseDeg: number;
  moonFraction: number;
}

export function createMoonCache(): { getMoonPhase: (jd: number, astroTimeObj: Astronomy.AstroTime | null) => MoonCacheResult } {
  let cachedKey = -1;
  let cachedPhaseDeg = 0;
  let cachedFraction = 0;

  return {
    getMoonPhase(jd: number, astroTimeObj: Astronomy.AstroTime | null): MoonCacheResult {
      const key = Math.floor(jd * 1440);
      if (key !== cachedKey) {
        cachedKey = key;
        try {
          const moonIllum = Astronomy.Illumination(Astronomy.Body.Moon, astroTimeObj!);
          cachedPhaseDeg = Astronomy.MoonPhase(astroTimeObj!);
          cachedFraction = moonIllum.phase_fraction;
        } catch (e) {
          console.warn('[main] Moon phase calc failed', e);
        }
      }
      return { moonPhaseDeg: cachedPhaseDeg, moonFraction: cachedFraction };
    },
  };
}