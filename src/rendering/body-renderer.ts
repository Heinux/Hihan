import * as Astronomy from 'astronomy-engine';
import type { GeoProjection } from 'd3';
import { normLon, lerpAngle } from '@/core/astronomy';
import { zoomLabelScale } from '@/core/constants';
import { placeLabel } from '@/rendering/renderer';
import type { LabelBox } from '@/rendering/renderer';
import type { CelestialBody } from '@/core/constants';
import type { BodyPosition } from '@/core/state';

interface BodyComputeResult {
  bodyPositions: BodyPosition[];
  sunLon: number | null;
  sunLat: number | null;
}

interface BodyComputeState {
  W: number;
  H: number;
  panX: number;
  panY: number;
  zoomK: number;
  viewScale: number;
  smoothPositions: Record<string, { lon: number; lat: number }>;
  sunScreenX: number;
  sunScreenY: number;
  moonScreenX: number | null;
  moonScreenY: number | null;
  currentSunEclLon: number;
}

interface BodyRenderState {
  hoveredBody: BodyPosition | null;
  viewScale?: number;
  zoomK?: number;
}

interface BodyComputeParams {
  state: BodyComputeState;
  astroTimeObj: Astronomy.AstroTime | null;
  celestialBodies: readonly CelestialBody[];
  gmst: number;
  observer: Astronomy.Observer;
  projection: GeoProjection;
  moonPhaseDeg: number;
  moonFraction: number;
  isVisible: (id: string) => boolean;
}

// Per-second cache for Astronomy.Equator() results — avoids 7 expensive
// topocentric coordinate solves per frame when jd hasn't changed by a full second.
let _equCacheKey = -1;
const _equCache: Record<string, { ra: number; dec: number; dist: number }> = {};

export function computeBodyPositions(params: BodyComputeParams): BodyComputeResult {
  const { state, astroTimeObj, celestialBodies, gmst, observer, projection, moonPhaseDeg, moonFraction, isVisible } = params;
  const bodyPositions: BodyPosition[] = [];
  let sunLon: number | null = null;
  let sunLat: number | null = null;

  const jdSec = astroTimeObj ? Math.floor((astroTimeObj.tt + 2451545.0) * 86400) : -1;
  if (jdSec !== _equCacheKey) {
    _equCacheKey = jdSec;
    for (const k of Object.keys(_equCache)) delete _equCache[k];
  }

  celestialBodies.forEach(body => {
    if (!isVisible(body.id)) return;
    if (!astroTimeObj) return;
    try {
      let ra: number, dec: number, dist: number;
      const cached = _equCache[body.id];
      if (cached) {
        ra = cached.ra;
        dec = cached.dec;
        dist = cached.dist;
      } else {
        const equ = Astronomy.Equator(body.id as Astronomy.Body, astroTimeObj, observer, true, true);
        ra = equ.ra;
        dec = equ.dec;
        dist = equ.dist;
        _equCache[body.id] = { ra, dec, dist };
      }
      const lon = normLon((ra - gmst) * 15);
      const lat = dec;

      if (body.id === 'Sun') { sunLon = lon; sunLat = lat; }

      if (!state.smoothPositions[body.id]) {
        state.smoothPositions[body.id] = { lon, lat };
      } else {
        const smoothFactor = body.id === 'Moon' ? 1.0 : 0.25;
        state.smoothPositions[body.id].lon = lerpAngle(state.smoothPositions[body.id].lon, lon, smoothFactor);
        state.smoothPositions[body.id].lat += (lat - state.smoothPositions[body.id].lat) * smoothFactor;
      }

      const coords = projection([state.smoothPositions[body.id].lon, state.smoothPositions[body.id].lat]);
      if (coords) {
        const entry: BodyPosition = { body, px: coords[0], py: coords[1], ra, dec, dist };
        if (body.id === 'Moon') {
          entry.moonPhase = moonPhaseDeg;
          entry.moonFraction = moonFraction;
        }
        bodyPositions.push(entry);
      }
    } catch (e) {
      console.warn('[body-renderer]', 'Equator computation failed for', body.id, e);
    }
  });

  // Update state with sun/moon screen coordinates
  const vs = state.viewScale ?? 1;
  const Wv = state.W / vs, Hv = state.H / vs;
  state.sunScreenX = state.W / 2 + state.panX;
  state.sunScreenY = state.H / 2 + state.panY;
  state.currentSunEclLon = 0;

  if (sunLon !== null) {
    const sunPos = bodyPositions.find(b => b.body.id === 'Sun');
    if (sunPos) {
      state.sunScreenX = vs * ((sunPos.px - Wv / 2) * state.zoomK + Wv / 2 + state.panX / vs);
      state.sunScreenY = vs * ((sunPos.py - Hv / 2) * state.zoomK + Hv / 2 + state.panY / vs);
    }
  }

  state.moonScreenX = null;
  state.moonScreenY = null;
  const moonPos = bodyPositions.find(b => b.body.id === 'Moon');
  if (moonPos) {
    state.moonScreenX = vs * ((moonPos.px - Wv / 2) * state.zoomK + Wv / 2 + state.panX / vs);
    state.moonScreenY = vs * ((moonPos.py - Hv / 2) * state.zoomK + Hv / 2 + state.panY / vs);
  }

  return { bodyPositions, sunLon, sunLat };
}

export function renderBodies(
  ctx: CanvasRenderingContext2D,
  bodyPositions: BodyPosition[],
  state: BodyRenderState,
  placedLabels: LabelBox[],
  moonPhaseDeg: number,
  hemisphere: 'N' | 'S',
): void {
  const vs = state.viewScale ?? 1;
  const z = zoomLabelScale(state.zoomK ?? 1);
  bodyPositions.forEach(({ body, px, py }) => {
    const gScale = vs * z;
    const r = body.radius * z;
    // Outer glow halo — bell-curve glow approximating shadowBlur
    // Peak brightness at core edge, long soft tail beyond. Core dot drawn on top.
    const blurSigma = body.glow * gScale / 3;
    const totalR = r + blurSigma * 5;
    const ce = r / totalR; // core-edge ratio
    // Parse hex color for fine-grained alpha control
    const cr = parseInt(body.color.slice(1, 3), 16);
    const cg = parseInt(body.color.slice(3, 5), 16);
    const cb = parseInt(body.color.slice(5, 7), 16);
    const grad = ctx.createRadialGradient(px, py, 0, px, py, totalR);
    grad.addColorStop(0, `rgba(${cr},${cg},${cb},0.2)`);
    grad.addColorStop(ce, `rgba(${cr},${cg},${cb},0.75)`);
    grad.addColorStop(ce + (1 - ce) * 0.12, `rgba(${cr},${cg},${cb},0.35)`);
    grad.addColorStop(ce + (1 - ce) * 0.30, `rgba(${cr},${cg},${cb},0.12)`);
    grad.addColorStop(ce + (1 - ce) * 0.55, `rgba(${cr},${cg},${cb},0.03)`);
    grad.addColorStop(ce + (1 - ce) * 0.8, `rgba(${cr},${cg},${cb},0.005)`);
    grad.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.beginPath();
    ctx.arc(px, py, totalR, 0, Math.PI * 2);
    ctx.fillStyle = grad;
    ctx.fill();

    // Body rendering (no shadowBlur)
    if (body.id === 'Moon') {
      drawMoonPhase(ctx, px, py, r, moonPhaseDeg, hemisphere);
    } else {
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fillStyle = body.color;
      ctx.fill();
    }

    // Saturn rings
    if (body.id === 'Saturn') {
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = body.color;
      ctx.lineWidth = 1.5 * z;
      ctx.beginPath();
      ctx.ellipse(px, py, r * 2.1, r * 0.6, Math.PI / 6, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    // Hover highlight ring
    if (state.hoveredBody && state.hoveredBody.body.id === body.id) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, r + 5 * z, 0, Math.PI * 2);
      ctx.strokeStyle = body.color + 'aa';
      ctx.lineWidth = 1 * z;
      ctx.stroke();
      ctx.restore();
    }

    // Body label
    const labelFontSize = Math.round(10 * vs * z);
    const zoomK = state.zoomK ?? 1;
    placeLabel({ labels: placedLabels, x: px, y: py, text: body.name, font: `400 ${labelFontSize}px "DM Mono",monospace`, color: 'rgba(210,225,245,0.75)', radius: body.radius * z, context2d: ctx, zoomK });
  });
}

// Offscreen canvas for moon phase — avoids clip() on main canvas (GPU stall on mobile)
const MOON_OFF_SIZE = 32;
let _moonOffCanvas: HTMLCanvasElement | null = null;
let _moonOffCtx: CanvasRenderingContext2D | null = null;
let _moonPhaseCacheKey = -1;

export function drawMoonPhase(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  r: number,
  phaseDeg: number,
  hem: 'N' | 'S' | undefined,
): void {
  const isNorth = (typeof hem === 'undefined' || hem === 'N');
  // Cache by 1-degree increments + hemisphere
  const phaseKey = Math.round(phaseDeg) * 1000 + (isNorth ? 0 : 1);
  if (phaseKey !== _moonPhaseCacheKey || !_moonOffCanvas) {
    _moonPhaseCacheKey = phaseKey;
    if (!_moonOffCanvas) {
      _moonOffCanvas = document.createElement('canvas');
      _moonOffCtx = _moonOffCanvas.getContext('2d')!;
    }
    const s = MOON_OFF_SIZE;
    _moonOffCanvas.width = s;
    _moonOffCanvas.height = s;
    const mCtx = _moonOffCtx!;
    const mR = s / 2 - 2;
    const mCx = s / 2, mCy = s / 2;

    const waxing = phaseDeg < 180;
    const phaseRad = phaseDeg * Math.PI / 180;
    const litColor = '#dce8f5', darkColor = '#0b111c';

    mCtx.clearRect(0, 0, s, s);
    mCtx.save();
    if (!isNorth) {
      mCtx.translate(mCx, mCy);
      mCtx.scale(-1, 1);
      mCtx.translate(-mCx, -mCy);
    }
    mCtx.beginPath();
    mCtx.arc(mCx, mCy, mR, 0, Math.PI * 2);
    mCtx.clip();

    mCtx.fillStyle = waxing ? darkColor : litColor;
    mCtx.fillRect(0, 0, s, s);

    mCtx.beginPath();
    if (waxing) mCtx.arc(mCx, mCy, mR, -Math.PI / 2, Math.PI / 2);
    else        mCtx.arc(mCx, mCy, mR, Math.PI / 2, Math.PI * 1.5);
    mCtx.closePath();
    mCtx.fillStyle = waxing ? litColor : darkColor;
    mCtx.fill();

    const terminatorXRadius = Math.abs(Math.cos(phaseRad)) * mR;
    if (terminatorXRadius > 0.5) {
      mCtx.beginPath();
      mCtx.ellipse(mCx, mCy, terminatorXRadius, mR, 0, 0, Math.PI * 2);
      const cosPhase = Math.cos(phaseRad);
      let ellipseColor: string;
      if (waxing)  ellipseColor = cosPhase >= 0 ? darkColor : litColor;
      else         ellipseColor = cosPhase <= 0 ? litColor  : darkColor;
      mCtx.fillStyle = ellipseColor;
      mCtx.fill();
    }

    mCtx.restore();
  }

  // Blit cached moon
  ctx.drawImage(_moonOffCanvas, cx - r, cy - r, r * 2, r * 2);

  // Rim glow
  const rimGrad = ctx.createRadialGradient(cx, cy, r * 0.75, cx, cy, r * 1.25);
  rimGrad.addColorStop(0, 'rgba(180,200,230,0)');
  rimGrad.addColorStop(0.6, 'rgba(180,200,230,0.18)');
  rimGrad.addColorStop(1, 'rgba(180,200,230,0)');
  ctx.beginPath();
  ctx.arc(cx, cy, r * 1.25, 0, Math.PI * 2);
  ctx.fillStyle = rimGrad;
  ctx.fill();

  // Thin outline
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.strokeStyle = 'rgba(150,175,210,0.25)';
  ctx.lineWidth = Math.max(0.2, 0.8 * (r / 6));
}
