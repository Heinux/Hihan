import { geoCircle } from 'd3-geo';
import type { AppState } from '@/core/state';
import type { RenderLayer, RenderDeps } from '@/rendering/render-pipeline';
import type { TypedGeoPath } from '@/rendering/geo-path';

const MEAN_MOON_DIST_AU = 0.00257;

function normLon(lon: number): number {
  return ((lon % 360) + 540) % 360 - 180;
}

export const tideLayer: RenderLayer = {
  name: 'tide-bulge',

  enabled(state: AppState): boolean {
    return state.isVisible('tideLayers');
  },

  render(ctx: CanvasRenderingContext2D, _state: AppState, deps: RenderDeps): void {
    const { frame, pathGen } = deps;
    if (!frame) return;

    const { moonLon = 0, moonLat = 0, sunLon, sunLat, moonDistAU, sunDistAU: _sunDistAU } = frame;
    if (sunLon === null || sunLat === null) return;

    const moonDist = moonDistAU ?? MEAN_MOON_DIST_AU;
    const distFactor = Math.pow(MEAN_MOON_DIST_AU / moonDist, 3);

    // Set the rendering context on the path generator so it draws into the
    // already-transformed canvas (same transform as all other map layers).
    pathGen.context(ctx);

    // Lunar tidal bulge
    const lunarAlpha = Math.min(0.18, 0.08 * distFactor);
    drawBulge(ctx, pathGen, moonLon, moonLat, lunarAlpha, '80,160,240');
    drawBulge(ctx, pathGen, normLon(moonLon + 180), -moonLat, lunarAlpha * 0.85, '80,160,240');

    // Solar tidal bulge (smaller)
    const solarAlpha = 0.04;
    drawBulge(ctx, pathGen, sunLon, sunLat, solarAlpha, '255,200,80');
    drawBulge(ctx, pathGen, normLon(sunLon + 180), -sunLat, solarAlpha * 0.8, '255,200,80');
  },
};

function drawBulge(
  ctx: CanvasRenderingContext2D,
  pathGen: TypedGeoPath,
  lon: number,
  lat: number,
  alpha: number,
  rgb: string,
): void {
  // Outer glow
  const outer = geoCircle().center([lon, lat]).radius(55)();
  ctx.beginPath();
  pathGen(outer);
  ctx.fillStyle = `rgba(${rgb}, ${alpha * 0.4})`;
  ctx.fill();

  // Inner core
  const inner = geoCircle().center([lon, lat]).radius(25)();
  ctx.beginPath();
  pathGen(inner);
  ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
  ctx.fill();
}