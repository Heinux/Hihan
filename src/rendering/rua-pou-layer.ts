/**
 * rua-pou-layer.ts
 * Render layers for Rua (star paths) and Pou (celestial pillars).
 *
 * Rua are declination corridors across the sky, each marked by a ta'urua star.
 * Pou are meridian lines through 'ana stars from pole to pole.
 *
 * Together they form the Polynesian coordinate system described in
 * Teriierooiterai's thesis (ch. IV–V).
 */

import { normLon, eclToEquatorial, precessJ2000ToDate } from '@/core/astronomy';
import { zoomLabelScale } from '@/core/constants';
import { placeLabel, type LabelBox } from '@/rendering/renderer';
import { RUA, POU } from '@/data/rua-pou';
import type { Rua, Pou } from '@/data/rua-pou';
import type { AppState } from '@/core/state';
import type { RenderLayer, RenderDeps } from '@/rendering/render-pipeline';
import type { GeoProjection } from 'd3';

// ── Drawing helpers ───────────────────────────────────────────────────

/** Draw a rua corridor (constant-declination arc) on the projection. */
function drawRuaArc(
  ctx: CanvasRenderingContext2D,
  rua: Rua,
  gmst: number,
  epsRad: number,
  projection: GeoProjection,
): void {
  // Rua corridors are constant-declination circles — these render correctly
  // with d3 geoPath since they don't cross the pole discontinuity.
  const pts: [number, number][] = [];

  if (rua.num === 10) {
    // Ecliptic path
    for (let eclLon = 0; eclLon <= 360; eclLon += 2) {
      const { ra, dec } = eclToEquatorial(eclLon, 0, epsRad);
      pts.push([normLon((ra - gmst) * 15), dec]);
    }
  } else {
    // Constant-declination circle
    for (let raH = 0; raH <= 24; raH += 0.1) {
      pts.push([normLon((raH - gmst) * 15), rua.dec]);
    }
  }

  ctx.save();
  ctx.beginPath();
  let drawing = false;
  let prevX = 0;
  for (const pt of pts) {
    const c = projection(pt);
    if (!c) { drawing = false; continue; }
    if (!drawing) {
      ctx.moveTo(c[0], c[1]);
      drawing = true;
    } else {
      // Skip large jumps (crossing behind the globe)
      const dx = Math.abs(c[0] - prevX);
      if (dx > 300) {
        ctx.moveTo(c[0], c[1]);
      } else {
        ctx.lineTo(c[0], c[1]);
      }
    }
    prevX = c[0];
  }
  ctx.strokeStyle = rua.color;
  ctx.lineWidth = rua.num === 10 ? 1.0 : 1.2;
  ctx.setLineDash(rua.num === 10 ? [6, 4] : [8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Draw a pou meridian (constant-RA line) on the projection.
 *  Uses manual moveTo/lineTo to avoid d3 geoPath artifacts when
 *  meridians cross behind the visible hemisphere. */
function drawPouLine(
  ctx: CanvasRenderingContext2D,
  pou: Pou,
  gmst: number,
  T: number,
  projection: GeoProjection,
): void {
  // Precess the 'ana star's RA to the current epoch
  const { ra_deg } = precessJ2000ToDate(pou.ra * 15, pou.dec, T, pou.pm_ra, pou.pm_dec);
  const lon = normLon((ra_deg / 15 - gmst) * 15);

  ctx.save();
  ctx.beginPath();
  let drawing = false;
  let prevX = 0;
  let prevY = 0;
  for (let dec = -90; dec <= 90; dec += 2) {
    const c = projection([lon, dec]);
    if (!c) { drawing = false; continue; }
    const [sx, sy] = c;
    if (!drawing) {
      ctx.moveTo(sx, sy);
      drawing = true;
    } else {
      // Skip large jumps (segment crossing behind the globe)
      const dx = Math.abs(sx - prevX);
      const dy = Math.abs(sy - prevY);
      if (dx > 300 || dy > 300) {
        ctx.moveTo(sx, sy);
      } else {
        ctx.lineTo(sx, sy);
      }
    }
    prevX = sx;
    prevY = sy;
  }
  ctx.strokeStyle = pou.color;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([4, 6]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

/** Draw a highlight glow around a marker star position. */
function drawMarkerGlow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  color: string,
  z: number,
): void {
  const glowR = 10 * z;
  const glowInner = color.replace(/[\d.]+\)$/, '0.45)');
  const glowOuter = color.replace(/[\d.]+\)$/, '0)');
  const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, glowR);
  grad.addColorStop(0, glowInner);
  grad.addColorStop(1, glowOuter);
  ctx.beginPath();
  ctx.arc(sx, sy, glowR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  // Core dot
  ctx.beginPath();
  ctx.arc(sx, sy, 2.5 * z, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
}

/** Draw a label at a marker star position using collision avoidance. */
function drawMarkerLabel(
  ctx: CanvasRenderingContext2D,
  placedLabels: LabelBox[],
  sx: number,
  sy: number,
  text: string,
  color: string,
  zoomK: number,
): void {
  const z = zoomLabelScale(zoomK);
  placeLabel({
    labels: placedLabels,
    x: sx,
    y: sy,
    text,
    font: `300 ${7 * z}px "DM Mono",monospace`,
    color,
    radius: 6 * z,
    context2d: ctx,
    zoomK,
  });
}

// ── Render layers ─────────────────────────────────────────────────────

export const pouLayer: RenderLayer = {
  name: 'pou',
  enabled: (state) => state.isVisible('pou'),

  render(ctx: CanvasRenderingContext2D, state: AppState, deps: RenderDeps): void {
    const { frame, projection } = deps;

    // Draw meridian lines
    for (const pou of POU) {
      drawPouLine(ctx, pou, frame.gmst, frame.T, projection);
    }

    // Draw 'ana star markers on top
    const z = zoomLabelScale(state.zoomK);
    for (const pou of POU) {
      const { ra_deg, dec_deg } = precessJ2000ToDate(pou.ra * 15, pou.dec, frame.T, pou.pm_ra, pou.pm_dec);
      const lon = normLon((ra_deg / 15 - frame.gmst) * 15);
      const coords = projection([lon, dec_deg]);
      if (!coords) continue;
      drawMarkerGlow(ctx, coords[0], coords[1], pou.color, z);
      drawMarkerLabel(ctx, frame.placedLabels, coords[0], coords[1], pou.anaStar, pou.color, state.zoomK);
    }
  },
};

export const ruaLayer: RenderLayer = {
  name: 'rua',
  enabled: (state) => state.isVisible('rua'),

  render(ctx: CanvasRenderingContext2D, state: AppState, deps: RenderDeps): void {
    const { frame, projection } = deps;

    // Draw corridor arcs
    for (const rua of RUA) {
      drawRuaArc(ctx, rua, frame.gmst, frame.epsRad, projection);
    }

    // Draw ta'urua marker stars on top
    const z = zoomLabelScale(state.zoomK);
    for (const rua of RUA) {
      // Skip rua without fixed marker stars (ecliptic, solstice paths)
      if (rua.markerRa === undefined || rua.markerDec === undefined) continue;

      const { ra_deg, dec_deg } = precessJ2000ToDate(
        rua.markerRa * 15, rua.markerDec, frame.T,
        rua.markerPmRa ?? 0, rua.markerPmDec ?? 0,
      );
      const lon = normLon((ra_deg / 15 - frame.gmst) * 15);
      const coords = projection([lon, dec_deg]);
      if (!coords) continue;
      drawMarkerGlow(ctx, coords[0], coords[1], rua.color, z);
      drawMarkerLabel(ctx, frame.placedLabels, coords[0], coords[1], rua.marker, rua.color, state.zoomK);
    }
  },
};