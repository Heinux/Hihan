import { describe, it, expect } from 'vitest';
import { AppState } from '@/core/state';

describe('AppState', () => {
  it('initializes viewport with defaults', () => {
    const state = new AppState();
    expect(state.viewport.W).toBe(0);
    expect(state.viewport.H).toBe(0);
    expect(state.viewport.zoomK).toBeGreaterThan(0);
    expect(state.viewport.panX).toBe(0);
    expect(state.viewport.panY).toBe(0);
    expect(state.viewport.viewScale).toBe(1);
  });

  it('initializes time with defaults', () => {
    const state = new AppState();
    expect(state.time.isPaused).toBe(false);
    expect(state.time.isRealtime).toBe(true);
    expect(state.time.currentJD).toBeNull();
    expect(state.time.userTimezone).toBeTruthy();
  });

  it('initializes celestial with defaults', () => {
    const state = new AppState();
    expect(state.celestial.bodyPositions).toEqual([]);
    expect(state.celestial.moonPhaseDeg).toBe(0);
    expect(state.celestial.currentSunEclLon).toBe(0);
  });

  it('initializes enoch with defaults', () => {
    const state = new AppState();
    expect(state.enoch.enochHem).toBe('N');
    expect(state.enoch.enochAnimFactor).toBe(0);
  });

  it('getAstroJD returns currentJD when set', () => {
    const state = new AppState();
    state.currentJD = 2451545.0;
    expect(state.getAstroJD()).toBe(2451545.0);
  });

  it('getAstroJD computes from currentTime when currentJD is null', () => {
    const state = new AppState();
    state.currentJD = null;
    state.currentTime = new Date('2000-01-01T12:00:00Z');
    const jd = state.getAstroJD();
    expect(jd).toBeCloseTo(2451545.0, -1);
  });

  it('emits viewport:zoom when zoomK is set', () => {
    const state = new AppState();
    let received: { zoomK: number } | undefined;
    state.on('viewport:zoom', (data) => { received = data; });
    state.zoomK = 2.0;
    expect(received).toEqual({ zoomK: 2.0 });
    expect(state.viewport.zoomK).toBe(2.0);
  });

  it('emits time:changed when isPaused is set', () => {
    const state = new AppState();
    let received = false;
    state.on('time:changed', () => { received = true; });
    state.isPaused = true;
    expect(received).toBe(true);
  });

  it('emits hemisphere:changed when enochHem is set', () => {
    const state = new AppState();
    let received: { hem: 'N' | 'S' } | undefined;
    state.on('hemisphere:changed', (data) => { received = data; });
    state.enochHem = 'S';
    expect(received).toEqual({ hem: 'S' });
  });

  it('needsRedraw defaults to true', () => {
    const state = new AppState();
    expect(state.needsRedraw).toBe(true);
  });

  it('cleanup removes all listeners', () => {
    const state = new AppState();
    let called = false;
    state.on('redraw', () => { called = true; });
    state.cleanup();
    state.emit('redraw');
    expect(called).toBe(false);
  });

  it('isVisible returns false before cacheCheckboxes is called', () => {
    const state = new AppState();
    expect(state.isVisible('Sun')).toBe(false);
    expect(state.isVisible('zodiac')).toBe(false);
  });

  it('backward-compat getters delegate to sub-objects', () => {
    const state = new AppState();
    state.viewport.W = 800;
    expect(state.W).toBe(800);
    state.W = 1024;
    expect(state.viewport.W).toBe(1024);
  });
});