/**
 * comet-renderer.ts
 *
 * Draws NEO comets with a bright head glow and a fading tail
 * on the azimuthal equidistant map.
 */

import type { NEOManager, TrailPoint } from '@/features/neo';
import { zoomLabelScale } from '@/core/constants';

// ── Visual constants ───────────────────────────────────────────────

const HEAD_CORE_R = 1.8;
const HEAD_GLOW_R = 6;
const TAIL_MAX_ALPHA = 0.6;
const TAIL_MIN_ALPHA = 0.03;
const TAIL_MIN_WIDTH = 0.4;
const TAIL_MAX_WIDTH = 1.8;
const COLOR_HEAD_CORE = 'rgba(255, 255, 255, 0.95)';
const COLOR_HEAD_GLOW_INNER = 'rgba(200, 240, 255, 0.7)';
const COLOR_HEAD_GLOW_OUTER = 'rgba(100, 200, 255, 0)';
const COLOR_TAIL = [140, 220, 255]; // RGB for tail gradient
const COLOR_LABEL = 'rgba(180, 220, 255, 0.6)';
const MIN_TRAIL_POINTS = 2;

// ── Main draw function ─────────────────────────────────────────────

export function drawComets(
  ctx: CanvasRenderingContext2D,
  neoManager: NEOManager,
  gmst: number,
  T: number,
  vs: number = 1,
  zoomK: number = 1,
): void {
  const positions = neoManager.getNEOPositions(gmst, T);

  for (const neo of positions) {
    drawSingleComet(ctx, neo.px, neo.py, neo.trail, neo.des, neo.dist, vs, zoomK);
  }
}

// ── Single comet ───────────────────────────────────────────────────

function drawSingleComet(
  ctx: CanvasRenderingContext2D,
  headX: number,
  headY: number,
  trail: TrailPoint[],
  des: string,
  dist: number,
  vs: number,
  zoomK: number,
): void {
  const z = zoomLabelScale(zoomK);
  const scale = Math.max(0.5, vs) * z;
  // Scale glow by proximity — closer NEOs are bigger
  const proximityScale = Math.min(2.5, Math.max(0.8, 0.15 / dist));

  // ── Tail ──
  if (trail.length >= MIN_TRAIL_POINTS) {
    ctx.save();

    for (let i = 1; i < trail.length; i++) {
      const t = i / trail.length; // 0 = oldest, 1 = newest (head)
      const alpha = TAIL_MIN_ALPHA + t * (TAIL_MAX_ALPHA - TAIL_MIN_ALPHA);
      const width = TAIL_MIN_WIDTH + t * (TAIL_MAX_WIDTH - TAIL_MIN_WIDTH);
      const [r, g, b] = COLOR_TAIL;

      ctx.beginPath();
      ctx.moveTo(trail[i - 1].px, trail[i - 1].py);
      ctx.lineTo(trail[i].px, trail[i].py);
      ctx.strokeStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
      ctx.lineWidth = width * scale * proximityScale;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    ctx.restore();
  }

  // ── Coma / head glow ──
  const glowR = HEAD_GLOW_R * scale * proximityScale;

  ctx.save();
  const grad = ctx.createRadialGradient(headX, headY, 0, headX, headY, glowR);
  grad.addColorStop(0, COLOR_HEAD_GLOW_INNER);
  grad.addColorStop(0.5, 'rgba(150, 225, 255, 0.25)');
  grad.addColorStop(1, COLOR_HEAD_GLOW_OUTER);
  ctx.beginPath();
  ctx.arc(headX, headY, glowR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();
  ctx.restore();

  // ── Core point ──
  ctx.save();
  ctx.beginPath();
  ctx.arc(headX, headY, HEAD_CORE_R * scale * proximityScale, 0, Math.PI * 2);
  ctx.fillStyle = COLOR_HEAD_CORE;
  ctx.fill();
  ctx.restore();

  // ── Label ──
  ctx.save();
  ctx.font = `300 ${7 * z}px "DM Mono", monospace`;
  ctx.fillStyle = COLOR_LABEL;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText(des, headX + glowR + 2 * z, headY - 2 * z);
  ctx.restore();
}