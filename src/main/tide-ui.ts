// ── Tide panel open/close and curve drawing ─────────────────────────────

import type { AppState } from '@/core/state';
import { computeTideState, computeTideCurve, formatTideHeight } from '@/core/tide';
import type { TideResult, TideCurvePoint } from '@/core/tide';
import { drawTideCurve } from '@/rendering/tide-curve';

export class TideUIManager {
  #panelOpen = false;
  #cachedTideState: TideResult | null = null;
  #cachedTideCurve: TideCurvePoint[] = [];
  #tideBtn: HTMLButtonElement | null = null;
  #tidePanel: HTMLElement | null = null;
  #tideCurveCanvas: HTMLCanvasElement | null = null;
  #tideCurveCtx: CanvasRenderingContext2D | null = null;

  isPanelOpen(): boolean { return this.#panelOpen; }

  getCachedState(): TideResult | null { return this.#cachedTideState; }

  openPanel(): void {
    if (!this.#tidePanel) return;
    this.#tidePanel.classList.add('visible');
    this.#panelOpen = true;
    if (this.#tideBtn) this.#tideBtn.classList.add('active');
    requestAnimationFrame(() => this.#drawCurveIfOpen());
  }

  closePanel(): void {
    if (!this.#tidePanel) return;
    this.#tidePanel.classList.remove('visible');
    this.#panelOpen = false;
    if (this.#tideBtn) this.#tideBtn.classList.remove('active');
  }

  #drawCurveIfOpen(): void {
    if (!this.#tideCurveCanvas || !this.#tideCurveCtx || !this.#cachedTideState) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = this.#tideCurveCanvas.getBoundingClientRect();
    const cw = Math.round(rect.width);
    if (cw <= 0) return;
    const curveH = window.innerWidth < 640 ? 120 : 220;
    this.#tideCurveCanvas.width = cw * dpr;
    this.#tideCurveCanvas.height = curveH * dpr;
    this.#tideCurveCanvas.style.height = curveH + 'px';
    drawTideCurve({
      ctx: this.#tideCurveCtx,
      W: cw,
      H: curveH,
      dpr,
      curve: this.#cachedTideCurve,
      isRising: this.#cachedTideState.isRising,
      springNeapLabel: this.#cachedTideState.springNeapLabel,
      lastExtremumTimeStr: this.#cachedTideState.lastExtremumTimeStr,
      lastExtremumLabel: this.#cachedTideState.lastExtremumLabel,
      nextExtremumTimeStr: this.#cachedTideState.nextExtremumTimeStr,
      nextExtremumLabel: this.#cachedTideState.nextExtremumLabel,
    });
  }

  drawCurveIfReady(): void {
    if (this.#panelOpen && this.#cachedTideState) {
      this.#drawCurveIfOpen();
    }
  }

  updateCache(params: Parameters<typeof computeTideState>[0]): void {
    this.#cachedTideState = computeTideState(params);
    this.#cachedTideCurve = computeTideCurve(params);
  }

  clearCache(): void {
    this.#cachedTideState = null;
    this.#cachedTideCurve = [];
  }

  setupUI(state: AppState): void {
    this.#tideBtn = document.getElementById('tideBtn') as HTMLButtonElement | null;
    this.#tidePanel = document.getElementById('tidePanel') as HTMLElement | null;
    this.#tideCurveCanvas = document.getElementById('tideCurveCanvas') as HTMLCanvasElement | null;
    this.#tideCurveCtx = this.#tideCurveCanvas?.getContext('2d') ?? null;

    if (this.#tideBtn) this.#tideBtn.addEventListener('click', () => {
      const cb = document.getElementById('show-tideLayers') as HTMLInputElement | null;
      if (!this.#panelOpen) {
        if (cb && !cb.checked) { cb.checked = true; cb.dispatchEvent(new Event('change')); }
        this.openPanel();
      } else {
        if (cb && cb.checked) { cb.checked = false; cb.dispatchEvent(new Event('change')); }
        this.closePanel();
      }
      state.invalidateCheckboxCache();
      state.needsRedraw = true;
    });
  }

  formatTopBar(): string | null {
    if (!this.#cachedTideState) return null;
    const t = this.#cachedTideState;
    const arrow = t.isRising ? '↑' : '↓';
    const shortLabel = t.springNeapLabel.replace('Marée de ', '').replace('Marée ', '');
    return `<span class="tide-height-label">≋</span> ${arrow}${formatTideHeight(t.heightMeters)} · <span class="tide-spring-neap-label">${shortLabel}</span> · <span class="tide-next-high-label">${t.lastExtremumLabel}</span> ${t.lastExtremumTimeStr} · <span class="tide-next-low-label">${t.nextExtremumLabel}</span> ${t.nextExtremumTimeStr}`;
  }
}

// Singleton for production use
export const tideUIManager = new TideUIManager();

// Convenience re-exports that delegate to the singleton
export const isTidePanelOpen = () => tideUIManager.isPanelOpen();
export const getCachedTideState = () => tideUIManager.getCachedState();
export const openTidePanel = () => tideUIManager.openPanel();
export const closeTidePanel = () => tideUIManager.closePanel();
export const drawTideCurveIfReady = () => tideUIManager.drawCurveIfReady();
export const updateTideCache = (params: Parameters<typeof computeTideState>[0]) => tideUIManager.updateCache(params);
export const clearTideCache = () => tideUIManager.clearCache();
export const setupTideUI = (state: AppState) => tideUIManager.setupUI(state);
export const formatTideTopBar = () => tideUIManager.formatTopBar();