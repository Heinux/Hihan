import { advanceTime } from '@/core/time';
import type { AppState } from '@/core/state';

const STEP_THROTTLE_MS: Record<string, number> = {
  sec: Infinity,
  min: 50,
  hour: 200,
  day: 80,
  month: 250,
  year: 500,
};

export interface TimeLoopState {
  lastFrameTime: number;
  lastAdvanceTime: number;
  lastRealtimeSec: number;
}

export function createTimeLoop(): { state: TimeLoopState; advance: (now: number, state: AppState) => boolean; dt: (now: number) => number } {
  const loopState: TimeLoopState = {
    lastFrameTime: performance.now(),
    lastAdvanceTime: performance.now(),
    lastRealtimeSec: -1,
  };

  return {
    state: loopState,

    dt(now: number): number {
      const d = (now - loopState.lastFrameTime) / 1000;
      loopState.lastFrameTime = now;
      return d;
    },

    advance(now: number, state: AppState): boolean {
      if (state.isRealtime) {
        state.currentTime = new Date();
        state.currentJD = null;
        const nowSec = Math.floor(performance.now() / 1000);
        if (nowSec !== loopState.lastRealtimeSec) {
          loopState.lastRealtimeSec = nowSec;
          return true;
        }
        return false;
      }

      if (!state.isPaused) {
        const stepMs = STEP_THROTTLE_MS[state.timeStepUnit] ?? 0;
        if (state.timeStepUnit === 'sec') {
          // sec uses proportional to step size
          const elapsed = now - loopState.lastAdvanceTime;
          if (elapsed >= state.timeStepVal * 1000) {
            advanceTime(state);
            loopState.lastAdvanceTime = now;
            return true;
          }
        } else if (stepMs > 0) {
          const elapsed = now - loopState.lastAdvanceTime;
          if (elapsed >= stepMs) {
            advanceTime(state);
            loopState.lastAdvanceTime = now;
            return true;
          }
        }
      }
      return false;
    },
  };
}