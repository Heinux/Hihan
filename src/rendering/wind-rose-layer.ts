import type { AppState } from '@/core/state';
import type { RenderLayer, RenderDeps } from '@/rendering/render-pipeline';
import { drawWindRose, updateActiveWind } from '@/rendering/wind-layer';
import type { WindRoseViewport } from '@/rendering/wind-layer';

export const windRoseLayer: RenderLayer = {
  name: 'wind-rose',

  enabled(state: AppState): boolean {
    return state.isVisible('winds');
  },

  render(ctx: CanvasRenderingContext2D, state: AppState, deps: RenderDeps): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    updateActiveWind(state.windGrid);
    drawWindRose(ctx, state.W, state.H, state.enochHem, deps.projection, state as WindRoseViewport);
  },
};