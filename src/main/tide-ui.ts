// ── Tide panel open/close and curve drawing ─────────────────────────────

import type { AppState } from '@/core/state';
import { computeTideState, computeTideCurve, formatTideHeight } from '@/core/tide';
import type { TideResult, TideCurvePoint } from '@/core/tide';
import { drawTideCurve } from '@/rendering/tide-curve';

let _tidePanelOpen = false;
let _cachedTideState: TideResult | null = null;
let _cachedTideCurve: TideCurvePoint[] = [];
let _tideBtn: HTMLButtonElement | null;
let _tidePanel: HTMLElement | null;
let _tideCurveCanvas: HTMLCanvasElement | null;
let _tideCurveCtx: CanvasRenderingContext2D | null;

export function isTidePanelOpen(): boolean { return _tidePanelOpen; }

export function getCachedTideState(): TideResult | null { return _cachedTideState; }

export function openTidePanel(): void {
  if (!_tidePanel) return;
  _tidePanel.classList.add('visible');
  _tidePanelOpen = true;
  if (_tideBtn) _tideBtn.classList.add('active');
  requestAnimationFrame(() => drawTideCurveIfOpen());
}

export function closeTidePanel(): void {
  if (!_tidePanel) return;
  _tidePanel.classList.remove('visible');
  _tidePanelOpen = false;
  if (_tideBtn) _tideBtn.classList.remove('active');
}

function drawTideCurveIfOpen(): void {
  if (!_tideCurveCanvas || !_tideCurveCtx || !_cachedTideState) return;
  const dpr = window.devicePixelRatio || 1;
  const rect = _tideCurveCanvas.getBoundingClientRect();
  const cw = Math.round(rect.width);
  if (cw <= 0) return;
  _tideCurveCanvas.width = cw * dpr;
  _tideCurveCanvas.height = 220 * dpr;
  _tideCurveCanvas.style.height = '220px';
  drawTideCurve({
    ctx: _tideCurveCtx,
    W: cw,
    H: 220,
    dpr,
    curve: _cachedTideCurve,
    isRising: _cachedTideState.isRising,
    springNeapLabel: _cachedTideState.springNeapLabel,
    lastExtremumTimeStr: _cachedTideState.lastExtremumTimeStr,
    lastExtremumLabel: _cachedTideState.lastExtremumLabel,
    nextExtremumTimeStr: _cachedTideState.nextExtremumTimeStr,
    nextExtremumLabel: _cachedTideState.nextExtremumLabel,
  });
}

export function drawTideCurveIfReady(): void {
  if (_tidePanelOpen && _cachedTideState) {
    drawTideCurveIfOpen();
  }
}

/** Update cached tide data from the main draw loop */
export function updateTideCache(params: Parameters<typeof computeTideState>[0]): void {
  _cachedTideState = computeTideState(params);
  _cachedTideCurve = computeTideCurve(params);
}

export function clearTideCache(): void {
  _cachedTideState = null;
  _cachedTideCurve = [];
}

export function setupTideUI(state: AppState): void {
  _tideBtn = document.getElementById('tideBtn') as HTMLButtonElement | null;
  _tidePanel = document.getElementById('tidePanel') as HTMLElement | null;
  _tideCurveCanvas = document.getElementById('tideCurveCanvas') as HTMLCanvasElement | null;
  _tideCurveCtx = _tideCurveCanvas?.getContext('2d') ?? null;

  if (_tideBtn) _tideBtn.addEventListener('click', () => {
    const cb = document.getElementById('show-tideLayers') as HTMLInputElement | null;
    if (!_tidePanelOpen) {
      if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
      openTidePanel();
    } else {
      if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
      closeTidePanel();
    }
    state.invalidateCheckboxCache();
    state.needsRedraw = true;
  });
}

/** Format tide info for the top bar display */
export function formatTideTopBar(): string | null {
  if (!_cachedTideState) return null;
  const t = _cachedTideState;
  const arrow = t.isRising ? '↑' : '↓';
  const shortLabel = t.springNeapLabel.replace('Marée de ', '').replace('Marée ', '');
  return `<span class="tide-height-label">≋</span> ${arrow}${formatTideHeight(t.heightMeters)} · <span class="tide-spring-neap-label">${shortLabel}</span> · <span class="tide-next-high-label">${t.lastExtremumLabel}</span> ${t.lastExtremumTimeStr} · <span class="tide-next-low-label">${t.nextExtremumLabel}</span> ${t.nextExtremumTimeStr}`;
}