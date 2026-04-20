import type { AppState } from '@/core/state';
import { setupTideUI, isTidePanelOpen, closeTidePanel } from '@/main/tide-ui';

export function setupWindTideControls(state: AppState): { updateButtons: () => void } {
  const windBtn = document.getElementById('windBtn') as HTMLButtonElement | null;
  const windRoseBtn = document.getElementById('windRoseBtn') as HTMLButtonElement | null;

  if (windBtn) {
    windBtn.addEventListener('click', () => {
      const cb = document.getElementById('show-windParticles') as HTMLInputElement | null;
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
  }
  if (windRoseBtn) {
    windRoseBtn.addEventListener('click', () => {
      const cb = document.getElementById('show-winds') as HTMLInputElement | null;
      if (cb) { cb.checked = !cb.checked; cb.dispatchEvent(new Event('change')); }
    });
  }

  setupTideUI(state);

  function updateButtons(): void {
    if (windBtn) windBtn.classList.toggle('active', state.isVisible('windParticles'));
    if (windRoseBtn) windRoseBtn.classList.toggle('active', state.isVisible('winds'));
    const tideBtn = document.getElementById('tideBtn') as HTMLButtonElement | null;
    if (tideBtn) {
      tideBtn.classList.toggle('active', isTidePanelOpen());
      if (!state.isVisible('tideLayers') && isTidePanelOpen()) closeTidePanel();
    }
  }

  return { updateButtons };
}