import { describe, it, expect } from 'vitest';
import { createFPSCounter } from '@/ui/fps-counter';

describe('createFPSCounter', () => {
  it('does not update text before 500ms elapsed', () => {
    const el = { textContent: '' } as any as HTMLElement;
    const fps = createFPSCounter(el);
    const base = performance.now();
    fps.update(base);
    fps.update(base + 100);
    fps.update(base + 400);
    expect(el.textContent).toBe('');
  });

  it('updates FPS text after 500ms', () => {
    const el = { textContent: '' } as any as HTMLElement;
    const fps = createFPSCounter(el);
    const base = performance.now();
    fps.update(base);
    fps.update(base + 100);
    fps.update(base + 300);
    fps.update(base + 501);
    expect(el.textContent).toContain('fps');
  });

  it('calculates correct FPS rate', () => {
    const el = { textContent: '' } as any as HTMLElement;
    const fps = createFPSCounter(el);
    const base = performance.now();
    // 6 update calls in ~500ms ≈ 12 fps
    fps.update(base);
    fps.update(base + 100);
    fps.update(base + 200);
    fps.update(base + 300);
    fps.update(base + 400);
    fps.update(base + 501);
    expect(el.textContent).toBe('12 fps');
  });
});