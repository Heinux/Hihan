import type { AppState } from '@/core/state';
import type { CanvasRenderer } from '@/rendering/renderer';
import type { DSOManager } from '@/features/dso';
import type { AlertSystem } from '@/features/alerts';
import type { NEOManager } from '@/features/neo';
import type { WindParticleSystem } from '@/rendering/wind-particles';
import type { GeoProjection } from 'd3';
import type { TypedGeoPath } from '@/rendering/geo-path';
import type * as Astronomy from 'astronomy-engine';


export interface RenderDeps {
  renderer: CanvasRenderer;
  projection: GeoProjection;
  pathGen: TypedGeoPath;
  dsoManager: DSOManager;
  alertSystem: AlertSystem;
  neoManager?: NEOManager;
  windSystem?: WindParticleSystem;
  alertSiteEl: HTMLSelectElement | null;
  alertPrecEl: HTMLInputElement | null;
  frame: FrameContext;
}

export interface RenderLayer {
  readonly name: string;
  enabled(state: AppState): boolean;
  render(ctx: CanvasRenderingContext2D, state: AppState, deps: RenderDeps): void;
}

export class RenderPipeline {
  #layers: RenderLayer[] = [];

  addLayer(layer: RenderLayer): void {
    this.#layers.push(layer);
  }

  execute(ctx: CanvasRenderingContext2D, state: AppState, deps: RenderDeps): void {
    for (const layer of this.#layers) {
      if (layer.enabled(state)) {
        layer.render(ctx, state, deps);
      }
    }
  }
}

export interface FrameContext {
  jd: number;
  T: number;
  dt: number;
  epsRad: number;
  gmst: number;
  moonPhaseDeg: number;
  moonFraction: number;
  sunLon: number | null;
  sunLat: number | null;
  moonLon?: number;
  moonLat?: number;
  moonDistAU?: number;
  sunDistAU?: number;
  placedLabels: Array<{ x: number; y: number; w: number; h: number }>;
  cityHitTargets: Array<{ city: { name: string; lon: number; lat: number; type: 'city' | 'landmark'; symbol?: string }; px: number; py: number }>;
  astroTimeObj: Astronomy.AstroTime | null;
}

import { renderBodies } from '@/rendering/body-renderer';
import { drawConstellations, drawNavStars, drawCities } from '@/rendering/constellation-renderer';
import { drawComets } from '@/rendering/comet-renderer';
import { tideLayer } from '@/rendering/tide-layer';
import { pouLayer, ruaLayer } from '@/rendering/rua-pou-layer';
import { windRoseLayer } from '@/rendering/wind-rose-layer';
import { windParticlesLayer } from '@/rendering/wind-particles-layer';
import { zoomLabelScale } from '@/core/constants';
import { CITIES, SITE_MAP } from '@/data/cities';

// 1. Background — sphere fill + graticule + world map
export const backgroundLayer: RenderLayer = {
  name: 'background',
  enabled: () => true,
  render(_ctx, state, deps) {
    const vs = state.viewScale ?? 1;
    deps.renderer.drawBackground(state.W / vs, state.H / vs);
    deps.renderer.drawGraticule();
    deps.renderer.drawWorld(state.worldData as GeoJSON.GeoJsonObject | null);
  },
};

// 2. Ecliptic — drawEcliptic (if zodiac visible)
export const eclipticLayer: RenderLayer = {
  name: 'ecliptic',
  enabled: (state) => state.isVisible('zodiac'),
  render(_ctx, _state, deps) {
    const frame: FrameContext = deps.frame;
    deps.renderer.drawEcliptic(frame.epsRad, frame.gmst);
  },
};

// 3. Celestial equator — drawCelestialEquator
export const celestialEquatorLayer: RenderLayer = {
  name: 'celestial-equator',
  enabled: () => true,
  render(_ctx, state, deps) {
    const frame: FrameContext = deps.frame;
    deps.renderer.drawCelestialEquator(frame.gmst, state.zoomK);
  },
};

// 4. DSO paths — dsoManager.drawPaths
export const dsoPathsLayer: RenderLayer = {
  name: 'dso-paths',
  enabled: () => true,
  render(ctx, _state, deps) {
    const frame: FrameContext = deps.frame;
    deps.dsoManager.drawPaths(ctx, frame.gmst, frame.T);
  },
};

// 5. Night circle — drawNightCircle (if sunLon)
export const nightCircleLayer: RenderLayer = {
  name: 'night-circle',
  enabled: () => true,
  render(_ctx, _state, deps) {
    const frame: FrameContext = deps.frame;
    if (frame.sunLon !== null && frame.sunLat !== null) {
      deps.renderer.drawNightCircle(frame.sunLon, frame.sunLat);
    }
  },
};

// 6. Constellations — drawConstellations (if zodiac visible)
export const constellationsLayer: RenderLayer = {
  name: 'constellations',
  enabled: (state) => state.isVisible('zodiac'),
  render(ctx, state, deps) {
    const frame: FrameContext = deps.frame;
    const vs = state.viewScale ?? 1;
    drawConstellations(ctx, deps.projection, frame.gmst, frame.T, frame.placedLabels, true, state.W / vs, state.H / vs, vs, state.zoomK);
  },
};

// 7. Zodiac signs symbols — placeholder (rendering not yet implemented)
export const zodiacSignsLayer: RenderLayer = {
  name: 'zodiac-signs',
  enabled: (state) => state.isVisible('zodiac'),
  render() {},
};

// 8. Celestial bodies — renderBodies
export const celestialBodiesLayer: RenderLayer = {
  name: 'celestial-bodies',
  enabled: () => true,
  render(ctx, state, deps) {
    const frame: FrameContext = deps.frame;
    renderBodies(ctx, state.bodyPositions, { hoveredBody: state.hoveredBody, viewScale: state.viewScale, zoomK: state.zoomK }, frame.placedLabels, frame.moonPhaseDeg, state.enochHem);
  },
};

// 8b. NEO comets — drawComets
export const neoCometsLayer: RenderLayer = {
  name: 'neo-comets',
  enabled: (state) => state.isVisible('neo'),
  render(ctx, state, deps) {
    if (!deps.neoManager) return;
    if (!deps.neoManager.isAvailable()) return;
    const frame: FrameContext = deps.frame;
    const vs = state.viewScale ?? 1;
    drawComets(ctx, deps.neoManager, frame.gmst, frame.T, vs, state.zoomK);
  },
};

// 9. Seasonal points — drawSeasonalPoints
export const seasonalPointsLayer: RenderLayer = {
  name: 'seasonal-points',
  enabled: () => true,
  render(_ctx, state, deps) {
    const frame: FrameContext = deps.frame;
    deps.renderer.drawSeasonalPoints(frame.epsRad, frame.gmst, frame.placedLabels, state.enochHem, state.zoomK);
  },
};

// 10. Navigation stars — drawNavStars (if navstars visible)
export const navStarsLayer: RenderLayer = {
  name: 'nav-stars',
  enabled: (state) => state.isVisible('navstars'),
  render(ctx, state, deps) {
    const frame: FrameContext = deps.frame;
    const vs = state.viewScale ?? 1;
    drawNavStars(ctx, frame.gmst, frame.T, deps.projection, deps.pathGen, frame.placedLabels, vs, state.zoomK);
  },
};

// 11. DSO — dsoManager.draw
export const dsoLayer: RenderLayer = {
  name: 'dso',
  enabled: () => true,
  render(ctx, _state, deps) {
    const frame: FrameContext = deps.frame;
    deps.dsoManager.draw(ctx, frame.gmst, frame.T);
  },
};

// 12. Cities — drawCities
export const citiesLayer: RenderLayer = {
  name: 'cities',
  enabled: () => true,
  render(ctx, state, deps) {
    const frame: FrameContext = deps.frame;
    const vs = state.viewScale ?? 1;
    frame.cityHitTargets = drawCities(ctx, deps.projection, state.isVisible('cities'), CITIES, vs, state.zoomK);
  },
};

// 13. Transit alerts — site marker + checkTransitAlerts

export const transitAlertsLayer: RenderLayer = {
  name: 'transit-alerts',
  enabled: (state) => state.isVisible('alertEnabled'),
  render(ctx, state, deps) {
    const frame: FrameContext = deps.frame;
    const siteKey = deps.alertSiteEl?.value;
    const site = siteKey ? SITE_MAP[siteKey] : undefined;
    if (!site) return;
    const z = zoomLabelScale(state.zoomK);

    // Draw site marker
    const coords = deps.projection([site.lon, site.lat]);
    if (coords) {
      const [sx, sy] = coords;
      const prec = parseFloat(deps.alertPrecEl?.value ?? '0.5') || 0.5;
      const scale = deps.projection.scale();
      const precPx = prec * scale / 90 * state.zoomK;
      ctx.save();
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(4 * z, precPx / state.zoomK * z), 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,210,80,0.35)';
      ctx.lineWidth = 0.8 * z;
      ctx.setLineDash([3 * z, 4 * z]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.arc(sx, sy, 3 * z, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,210,80,0.6)';
      ctx.fill();
      ctx.restore();
    }
    deps.alertSystem.checkTransitAlerts(frame.gmst, frame.T);
  },
};

// 14. Sphere outline — drawSphereOutline
export const sphereOutlineLayer: RenderLayer = {
  name: 'sphere-outline',
  enabled: () => true,
  render(_ctx, _state, deps) {
    deps.renderer.drawSphereOutline();
    deps.renderer.restore();
  },
};

export function createDefaultPipeline(): RenderPipeline {
  const pipeline = new RenderPipeline();
  pipeline.addLayer(backgroundLayer);
  pipeline.addLayer(eclipticLayer);
  pipeline.addLayer(celestialEquatorLayer);
  pipeline.addLayer(dsoPathsLayer);
  pipeline.addLayer(nightCircleLayer);
  pipeline.addLayer(constellationsLayer);
  pipeline.addLayer(zodiacSignsLayer);
  pipeline.addLayer(pouLayer);
  pipeline.addLayer(ruaLayer);
  pipeline.addLayer(celestialBodiesLayer);
  pipeline.addLayer(neoCometsLayer);
  pipeline.addLayer(seasonalPointsLayer);
  pipeline.addLayer(navStarsLayer);
  pipeline.addLayer(dsoLayer);
  pipeline.addLayer(citiesLayer);
  pipeline.addLayer(transitAlertsLayer);
  pipeline.addLayer(tideLayer);
  pipeline.addLayer(sphereOutlineLayer);
  pipeline.addLayer(windRoseLayer);
  pipeline.addLayer(windParticlesLayer);
  return pipeline;
}
