import { geoGraticule, geoCircle } from 'd3-geo';
import type { GeoProjection, GeoPath } from 'd3';
import { normLon, eclToEquatorial } from '@/core/astronomy';
import { SEASON_DEFS, EVENT_LABELS_N, EVENT_LABELS_S, zoomLabelScale } from '@/core/constants';

type EventKey = 'vernal' | 'summer' | 'autumnal' | 'winter';

export interface LabelBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface PlaceLabelOptions {
  labels: LabelBox[];
  x: number;
  y: number;
  text: string;
  font: string;
  color: string;
  radius: number;
  context2d: CanvasRenderingContext2D;
  zoomK?: number;
}

export function placeLabel(opts: PlaceLabelOptions): void {
  const { labels, x, y, text, font, color, radius, context2d, zoomK = 1 } = opts;
  const z = zoomLabelScale(zoomK);
  const approxW = text.length * 6.2 * z, approxH = 13 * z, pad = 4 * z;
  const candidates: [number, number][] = [
    [x + radius + 5 * z, y + 4 * z],
    [x - radius - approxW - 5 * z, y + 4 * z],
    [x + radius + 5 * z, y - 10 * z],
    [x - radius - approxW - 5 * z, y - 10 * z],
    [x - approxW / 2, y - radius - 8 * z],
    [x - approxW / 2, y + radius + 14 * z],
  ];
  let chosen: [number, number] | null = null;
  for (const [cx, cy] of candidates) {
    let ok = true;
    for (const s of labels) {
      if (!(cx + approxW + pad < s.x || cx - pad > s.x + s.w || cy + approxH + pad < s.y || cy - pad > s.y + s.h)) {
        ok = false;
        break;
      }
    }
    if (ok) { chosen = [cx, cy]; break; }
  }
  if (!chosen) chosen = candidates[0];
  const [lx, ly] = chosen;
  labels.push({ x: lx, y: ly - approxH, w: approxW, h: approxH });
  const dist = Math.sqrt((lx + approxW / 2 - x) ** 2 + (ly - y) ** 2);
  if (dist > radius + 14 * z) {
    context2d.save();
    context2d.strokeStyle = `${color}55`;
    context2d.lineWidth = 0.6 * z;
    context2d.setLineDash([2 * z, 3 * z]);
    context2d.beginPath();
    context2d.moveTo(x, y);
    context2d.lineTo(lx, ly);
    context2d.stroke();
    context2d.setLineDash([]);
    context2d.restore();
  }
  context2d.save();
  context2d.font = font;
  context2d.fillStyle = color;
  context2d.fillText(text, lx, ly);
  context2d.restore();
}

// ── Viewport state (subset used by CanvasRenderer) ──────────────────
interface ViewportState {
  W: number;
  H: number;
  panX: number;
  panY: number;
  zoomK: number;
  viewScale: number;
}

// ── CanvasRenderer class ─────────────────────────────────────────────
export class CanvasRenderer {
  readonly #canvas: HTMLCanvasElement;
  readonly #ctx: CanvasRenderingContext2D;
  readonly #projection: GeoProjection;
  readonly #pathGen: GeoPath;
  #bgGradient: CanvasGradient | null = null;
  #bgW = 0;
  #bgH = 0;
  readonly #cachedGraticule: GeoJSON.GeoJsonObject;

  // Offscreen canvas cache for background layer (world map + graticule + sphere fill)
  #bgCanvas: HTMLCanvasElement | null = null;
  #bgCtx: CanvasRenderingContext2D | null = null;
  #bgCacheKey = '';
  #bgCacheDpr = 1;

  constructor(canvas: HTMLCanvasElement, projection: GeoProjection, pathGen: GeoPath) {
    this.#canvas = canvas;
    this.#ctx = canvas.getContext('2d')!;
    this.#projection = projection;
    this.#pathGen = pathGen;
    this.#cachedGraticule = geoGraticule()() as GeoJSON.GeoJsonObject;
  }

  get ctx(): CanvasRenderingContext2D { return this.#ctx; }

  resize(W: number, H: number): void {
    this.#canvas.width = W;
    this.#canvas.height = H;
  }

  applyViewportTransform(state: ViewportState): void {
    const { W, H, panX, panY, zoomK, viewScale } = state;
    const vs = viewScale ?? 1;
    const Wv = W / vs, Hv = H / vs;
    this.#ctx.save();
    this.#ctx.translate(Wv / 2 + panX / vs, Hv / 2 + panY / vs);
    this.#ctx.scale(zoomK, zoomK);
    this.#ctx.translate(-Wv / 2, -Hv / 2);
  }

  invalidateBgCache(): void {
    this.#bgCacheKey = '';
  }

  drawBackgroundLayer(worldData: GeoJSON.GeoJsonObject | null, state: ViewportState): void {
    const vs = state.viewScale ?? 1;
    const Wv = state.W / vs, Hv = state.H / vs;
    const dpr = window.devicePixelRatio || 1;
    const key = `${this.#projection.scale()}:${this.#projection.translate()}:${this.#projection.rotate()}`;

    if (key === this.#bgCacheKey && this.#bgCanvas && this.#bgCacheDpr === dpr) {
      // Cache hit: blit offscreen canvas
      this.#ctx.drawImage(this.#bgCanvas, 0, 0);
      return;
    }

    // Cache miss: render to offscreen canvas
    if (!this.#bgCanvas) {
      this.#bgCanvas = document.createElement('canvas');
      this.#bgCtx = this.#bgCanvas.getContext('2d')!;
    }
    const pxW = Math.round(Wv * dpr * vs);
    const pxH = Math.round(Hv * dpr * vs);
    this.#bgCanvas.width = pxW;
    this.#bgCanvas.height = pxH;
    this.#bgCacheDpr = dpr;

    const off = this.#bgCtx!;
    off.setTransform(dpr * vs, 0, 0, dpr * vs, 0, 0);
    off.clearRect(0, 0, Wv, Hv);
    // Apply same viewport transform
    off.save();
    off.translate(Wv / 2 + state.panX / vs, Hv / 2 + state.panY / vs);
    off.scale(state.zoomK, state.zoomK);
    off.translate(-Wv / 2, -Hv / 2);

    // Draw background sphere
    if (!this.#bgGradient || this.#bgW !== Wv || this.#bgH !== Hv) {
      this.#bgGradient = off.createRadialGradient(Wv / 2, Hv / 2, 0, Wv / 2, Hv / 2, Math.min(Wv, Hv) / 2);
      this.#bgGradient.addColorStop(0, '#071018');
      this.#bgGradient.addColorStop(1, '#030710');
      this.#bgW = Wv;
      this.#bgH = Hv;
    }
    off.beginPath();
    this.#pathGen.context(off)({ type: "Sphere" } as any);
    off.fillStyle = this.#bgGradient;
    off.fill();

    // Graticule
    off.beginPath();
    this.#pathGen.context(off)(this.#cachedGraticule as any);
    off.strokeStyle = 'rgba(100,130,170,0.04)';
    off.lineWidth = 0.8;
    off.stroke();

    // World map
    if (worldData) {
      off.beginPath();
      this.#pathGen.context(off)(worldData as any);
      off.fillStyle = '#131e2a';
      off.fill();
      off.strokeStyle = 'rgba(60,85,115,0.38)';
      off.lineWidth = 0.4;
      off.stroke();
    }

    off.restore();
    this.#bgCacheKey = key;

    // Blit to main canvas
    this.#ctx.drawImage(this.#bgCanvas, 0, 0);
  }

  drawBackground(W: number, H: number): void {
    if (!this.#bgGradient || this.#bgW !== W || this.#bgH !== H) {
      this.#bgGradient = this.#ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.min(W, H) / 2);
      this.#bgGradient.addColorStop(0, '#071018');
      this.#bgGradient.addColorStop(1, '#030710');
      this.#bgW = W;
      this.#bgH = H;
    }
    this.#ctx.beginPath();
    this.#pathGen({ type: "Sphere" } as any);
    this.#ctx.fillStyle = this.#bgGradient;
    this.#ctx.fill();
  }

  drawGraticule(): void {
    this.#ctx.beginPath();
    this.#pathGen(this.#cachedGraticule as any);
    this.#ctx.strokeStyle = 'rgba(100,130,170,0.04)';
    this.#ctx.lineWidth = 0.8;
    this.#ctx.stroke();
  }

  drawWorld(worldData: GeoJSON.GeoJsonObject | null): void {
    if (!worldData) return;
    this.#ctx.beginPath();
    this.#pathGen(worldData as any);
    this.#ctx.fillStyle = '#131e2a';
    this.#ctx.fill();
    this.#ctx.strokeStyle = 'rgba(60,85,115,0.38)';
    this.#ctx.lineWidth = 0.4;
    this.#ctx.stroke();
  }

  drawEcliptic(epsRad: number, gmst: number): void {
    const eclPts: [number, number][] = [];
    for (let i = 0; i <= 360; i += 2) {
      const { ra, dec } = eclToEquatorial(i, 0, epsRad);
      eclPts.push([normLon((ra - gmst) * 15), dec]);
    }
    this.#ctx.beginPath();
    this.#pathGen({ type: "LineString", coordinates: eclPts } as any);
    this.#ctx.strokeStyle = 'rgba(200,215,235,0.2)';
    this.#ctx.lineWidth = 1.2;
    this.#ctx.setLineDash([4, 4]);
    this.#ctx.stroke();
    this.#ctx.setLineDash([]);
  }

  drawNightCircle(sunLon: number, sunLat: number): void {
    let antipodeLon = sunLon + 180;
    if (antipodeLon > 180) antipodeLon -= 360;
    const nc = geoCircle().center([antipodeLon, -sunLat]).radius(90)();
    this.#ctx.beginPath();
    this.#pathGen(nc as any);
    this.#ctx.fillStyle = 'rgba(1,3,8,0.52)';
    this.#ctx.fill();
  }

  drawSphereOutline(): void {
    this.#ctx.beginPath();
    this.#pathGen({ type: "Sphere" } as any);
    this.#ctx.strokeStyle = 'rgba(100,130,165,0.18)';
    this.#ctx.lineWidth = 1.5;
    this.#ctx.stroke();
  }

  drawCelestialEquator(gmst: number, zoomK: number = 1): void {
    const eqPts: [number, number][] = [];
    for (let ra = 0; ra <= 24; ra += 0.1) {
      eqPts.push([normLon((ra - gmst) * 15), 0]);
    }
    this.#ctx.beginPath();
    this.#pathGen({ type: 'LineString', coordinates: eqPts } as any);
    this.#ctx.strokeStyle = 'rgba(140,170,210,0.18)';
    this.#ctx.lineWidth = 1;
    this.#ctx.setLineDash([6, 6]);
    this.#ctx.stroke();
    this.#ctx.setLineDash([]);

    const lRA = (gmst + 6) % 24;
    const lCoords = this.#projection([normLon((lRA - gmst) * 15), 0]);
    if (lCoords) {
      this.#ctx.save();
      const z = zoomLabelScale(zoomK);
      this.#ctx.font = `300 ${7.5 * z}px "DM Mono",monospace`;
      this.#ctx.fillStyle = 'rgba(140,170,210,0.35)';
      this.#ctx.textAlign = 'center';
      this.#ctx.textBaseline = 'bottom';
      this.#ctx.fillText('Équateur céleste', lCoords[0], lCoords[1] - 4 * z);
      this.#ctx.restore();
    }
  }

  drawSeasonalPoints(epsRad: number, gmst: number, placedLabels: LabelBox[], hemisphere: 'N' | 'S', zoomK: number = 1): void {
    const labels = hemisphere === 'S' ? EVENT_LABELS_S : EVENT_LABELS_N;
    const z = zoomLabelScale(zoomK);
    SEASON_DEFS.forEach(def => {
      const lbl = labels[def.key as EventKey] || def;
      const { ra, dec } = eclToEquatorial(def.eclLon, 0, epsRad);
      const lon = normLon((ra - gmst) * 15);
      const coords = this.#projection([lon, dec]);
      if (!coords) return;
      const [sx, sy] = coords;
      const mr = def.markerR * z;

      // Outer glow
      const grad = this.#ctx.createRadialGradient(sx, sy, 0, sx, sy, mr * 3.5);
      grad.addColorStop(0, lbl.color.replace(/[\d.]+\)$/, '0.4)'));
      grad.addColorStop(1, lbl.color.replace(/[\d.]+\)$/, '0)'));
      this.#ctx.beginPath();
      this.#ctx.arc(sx, sy, mr * 3.5, 0, Math.PI * 2);
      this.#ctx.fillStyle = grad;
      this.#ctx.fill();

      // Rotated diamond marker with glow (radial gradient replaces shadowBlur)
      const diamondGlow = this.#ctx.createRadialGradient(sx, sy, 0, sx, sy, mr * 1.5);
      diamondGlow.addColorStop(0, lbl.color.replace(/[\d.]+\)$/, '0.35)'));
      diamondGlow.addColorStop(1, lbl.color.replace(/[\d.]+\)$/, '0)'));
      this.#ctx.beginPath();
      this.#ctx.arc(sx, sy, mr * 1.5, 0, Math.PI * 2);
      this.#ctx.fillStyle = diamondGlow;
      this.#ctx.fill();

      this.#ctx.save();
      this.#ctx.translate(sx, sy);
      this.#ctx.rotate(Math.PI / 4);
      this.#ctx.beginPath();
      const s = mr * 0.72;
      this.#ctx.rect(-s, -s, s * 2, s * 2);
      this.#ctx.fillStyle = lbl.color;
      this.#ctx.fill();
      this.#ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      this.#ctx.lineWidth = 0.5 * z;
      this.#ctx.stroke();
      this.#ctx.restore();

      // Symbol text with glow (strokeText replaces shadowBlur)
      this.#ctx.save();
      this.#ctx.font = `bold ${11 * z}px "DM Mono",monospace`;
      this.#ctx.textAlign = 'center';
      this.#ctx.textBaseline = 'middle';
      this.#ctx.strokeStyle = lbl.color.replace(/[\d.]+\)$/, '0.35)');
      this.#ctx.lineWidth = 3 * z;
      this.#ctx.lineJoin = 'round';
      this.#ctx.strokeText(lbl.symbol, sx, sy);
      this.#ctx.fillStyle = lbl.color;
      this.#ctx.fillText(lbl.symbol, sx, sy);
      this.#ctx.restore();

      // Label
      placeLabel({ labels: placedLabels, x: sx, y: sy, text: lbl.label, font: `300 ${8 * z}px "DM Mono",monospace`, color: lbl.color.replace(/[\d.]+\)$/, '0.7)'), radius: mr + 2 * z, context2d: this.#ctx, zoomK });
    });
  }

  restore(): void {
    this.#ctx.restore();
  }
}
