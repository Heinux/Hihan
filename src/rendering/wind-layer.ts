/**
 * wind-layer.ts
 *
 * Tahitian wind rose overlay — GFS-reactive.
 *
 * The rose is drawn in SCREEN space (after ctx.restore) so it floats
 * above the map. It has three states:
 *
 *  1. DOCKED  — at the home position (bottom-right), North pointing up.
 *               A dotted circle marks the dock.
 *  2. FOLLOWING — following the cursor, rotating toward geographic North.
 *  3. ANCHORED — frozen at a fixed screen position with frozen rotation.
 *               When GFS wind data is available, the petal matching the
 *               wind direction at the anchored lat/lon is highlighted,
 *               and the wind name + speed are displayed below the rose.
 *
 * Interaction:
 *  - Mousedown/Touch on the rose while docked/anchored → undock + follow.
 *  - Mouseup/Touch-end while following → if near home, snap to dock; else anchor.
 *  - The dock outline is shown whenever the rose is away from home.
 */

import { TAHITIAN_WINDS } from '@/data/wind';
import type { TahitianWind } from '@/data/wind';
import type { WindGrid } from '@/data/wind-grid';
import { screenToGeo } from '@/core/geo';

// ── Visual parameters ───────────────────────────────────────────────
const ROSE_RADIUS        = 56;
const ROSE_INNER_R       = 14;
const ROSE_PETAL_GAP     = 0.08; // angular gap between petals (rad)
const CARDINAL_RADIUS    = ROSE_RADIUS + 14;
const HOME_SNAP_DIST     = ROSE_RADIUS * 1.6; // snap to dock when within this distance
const COLOR_PETAL_BASE   = 'rgba(120,160,210,0.13)';
const COLOR_PETAL_HOVER  = 'rgba(180,210,255,0.32)';
const COLOR_PETAL_ACTIVE = 'rgba(255,200,80,0.35)';
const COLOR_PETAL_STROKE = 'rgba(130,165,210,0.28)';
const COLOR_PETAL_ACTIVE_STROKE = 'rgba(255,210,100,0.55)';
const COLOR_CENTER       = 'rgba(160,195,235,0.55)';
const COLOR_CARDINAL     = 'rgba(200,220,245,0.70)';
const COLOR_NORTH        = 'rgba(255,190,80,0.85)';
const COLOR_DOCK_OUTLINE = 'rgba(130,165,210,0.15)';
const COLOR_DOCK_SNAP    = 'rgba(255,190,80,0.30)';

// ── Viewport state for rotation ─────────────────────────────────
export interface WindRoseViewport {
  W: number;
  H: number;
  panX: number;
  panY: number;
  zoomK: number;
  viewScale: number;
}

// ── State ───────────────────────────────────────────────────────
let _mapRotationDeg = 0;
let _mouseX = 0;
let _mouseY = 0;
let _isDocked = true;       // starts docked
let _isFixed = false;       // anchored at a custom position
let _fixedX = 0;
let _fixedY = 0;
let _fixedRotation = 0;
let _hoveredWindIdx: number | null = null;
let _roseCx = 0, _roseCy = 0;
let _nearHome = false;      // true while dragging near the dock

// GFS-reactive active wind
let _activeWindIdx: number | null = null;
let _activeWindSpeed = 0;   // m/s

// ── Home position ───────────────────────────────────────────────
function getHomePos(W: number, H: number): { x: number; y: number } {
  const margin = ROSE_RADIUS + CARDINAL_RADIUS + 16;
  return { x: W - margin, y: H - margin };
}

// ── Hit / snap detection ────────────────────────────────────────
export function isRoseHit(mx: number, my: number): boolean {
  return Math.hypot(mx - _roseCx, my - _roseCy) < ROSE_RADIUS + CARDINAL_RADIUS + 4;
}

export function isNearHome(mx: number, my: number, W: number, H: number): boolean {
  const home = getHomePos(W, H);
  return Math.hypot(mx - home.x, my - home.y) < HOME_SNAP_DIST;
}

// ── State transitions ────────────────────────────────────────────
export function dockRose(): void {
  _isDocked = true;
  _isFixed = false;
  _nearHome = false;
  _activeWindIdx = null;
  _activeWindSpeed = 0;
}

export function anchorRose(mx: number, my: number): void {
  _isDocked = false;
  _isFixed = true;
  _fixedX = mx;
  _fixedY = my;
  _fixedRotation = _mapRotationDeg;
  _nearHome = false;
}

export function undockRose(): void {
  _isDocked = false;
  _isFixed = false;
  _nearHome = false;
}

export function isRoseDocked(): boolean {
  return _isDocked;
}

export function isWindRoseFixed(): boolean {
  return _isFixed;
}

// ── Compute rotation ────────────────────────────────────────────
export function setMapRotationFromMouse(
  mx: number,
  my: number,
  projection: d3.GeoProjection,
  hem: 'N' | 'S' = 'N',
  viewport?: WindRoseViewport,
): void {
  _mouseX = mx;
  _mouseY = my;

  const poleLat = hem === 'N' ? 90 : -90;
  const pole = projection([0, poleLat]);
  if (!pole) return;

  let poleScreenX: number;
  let poleScreenY: number;

  if (viewport) {
    const { W, H, panX, panY, zoomK, viewScale: vs } = viewport;
    const Wv = W / vs, Hv = H / vs;
    poleScreenX = vs * ((pole[0] - Wv / 2) * zoomK + Wv / 2 + panX / vs);
    poleScreenY = vs * ((pole[1] - Hv / 2) * zoomK + Hv / 2 + panY / vs);
  } else {
    poleScreenX = pole[0];
    poleScreenY = pole[1];
  }

  const dx = poleScreenX - mx;
  const dy = poleScreenY - my;
  if (Math.hypot(dx, dy) < 0.5) return;

  const angleDeg = Math.atan2(dy, dx) * 180 / Math.PI;
  _mapRotationDeg = angleDeg + (hem === 'N' ? 90 : -90);
}

// ── Hover ────────────────────────────────────────────────────────
export function getHoveredWind(): TahitianWind | null {
  return _hoveredWindIdx !== null ? TAHITIAN_WINDS[_hoveredWindIdx] : null;
}

export function checkWindHover(mx: number, my: number, visible: boolean = true): boolean {
  if (!visible) {
    if (_hoveredWindIdx !== null) { _hoveredWindIdx = null; return true; }
    return false;
  }
  const dx = mx - _roseCx;
  const dy = my - _roseCy;
  const dist = Math.hypot(dx, dy);

  if (dist > ROSE_RADIUS + CARDINAL_RADIUS + 4 || dist < ROSE_INNER_R) {
    if (_hoveredWindIdx !== null) { _hoveredWindIdx = null; return true; }
    return false;
  }

  const rotation = _isDocked ? 0 : (_isFixed ? _fixedRotation : _mapRotationDeg);
  const rotRad = (rotation * Math.PI) / 180;

  const localAngle = Math.atan2(dy, dx) - rotRad;
  const azimuthRad = localAngle + Math.PI / 2;
  const azimuthDeg = ((azimuthRad * 180 / Math.PI) + 360) % 360;

  const idx = Math.round(azimuthDeg / 22.5) % 16;
  if (_hoveredWindIdx !== idx) { _hoveredWindIdx = idx; return true; }
  return false;
}

// ── GFS-reactive active wind ────────────────────────────────────
export function updateActiveWind(
  projection: d3.GeoProjection,
  viewport: WindRoseViewport,
  windGrid: WindGrid | null,
): void {
  if (!windGrid || !_isFixed) {
    _activeWindIdx = null;
    _activeWindSpeed = 0;
    return;
  }

  const geo = screenToGeo(_fixedX, _fixedY, projection, viewport);
  if (!geo) {
    _activeWindIdx = null;
    _activeWindSpeed = 0;
    return;
  }

  const [lon, lat] = geo;
  const { u, v } = windGrid.interpolate(lat, lon);
  const speed = Math.sqrt(u * u + v * v);
  _activeWindSpeed = speed;

  // Meteorological convention: direction wind comes FROM
  // u = eastward, v = northward → FROM direction = atan2(-u, -v)
  let dirDeg = Math.atan2(-u, -v) * 180 / Math.PI;
  dirDeg = ((dirDeg % 360) + 360) % 360;

  _activeWindIdx = Math.round(dirDeg / 22.5) % 16;
}

export function getActiveWind(): TahitianWind | null {
  return _activeWindIdx !== null ? TAHITIAN_WINDS[_activeWindIdx] : null;
}

export function getActiveWindSpeed(): number {
  return _activeWindSpeed;
}

// ── Drawing ─────────────────────────────────────────────────────
export function drawWindRose(
  ctx: CanvasRenderingContext2D,
  W: number,
  H: number,
  _hem: 'N' | 'S' = 'N',
): void {
  const home = getHomePos(W, H);

  // Determine center and rotation based on state
  let cx: number, cy: number, rotation: number;
  if (_isDocked) {
    cx = home.x;
    cy = home.y;
    rotation = 0; // North up when docked
  } else if (_isFixed) {
    cx = _fixedX;
    cy = _fixedY;
    rotation = _fixedRotation;
  } else {
    cx = _mouseX;
    cy = _mouseY;
    rotation = _mapRotationDeg;
  }

  // Clamp inside viewport
  const margin = ROSE_RADIUS + CARDINAL_RADIUS + 10;
  cx = Math.max(margin, Math.min(W - margin, cx));
  cy = Math.max(margin, Math.min(H - margin, cy));
  _roseCx = cx; _roseCy = cy;

  // Update near-home flag (used for snap visual feedback)
  if (!_isDocked) {
    _nearHome = Math.hypot(cx - home.x, cy - home.y) < HOME_SNAP_DIST;
  } else {
    _nearHome = false;
  }

  // ── Dock outline (dotted circle at home) ──
  if (!_isDocked) {
    ctx.save();
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = _nearHome ? COLOR_DOCK_SNAP : COLOR_DOCK_OUTLINE;
    ctx.lineWidth = _nearHome ? 1.5 : 1;
    ctx.beginPath();
    ctx.arc(home.x, home.y, ROSE_RADIUS + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Rose ──
  const N = TAHITIAN_WINDS.length;
  const sector = (Math.PI * 2) / N;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((rotation * Math.PI) / 180);

  // ── Petals ──
  for (let i = 0; i < N; i++) {
    const wind = TAHITIAN_WINDS[i];
    const midAngle = (wind.azimuth * Math.PI) / 180 - Math.PI / 2;
    const startA = midAngle - sector / 2 + ROSE_PETAL_GAP;
    const endA   = midAngle + sector / 2 - ROSE_PETAL_GAP;

    const isCardinal = wind.azimuth % 90 === 0;
    const isInter    = wind.azimuth % 45 === 0;
    const outerR = isCardinal ? ROSE_RADIUS : isInter ? ROSE_RADIUS * 0.82 : ROSE_RADIUS * 0.64;
    const hovered = _hoveredWindIdx === i;
    const isActive = _activeWindIdx === i;

    ctx.beginPath();
    ctx.arc(0, 0, outerR, startA, endA);
    ctx.arc(0, 0, ROSE_INNER_R, endA, startA, true);
    ctx.closePath();

    if (hovered) {
      ctx.fillStyle = COLOR_PETAL_HOVER;
      ctx.strokeStyle = 'rgba(180,210,255,0.55)';
    } else if (isActive) {
      ctx.fillStyle = COLOR_PETAL_ACTIVE;
      ctx.strokeStyle = COLOR_PETAL_ACTIVE_STROKE;
    } else if (i === 0) {
      ctx.fillStyle = 'rgba(255,190,80,0.18)';
      ctx.strokeStyle = COLOR_PETAL_STROKE;
    } else {
      ctx.fillStyle = COLOR_PETAL_BASE;
      ctx.strokeStyle = COLOR_PETAL_STROKE;
    }
    ctx.lineWidth = hovered || isActive ? 1.2 : 0.8;
    ctx.fill();
    ctx.stroke();

    // Arrow tip for cardinal directions
    if (isCardinal) {
      const tipX = Math.cos(midAngle) * (outerR + 6);
      const tipY = Math.sin(midAngle) * (outerR + 6);
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(Math.cos(midAngle) * outerR - Math.sin(midAngle) * 3.5, Math.sin(midAngle) * outerR + Math.cos(midAngle) * 3.5);
      ctx.lineTo(Math.cos(midAngle) * outerR + Math.sin(midAngle) * 3.5, Math.sin(midAngle) * outerR - Math.cos(midAngle) * 3.5);
      ctx.fillStyle = i === 0 ? COLOR_NORTH : COLOR_CENTER;
      ctx.fill();
    }
  }

  // ── Cardinal labels (N, E, S, O) ──
  const cardinals = [
    { a: 0,   t: 'N', c: COLOR_NORTH },
    { a: 90,  t: 'E', c: COLOR_CARDINAL },
    { a: 180, t: 'S', c: COLOR_CARDINAL },
    { a: 270, t: 'O', c: COLOR_CARDINAL },
  ];
  ctx.font = 'bold 10px "DM Mono", monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  for (const c of cardinals) {
    const rad = (c.a * Math.PI) / 180 - Math.PI / 2;
    ctx.save();
    ctx.translate(Math.cos(rad) * CARDINAL_RADIUS, Math.sin(rad) * CARDINAL_RADIUS);
    ctx.rotate((-rotation * Math.PI) / 180);
    ctx.fillStyle = c.c;
    ctx.fillText(c.t, 0, 0);
    ctx.restore();
  }

  ctx.restore();

  // ── Active wind info label (below the rose) ──
  if (_isFixed && _activeWindIdx !== null) {
    const wind = TAHITIAN_WINDS[_activeWindIdx];
    const speedKmh = _activeWindSpeed * 3.6; // m/s → km/h
    const label = `${wind.name} \u00B7 ${wind.label} \u00B7 ${speedKmh.toFixed(1)} km/h`;

    ctx.save();
    ctx.font = '600 9px "DM Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const labelY = cy + ROSE_RADIUS + 6;
    const metrics = ctx.measureText(label);
    const padX = 5, padY = 3;
    const bgW = metrics.width + padX * 2;
    const bgH = 9 + padY * 2;
    const bgX = cx - bgW / 2;
    const bgY = labelY - padY;

    ctx.fillStyle = 'rgba(12,24,40,0.78)';
    ctx.beginPath();
    ctx.roundRect(bgX, bgY, bgW, bgH, 4);
    ctx.fill();
    ctx.strokeStyle = 'rgba(120,150,190,0.25)';
    ctx.lineWidth = 0.5;
    ctx.stroke();

    ctx.fillStyle = 'rgba(210,225,245,0.85)';
    ctx.fillText(label, cx, labelY);
    ctx.restore();
  }
}