import type { AppState } from '@/core/state';
import type { RenderLayer, RenderDeps } from '@/rendering/render-pipeline';
import { isWindUnavailable, getWindInterpT, getWindGridB } from '@/main/wind-manager';
import { DT_FALLBACK } from '@/core/constants';

export const windParticlesLayer: RenderLayer = {
  name: 'wind-particles',

  enabled(state: AppState): boolean {
    return state.isVisible('windParticles') && !!state.windGrid && !isWindUnavailable();
  },

  render(ctx: CanvasRenderingContext2D, state: AppState, deps: RenderDeps): void {
    if (!deps.windSystem) return;
    const dpr = window.devicePixelRatio || 1;
    deps.windSystem.ensureCanvas(state.W, state.H, dpr);

    let windDt = deps.frame.dt || DT_FALLBACK;
    if (!state.isRealtime && !state.isPaused) {
      const stepScale =
        state.timeStepUnit === 'hour' ? 60 :
        state.timeStepUnit === 'day' ? 300 :
        state.timeStepUnit === 'month' ? 600 :
        state.timeStepUnit === 'year' ? 1200 :
        state.timeStepUnit === 'min' ? 5 : 1;
      windDt = Math.min((deps.frame.dt || DT_FALLBACK) * stepScale, 0.5);
    }

    const gridB = getWindGridB();
    deps.windSystem.update(state.windGrid!, gridB, getWindInterpT(), deps.projection, state, windDt);
    deps.windSystem.render(ctx);
  },
};