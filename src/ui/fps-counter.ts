export function createFPSCounter(updateEl: HTMLElement): { update: (now: number) => void } {
  let frames = 0;
  let last = performance.now();

  return {
    update(now: number): void {
      frames++;
      if (now - last >= 500) {
        updateEl.textContent = Math.round(frames / ((now - last) / 1000)) + ' fps';
        frames = 0;
        last = now;
      }
    },
  };
}