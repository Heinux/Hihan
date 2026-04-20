// ── Panel toggle buttons (left overlay, close button) ──────────────────

import type { AppState } from '@/core/state';

export function setupPanelToggles(appState: AppState): {
  updateToggleArrows: () => void;
  addCloseButtons: () => void;
} {
  const overlayLeft = document.getElementById('overlayLeftToggle') as HTMLElement | null;

  function updateToggleArrows(): void {
    const leftPanel = document.getElementById('panel');
    if (leftPanel) {
      overlayLeft?.classList.toggle('open', !leftPanel.classList.contains('hidden'));
    }
  }

  if (overlayLeft) overlayLeft.addEventListener('click', () => {
    document.getElementById('panel')?.classList.toggle('hidden');
    updateToggleArrows();
    appState.needsRedraw = true;
  });

  function addCloseButtons(): void {
    const panel = document.getElementById('panel');
    if (panel && !panel.querySelector('.panel-close')) {
      const btn = document.createElement('div');
      btn.className = 'panel-close';
      btn.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none"><polyline points="18,6 6,18" stroke="#a0b9d7" stroke-width="2.5" stroke-linecap="round"/><polyline points="6,6 18,18" stroke="#a0b9d7" stroke-width="2.5" stroke-linecap="round"/></svg>';
      btn.addEventListener('click', () => {
        panel.classList.add('hidden');
        updateToggleArrows();
        appState.needsRedraw = true;
      });
      panel.appendChild(btn);
    }
  }

  return { updateToggleArrows, addCloseButtons };
}