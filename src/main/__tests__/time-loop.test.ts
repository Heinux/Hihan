import { describe, it, expect } from 'vitest';
import { createTimeLoop } from '@/main/time-loop';

function createMockState(opts: { isRealtime?: boolean; isPaused?: boolean; timeStepUnit?: string; timeStepVal?: number } = {}): any {
  return {
    isRealtime: opts.isRealtime ?? false,
    isPaused: opts.isPaused ?? false,
    timeStepUnit: opts.timeStepUnit ?? 'sec',
    timeStepVal: opts.timeStepVal ?? 1,
    currentTime: new Date(),
    currentJD: null,
  };
}

describe('createTimeLoop', () => {
  it('returns dt in seconds', () => {
    const loop = createTimeLoop();
    const dt = loop.dt(1000);
    expect(typeof dt).toBe('number');
  });

  it('returns false when paused and not realtime', () => {
    const loop = createTimeLoop();
    const state = createMockState({ isPaused: true, isRealtime: false });
    expect(loop.advance(performance.now(), state)).toBe(false);
  });

  it('returns true on first realtime call (lastRealtimeSec starts at -1)', () => {
    const loop = createTimeLoop();
    const state = createMockState({ isRealtime: true });
    // The internal lastRealtimeSec starts at -1, so first call always returns true
    const result = loop.advance(performance.now(), state);
    expect(result).toBe(true);
  });

  it('returns false on same realtime second', () => {
    const loop = createTimeLoop();
    const state = createMockState({ isRealtime: true });
    const now = performance.now();
    loop.advance(now, state);
    // Same second → false
    expect(loop.advance(now, state)).toBe(false);
  });

  it('advances time when throttle interval elapsed (sec mode)', () => {
    const loop = createTimeLoop();
    const state = createMockState({ isRealtime: false, isPaused: false, timeStepUnit: 'sec', timeStepVal: 1 });
    const now = performance.now();
    loop.advance(now, state);
    // After 1 second → should advance
    expect(loop.advance(now + 1001, state)).toBe(true);
  });

  it('does not advance before throttle interval', () => {
    const loop = createTimeLoop();
    const state = createMockState({ isRealtime: false, isPaused: false, timeStepUnit: 'min', timeStepVal: 1 });
    const now = performance.now();
    loop.advance(now, state);
    // 30ms < 50ms throttle → no advance
    expect(loop.advance(now + 30, state)).toBe(false);
  });
});