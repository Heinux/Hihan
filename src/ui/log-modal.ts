import type { AlertSystem } from '@/features/alerts';
import type { AppState } from '@/core/state';
import { syncDateInput } from '@/ui/ui-panel';

export function setupLogModal(alertSystem: AlertSystem, state: AppState): void {
  const logModal = document.getElementById('logModal') as HTMLElement | null;
  const openLogBtn = document.getElementById('openLog') as HTMLElement | null;
  const closeLogBtn = document.getElementById('closeLog') as HTMLElement | null;
  const clearLogBtn = document.getElementById('clearLog') as HTMLElement | null;
  const exportLogBtn = document.getElementById('exportLog') as HTMLElement | null;
  const logListEl = document.getElementById('logList') as HTMLElement | null;

  if (openLogBtn) openLogBtn.addEventListener('click', () => {
    alertSystem.renderLogList(logListEl!, (jd: number) => {
      state.currentJD = jd;
      syncDateInput(state);
      state.needsRedraw = true;
      if (logModal) logModal.classList.remove('visible');
    });
    if (logModal) logModal.classList.add('visible');
  });
  if (closeLogBtn) closeLogBtn.addEventListener('click', () => {
    if (logModal) logModal.classList.remove('visible');
  });
  if (clearLogBtn) clearLogBtn.addEventListener('click', () => {
    alertSystem.clearLog();
    alertSystem.renderLogList(logListEl!);
  });
  if (exportLogBtn) exportLogBtn.addEventListener('click', () => alertSystem.exportCSV());
}