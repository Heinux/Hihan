// ── Wind particle system — real-time wind flow visualization ──
// Renders animated particles on a transparent offscreen canvas, advected by
// GFS wind data in geographic space, then composited onto the main canvas.
// Trail fading uses destination-out compositing. Viewport pan resets prevScreen
// to prevent streaks; old trails fade naturally.

import type { GeoProjection } from 'd3';
import { WindGrid } from '@/data/wind-grid';
import { WIND_SPEED_FACTOR, WIND_MAX_AGE_MIN, WIND_MAX_AGE_MAX, WIND_FADE_ALPHA } from '@/core/constants';

// ── Pre-computed color LUT ──────────────────────────────────────────

const COLOR_LUT_SIZE = 64;
const COLOR_LUT: string[] = new Array(COLOR_LUT_SIZE * 4);

(function buildColorLUT() {
  for (let ci = 0; ci < COLOR_LUT_SIZE; ci++) {
    const t = ci / (COLOR_LUT_SIZE - 1);
    let r: number, g: number, b: number;
    if (t < 0.15) {
      r = 80; g = 200; b = 220;
    } else if (t < 0.3) {
      const s = (t - 0.15) / 0.15;
      r = 80 + s * 40; g = 200 + s * 40; b = 220 - s * 100;
    } else if (t < 0.5) {
      const s = (t - 0.3) / 0.2;
      r = 120 + s * 110; g = 240 - s * 10; b = 120 - s * 80;
    } else if (t < 0.7) {
      const s = (t - 0.5) / 0.2;
      r = 230 + s * 25; g = 230 - s * 100; b = 40 - s * 20;
    } else if (t < 0.85) {
      const s = (t - 0.7) / 0.15;
      r = 255; g = 130 - s * 80; b = 20 + s * 10;
    } else {
      const s = (t - 0.85) / 0.15;
      r = 255; g = 50 + s * 30; b = 30 + s * 120;
    }
    for (let li = 0; li < 4; li++) {
      const lifeRatio = [0.9, 0.65, 0.4, 0.15][li];
      const fadeIn = Math.min(1, (1 - lifeRatio) * 4);
      const fadeOut = Math.min(1, lifeRatio * 5);
      const alpha = fadeIn * fadeOut * (0.07 + t * 0.15);
      COLOR_LUT[ci * 4 + li] = `rgba(${Math.round(r)},${Math.round(g)},${Math.round(b)},${alpha.toFixed(3)})`;
    }
  }
})();

const LINE_WIDTHS = new Float32Array(8);
for (let i = 0; i < 8; i++) LINE_WIDTHS[i] = 0.6 + ((i + 0.5) / 8) * 1.4;

const TRAIL_FADE = WIND_FADE_ALPHA;

// ── Particle system ──────────────────────────────────────────────────

export class WindParticleSystem {
  // SoA particle data
  private lat = new Float32Array(0);
  private lon = new Float32Array(0);
  private sX = new Float32Array(0);
  private sY = new Float32Array(0);
  private pX = new Float32Array(0);
  private pY = new Float32Array(0);
  private pAge = new Float32Array(0);
  private pMaxAge = new Float32Array(0);
  private pSpeed = new Float32Array(0);
  // 0 = need-spawn, 1 = just-spawned (skip 1 frame), 2 = active
  private pState = new Uint8Array(0);

  private offCanvas: HTMLCanvasElement | null = null;
  private offCtx: CanvasRenderingContext2D | null = null;
  private _cssW = 0;
  private _cssH = 0;
  private _dpr = 1;
  // @ts-expect-error — grid is set but not read yet; will be used for particle interpolation
  private _grid: WindGrid | null = null;
  private _lastPanX = NaN;
  private _lastPanY = NaN;
  private _lastZoomK = NaN;
  private _lastViewScale = NaN;
  private _purgeCounter = 0;

  readonly particleCount: number;
  speedFactor = WIND_SPEED_FACTOR;
  maxAgeMin = WIND_MAX_AGE_MIN;
  maxAgeMax = WIND_MAX_AGE_MAX;

  constructor(particleCount?: number) {
    this.particleCount = particleCount ?? (window.innerWidth < 768 ? 4000 : 8000);
  }

  setGrid(grid: WindGrid): void {
    this._grid = grid;
  }

  ensureCanvas(W: number, H: number, dpr: number): void {
    const physW = Math.round(W * dpr);
    const physH = Math.round(H * dpr);
    if (this.offCanvas && this._cssW === W && this._cssH === H && this._dpr === dpr) return;
    this.offCanvas = document.createElement('canvas');
    this.offCanvas.width = physW;
    this.offCanvas.height = physH;
    this.offCtx = this.offCanvas.getContext('2d', { alpha: true })!;
    this.offCtx.scale(dpr, dpr);
    this._cssW = W;
    this._cssH = H;
    this._dpr = dpr;
  }

  reset(): void {
    if (this.pState.length > 0) this.pState.fill(0);
    if (this.offCtx) {
      this.offCtx.clearRect(0, 0, this._cssW, this._cssH);
    }
  }

  private ensureArrays(): void {
    const n = this.particleCount;
    if (this.lat.length >= n) return;
    this.lat = new Float32Array(n);
    this.lon = new Float32Array(n);
    this.sX = new Float32Array(n);
    this.sY = new Float32Array(n);
    this.pX = new Float32Array(n);
    this.pY = new Float32Array(n);
    this.pAge = new Float32Array(n);
    this.pMaxAge = new Float32Array(n);
    this.pSpeed = new Float32Array(n);
    this.pState = new Uint8Array(n); // all 0 = need-spawn
  }

  update(
    gridA: WindGrid,
    gridB: WindGrid | null,
    interpT: number,
    projection: GeoProjection,
    viewport: { W: number; H: number; panX: number; panY: number; zoomK: number; viewScale: number },
    dt: number,
  ): void {
    if (!this.offCtx) return;
    this.ensureArrays();

    const { W, H, panX, panY, zoomK, viewScale } = viewport;
    const vs = viewScale ?? 1;
    const Wv = W / vs;
    const Hv = H / vs;
    const clampedDt = Math.min(dt, 0.05);

    // Detect viewport change (pan, zoom, or viewScale) — clear offscreen canvas to prevent ghost trails
    const panChanged = !isNaN(this._lastPanX) && (Math.round(panX) !== this._lastPanX || Math.round(panY) !== this._lastPanY);
    const zoomChanged = !isNaN(this._lastZoomK) && zoomK !== this._lastZoomK;
    const vsChanged = !isNaN(this._lastViewScale) && viewScale !== this._lastViewScale;
    if (panChanged || zoomChanged || vsChanged) {
      // Clear old trails (they're in screen space, now at wrong positions)
      if (this.offCtx) this.offCtx.clearRect(0, 0, this._cssW, this._cssH);
      // Reset all particles so they re-project to new viewport
      this.pState.fill(0);
    }
    this._lastPanX = Math.round(panX);
    this._lastPanY = Math.round(panY);
    this._lastZoomK = zoomK;
    this._lastViewScale = viewScale;

    this._grid = gridA;
    const speedFactor = this.speedFactor;
    const n = this.particleCount;

    for (let i = 0; i < n; i++) {
      const state = this.pState[i];

      // Need-spawn: spawn a new particle in this slot
      if (state === 0) {
        this.spawnAt(i, gridA, gridB, interpT, projection, viewport);
        continue;
      }

      // Just-spawned: init prevScreen, skip drawing this frame
      if (state === 1) {
        this.pState[i] = 2;
        this.pX[i] = this.sX[i];
        this.pY[i] = this.sY[i];
        continue;
      }

      // Active particle: advect
      this.pX[i] = this.sX[i];
      this.pY[i] = this.sY[i];

      const lat = this.lat[i];
      const lon = this.lon[i];
      const { u, v } = gridB
        ? WindGrid.interpolateTemporal(gridA, gridB, interpT, lat, lon)
        : gridA.interpolate(lat, lon);
      const spd = Math.sqrt(u * u + v * v);
      this.pSpeed[i] = spd;

      const cosLat = Math.cos(lat * Math.PI / 180);
      const dLon = (u * speedFactor * clampedDt) / Math.max(cosLat, 0.01);
      const dLat = v * speedFactor * clampedDt;

      const newLat = lat + dLat;
      const newLon = ((lon + dLon + 180) % 360 + 360) % 360 - 180;

      if (newLat > 89.5 || newLat < -89.5) {
        this.spawnAt(i, gridA, gridB, interpT, projection, viewport);
        continue;
      }

      const projected = projection([newLon, newLat]);
      if (!projected) {
        this.spawnAt(i, gridA, gridB, interpT, projection, viewport);
        continue;
      }

      this.lat[i] = newLat;
      this.lon[i] = newLon;
      this.sX[i] = vs * ((projected[0] - Wv / 2) * zoomK + Wv / 2 + panX / vs);
      this.sY[i] = vs * ((projected[1] - Hv / 2) * zoomK + Hv / 2 + panY / vs);
      this.pAge[i] -= 1;

      if (this.pAge[i] <= 0 || this.sX[i] < -50 || this.sX[i] > W + 50 || this.sY[i] < -50 || this.sY[i] > H + 50) {
        this.spawnAt(i, gridA, gridB, interpT, projection, viewport);
      }
    }
  }

  render(ctx: CanvasRenderingContext2D): void {
    if (!this.offCtx || !this.offCanvas) return;

    const off = this.offCtx;
    const W = this._cssW;
    const H = this._cssH;

    // Fade previous trails
    off.globalCompositeOperation = 'destination-out';
    off.fillStyle = `rgba(0,0,0,${TRAIL_FADE})`;
    off.fillRect(0, 0, W, H);
    off.globalCompositeOperation = 'source-over';

    // Periodic alpha purge: force stuck low-alpha pixels to 0
    // destination-out can't clear 8-bit alpha values below the fade step
    this._purgeCounter++;
    if (this._purgeCounter >= 60) {
      this._purgeCounter = 0;
      const dpr = this._dpr;
      const imgData = off.getImageData(0, 0, Math.round(W * dpr), Math.round(H * dpr));
      const d = imgData.data;
      for (let k = 3; k < d.length; k += 4) {
        if (d[k] > 0 && d[k] < 12) d[k] = 0;
      }
      off.putImageData(imgData, 0, 0);
    }

    // Draw particle segments — single pass, bucket by speed for lineWidth batching
    off.lineCap = 'round';
    const n = this.particleCount;
    const BUCKET_COUNT = 8;

    for (let b = 0; b < BUCKET_COUNT; b++) {
      off.lineWidth = LINE_WIDTHS[b];
      const bucketMin = (b / BUCKET_COUNT) * 25;
      const bucketMax = ((b + 1) / BUCKET_COUNT) * 25;
      let hasPath = false;
      let lastColor = '';

      for (let i = 0; i < n; i++) {
        if (this.pState[i] !== 2) continue;
        const spd = this.pSpeed[i];
        if (spd < bucketMin || spd >= bucketMax) continue;

        const lifeRatio = this.pAge[i] / this.pMaxAge[i];
        if (lifeRatio <= 0) continue;

        const ci = Math.min(COLOR_LUT_SIZE - 1, Math.max(0, Math.round((spd / 25) * (COLOR_LUT_SIZE - 1))));
        const li = lifeRatio > 0.85 ? 0 : lifeRatio > 0.55 ? 1 : lifeRatio > 0.25 ? 2 : 3;
        const color = COLOR_LUT[ci * 4 + li];

        if (color !== lastColor) {
          if (hasPath) off.stroke();
          off.strokeStyle = color;
          off.beginPath();
          lastColor = color;
          hasPath = false;
        }

        off.moveTo(this.pX[i], this.pY[i]);
        off.lineTo(this.sX[i], this.sY[i]);
        hasPath = true;
      }
      if (hasPath) off.stroke();
    }

    // Composite onto main canvas
    ctx.drawImage(this.offCanvas, 0, 0, W, H);
  }

  /** Spawn (or respawn) a particle at slot i */
  private spawnAt(i: number, gridA: WindGrid, gridB: WindGrid | null, interpT: number, projection: GeoProjection, viewport: { W: number; H: number; panX: number; panY: number; zoomK: number; viewScale: number }): void {
    const { lat, lon } = gridA.randomPoint();
    const maxAge = this.maxAgeMin + Math.random() * (this.maxAgeMax - this.maxAgeMin);
    const { u, v } = gridB
      ? WindGrid.interpolateTemporal(gridA, gridB, interpT, lat, lon)
      : gridA.interpolate(lat, lon);
    const spd = Math.sqrt(u * u + v * v);

    const projected = projection([lon, lat]);
    const { W, H, panX, panY, zoomK, viewScale } = viewport;
    const vs = viewScale ?? 1;
    const Wv = W / vs;
    const Hv = H / vs;

    let sx = 0, sy = 0;
    if (projected) {
      sx = vs * ((projected[0] - Wv / 2) * zoomK + Wv / 2 + panX / vs);
      sy = vs * ((projected[1] - Hv / 2) * zoomK + Hv / 2 + panY / vs);
    }

    this.lat[i] = lat;
    this.lon[i] = lon;
    this.sX[i] = sx;
    this.sY[i] = sy;
    this.pX[i] = sx;
    this.pY[i] = sy;
    this.pAge[i] = maxAge;
    this.pMaxAge[i] = maxAge;
    this.pSpeed[i] = spd;
    this.pState[i] = 1; // just-spawned: will init prevScreen next frame
  }
}