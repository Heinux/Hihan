import {
  STEP_UNITS, STEP_LABELS,
  GREGORIAN_CUTOVER_JD,
  JULIAN_UNIX_EPOCH, MS_PER_DAY, JS_DATE_MAX_MS,
  MINUTES_PER_DAY, SECONDS_PER_DAY, AVG_MONTH_DAYS,
} from '@/core/constants';
import type { StepUnit } from '@/core/constants';
import { syncDateInput, setupOverlayTimezoneSelect } from '@/ui/ui-panel';
import { calendarToJD, getTzOffsetMinutes, jdToCalendar, formatAstroYear } from '@/core/time';
import type { OverlayState } from '@/core/types';

interface OverlayControlsCleanup {
  onRedraw: () => void;
  onHemSwitch: (hem: 'N' | 'S') => void;
  onStepChange?: (unit: string) => void;
}

export function setupOverlayControls(
  state: OverlayState,
  callbacks: OverlayControlsCleanup,
): () => void {
  const cleanups: (() => void)[] = [];
  let stepSelectorOpen = false;
  let dateModalOpen = false;

  const hemN = document.getElementById('hemN');
  const hemS = document.getElementById('hemS');
  const enochN = document.getElementById('enochN');
  const enochS = document.getElementById('enochS');
  const timeStepBack = document.getElementById('timeStepBack');
  const timeStepForward = document.getElementById('timeStepForward');
  const timePlayPause = document.getElementById('timePlayPause');
  const playPauseIcon = document.getElementById('playPauseIcon');
  const stepIndicator = document.getElementById('stepIndicator');
  const timeNowBtn = document.getElementById('timeNow');
  const calendarBtn = document.getElementById('calendarBtn');
  const stepSelector = document.getElementById('stepSelector');
  const stepGrid = document.getElementById('stepGrid');
  const dateModal = document.getElementById('dateModal');

  // ── Helpers ──────────────────────────────────────────────────────

  function disableRealtime(): void {
    state.isRealtime = false;
    if (timeNowBtn) timeNowBtn.classList.remove('active');
  }

  function updateStepIndicator(): void {
    if (stepIndicator) {
      stepIndicator.textContent = STEP_LABELS[state.timeStepUnit as StepUnit] || '1min';
    }
    updateStepSelectorHighlight();
  }

  function updateHemButtons(): void {
    const isNorth = state.enochHem === 'N';
    hemN?.classList.toggle('active', isNorth);
    hemS?.classList.toggle('active', !isNorth);
    if (enochN) enochN.classList.toggle('hem-active', isNorth);
    if (enochS) enochS.classList.toggle('hem-active', !isNorth);
  }

  function updatePlayPauseIcon(): void {
    if (!playPauseIcon || !timePlayPause) return;
    if (state.isPaused) {
      playPauseIcon.innerHTML = `<polygon points="8,5 19,12 8,19" fill="currentColor"/>`;
      timePlayPause.classList.remove('playing');
    } else {
      playPauseIcon.innerHTML = `<rect x="6" y="4" width="4" height="16" rx="1" fill="currentColor"/><rect x="14" y="4" width="4" height="16" rx="1" fill="currentColor"/>`;
      timePlayPause.classList.add('playing');
    }
  }

  function stepTime(direction: 1 | -1): void {
    disableRealtime();
    const deltaDays: number = (() => {
      switch (state.timeStepUnit) {
        case 'sec':   return direction * state.timeStepVal / SECONDS_PER_DAY;
        case 'min':   return direction * state.timeStepVal / MINUTES_PER_DAY;
        case 'hour':  return direction * state.timeStepVal / 24;
        case 'day':   return direction * state.timeStepVal;
        case 'month': return direction * state.timeStepVal * AVG_MONTH_DAYS;
        case 'year':  return direction * state.timeStepVal * 365.24219;
        default:      return 0;
      }
    })();

    if (state.currentJD !== null) {
      state.currentJD += deltaDays;
    } else {
      const ms = deltaDays * MS_PER_DAY;
      state.currentTime = new Date(state.currentTime.getTime() + ms);
    }
    syncDateInput(state);
    state.needsRedraw = true;
    callbacks.onRedraw();
  }

  const BIG_STEPS: ReadonlySet<string> = new Set(['hour', 'day', 'month', 'year']);

  function setStepUnit(unit: string): void {
    disableRealtime();
    if (!state.isPaused && BIG_STEPS.has(unit)) {
      state.isPaused = true;
      updatePlayPauseIcon();
    }
    state.timeStepUnit = unit;
    updateStepIndicator();
    state.needsRedraw = true;
    callbacks.onRedraw();
    if (callbacks.onStepChange) callbacks.onStepChange(unit);
  }

  function switchHem(hem: 'N' | 'S'): void {
    if (state.enochHem === hem) return;
    state.enochHem = hem;
    updateHemButtons();
    callbacks.onHemSwitch(hem);
  }

  // ── Step Selector Popup ──────────────────────────────────────────

  function buildStepGrid(): void {
    if (!stepGrid) return;
    stepGrid.innerHTML = '';
    for (const unit of STEP_UNITS) {
      const btn = document.createElement('div');
      btn.className = 'step-option';
      btn.dataset.unit = unit;
      btn.textContent = STEP_LABELS[unit];
      if (unit === state.timeStepUnit) btn.classList.add('active');
      btn.addEventListener('click', () => {
        setStepUnit(unit);
        closeStepSelector();
      });
      stepGrid.appendChild(btn);
    }
  }

  function updateStepSelectorHighlight(): void {
    if (!stepGrid) return;
    stepGrid.querySelectorAll('.step-option').forEach(el => {
      el.classList.toggle('active', (el as HTMLElement).dataset.unit === state.timeStepUnit);
    });
  }

  function openStepSelector(): void {
    if (!stepSelector || !stepIndicator) return;
    closeDateModal();
    buildStepGrid();
    const rect = stepIndicator.getBoundingClientRect();
    stepSelector.style.left = `${rect.left + rect.width / 2 - 96}px`;
    stepSelector.style.bottom = `${window.innerHeight - rect.top + 8}px`;
    stepSelector.style.top = 'auto';
    stepSelector.classList.add('visible');
    stepSelectorOpen = true;
  }

  function closeStepSelector(): void {
    if (!stepSelector) return;
    stepSelector.classList.remove('visible');
    stepSelectorOpen = false;
  }

  // ── Date Modal (centered) ────────────────────────────────────────

  // Initialize timezone selector in modal at startup
  const tzModalCleanup = setupOverlayTimezoneSelect(state, () => {
    syncDateInput(state);
    // Don't call updateTopTimeDisplay here — it would cache a partial snapshot
    // without Sun RA. The draw loop will produce a complete snapshot.
    // Refresh modal date/time fields for new timezone
    if (dateModalOpen) populateDateFields();
  });
  cleanups.push(tzModalCleanup);

  function populateDateFields(): void {
    const jd = state.currentJD !== null ? state.currentJD : state.getAstroJD();
    const ms = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
    const inRange = ms > -JS_DATE_MAX_MS && ms < JS_DATE_MAX_MS;
    let offsetDays = 0;
    if (inRange) {
      const d = new Date(ms);
      const tzOffsetMin = getTzOffsetMinutes(d, state.userTimezone);
      if (Math.abs(tzOffsetMin) < 840) {
        offsetDays = -tzOffsetMin / 1440;
      }
    }
    const localCal = jdToCalendar(jd + offsetDays);
    const { year, month, day, hours, mins } = localCal;

    const dateModalDay = document.getElementById('dateModalDay') as HTMLInputElement | null;
    const dateModalMonth = document.getElementById('dateModalMonth') as HTMLSelectElement | null;
    const dateModalYearDate = document.getElementById('dateModalYearDate') as HTMLInputElement | null;
    const dateModalHour = document.getElementById('dateModalHour') as HTMLInputElement | null;
    const dateModalMin = document.getElementById('dateModalMin') as HTMLInputElement | null;

    if (dateModalDay) dateModalDay.value = String(day).padStart(2, '0');
    if (dateModalMonth) dateModalMonth.value = String(month);
    if (dateModalYearDate) dateModalYearDate.value = formatAstroYear(year);
    if (dateModalHour) dateModalHour.value = String(hours).padStart(2, '0');
    if (dateModalMin) dateModalMin.value = String(mins).padStart(2, '0');
  }

  function openDateModal(): void {
    if (!dateModal) return;
    closeStepSelector();

    populateDateFields();

    const overlayTzInput = document.getElementById('overlay-timezone-select') as HTMLInputElement | null;
    if (overlayTzInput) overlayTzInput.value = state.userTimezone;

    dateModal.classList.add('visible');
    dateModalOpen = true;
  }

  function closeDateModal(): void {
    if (!dateModal) return;
    dateModal.classList.remove('visible');
    dateModalOpen = false;
  }

  function applyDateJump(): void {
    const dateModalDay = document.getElementById('dateModalDay') as HTMLInputElement | null;
    const dateModalMonth = document.getElementById('dateModalMonth') as HTMLSelectElement | null;
    const dateModalYearDate = document.getElementById('dateModalYearDate') as HTMLInputElement | null;
    const dateModalHour = document.getElementById('dateModalHour') as HTMLInputElement | null;
    const dateModalMin = document.getElementById('dateModalMin') as HTMLInputElement | null;

    const yr = parseInt(dateModalYearDate?.value ?? '');
    const mo = parseInt(dateModalMonth?.value ?? '');
    const dy = parseInt(dateModalDay?.value ?? '');
    const hh = parseInt(dateModalHour?.value || '0');
    const mm = parseInt(dateModalMin?.value || '0');
    if (isNaN(yr) || isNaN(mo) || isNaN(dy)) return;

    // Convert BCE year to astronomical: -2026 (2026 BCE) → -2025 (astronomical)
    const astroYear = yr < 0 ? yr + 1 : yr;
    const jd_input = calendarToJD(astroYear, mo, dy, hh, mm);

    // Ancient dates (Julian calendar era): force UTC timezone
    if (jd_input < GREGORIAN_CUTOVER_JD && state.userTimezone !== 'UTC') {
      state.userTimezone = 'UTC';
      const overlayTzInput = document.getElementById('overlay-timezone-select') as HTMLInputElement | null;
      if (overlayTzInput) overlayTzInput.value = 'UTC';
    }

    const ms = (jd_input - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
    const inRange = ms > -JS_DATE_MAX_MS && ms < JS_DATE_MAX_MS;
    let jd_utc = jd_input;
    if (inRange) {
      const d = new Date(ms);
      const tzOffsetMin = getTzOffsetMinutes(d, state.userTimezone);
      // Intl timezone offsets are unreliable for ancient dates — skip if absurd
      if (Math.abs(tzOffsetMin) < 840) {
        const offsetDays = tzOffsetMin / 1440;
        jd_utc = jd_input + offsetDays;
      }
    }
    state.currentJD = jd_utc;
    state.currentTime = new Date((jd_utc - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
    state.isRealtime = false;
    disableRealtime();
    syncDateInput(state);
    state.updateTopTimeDisplay?.();
    state.needsRedraw = true;
    callbacks.onRedraw();
    closeDateModal();
  }

  // ── Event listeners ──────────────────────────────────────────────

  // Hemisphere buttons
  if (hemN) {
    const handler = () => switchHem('N');
    hemN.addEventListener('click', handler);
    cleanups.push(() => hemN.removeEventListener('click', handler));
  }
  if (hemS) {
    const handler = () => switchHem('S');
    hemS.addEventListener('click', handler);
    cleanups.push(() => hemS.removeEventListener('click', handler));
  }

  // Step back
  if (timeStepBack) {
    const handler = () => stepTime(-1);
    timeStepBack.addEventListener('click', handler);
    cleanups.push(() => timeStepBack.removeEventListener('click', handler));
  }

  // Step forward
  if (timeStepForward) {
    const handler = () => stepTime(1);
    timeStepForward.addEventListener('click', handler);
    cleanups.push(() => timeStepForward.removeEventListener('click', handler));
  }

  // Play/pause (single click only)
  if (timePlayPause && playPauseIcon) {
    const handler = () => {
      if (state.isRealtime) disableRealtime();
      state.isPaused = !state.isPaused;
      updatePlayPauseIcon();
      state.needsRedraw = true;
      callbacks.onRedraw();
    };
    timePlayPause.addEventListener('click', handler);
    cleanups.push(() => timePlayPause.removeEventListener('click', handler));
    updatePlayPauseIcon();
  }

  // Step indicator — opens step selector popup
  if (stepIndicator) {
    const handler = (e: Event) => {
      e.stopPropagation();
      if (stepSelectorOpen) closeStepSelector();
      else openStepSelector();
    };
    stepIndicator.addEventListener('click', handler);
    cleanups.push(() => stepIndicator.removeEventListener('click', handler));
  }

  // Time now
  if (timeNowBtn) {
    const handler = () => {
      state.isRealtime = true;
      state.isPaused = false;
      state.timeStepUnit = 'sec';
      state.timeStepVal = 1;
      state.currentTime = new Date();
      state.currentJD = null;
      state.updateTopTimeDisplay?.();
      updateStepIndicator();
      updatePlayPauseIcon();
      state.needsRedraw = true;
      callbacks.onRedraw();
      timeNowBtn.classList.add('active');
    };
    timeNowBtn.addEventListener('click', handler);
    cleanups.push(() => timeNowBtn.removeEventListener('click', handler));
  }

  // Calendar button — opens centered date modal
  if (calendarBtn) {
    const handler = () => {
      if (dateModalOpen) closeDateModal();
      else openDateModal();
    };
    calendarBtn.addEventListener('click', handler);
    cleanups.push(() => calendarBtn.removeEventListener('click', handler));
  }

  // Date modal controls
  const dateModalClose = document.getElementById('dateModalClose');
  const dateModalGoDate = document.getElementById('dateModalGoDate');
  const dateModalNow = document.getElementById('dateModalNow');

  // Close modal on backdrop click
  if (dateModal) {
    const handler = (e: Event) => {
      if (e.target === dateModal) closeDateModal();
    };
    dateModal.addEventListener('click', handler);
    cleanups.push(() => dateModal.removeEventListener('click', handler));
  }

  if (dateModalClose) {
    const handler = () => closeDateModal();
    dateModalClose.addEventListener('click', handler);
    cleanups.push(() => dateModalClose.removeEventListener('click', handler));
  }
  if (dateModalGoDate) {
    const handler = () => applyDateJump();
    dateModalGoDate.addEventListener('click', handler);
    cleanups.push(() => dateModalGoDate.removeEventListener('click', handler));
  }
  if (dateModalNow) {
    const handler = () => {
      state.isRealtime = true;
      state.isPaused = false;
      state.timeStepUnit = 'sec';
      state.timeStepVal = 1;
      state.currentTime = new Date();
      state.currentJD = null;
      state.updateTopTimeDisplay?.();
      syncDateInput(state);
      updateStepIndicator();
      updatePlayPauseIcon();
      state.needsRedraw = true;
      callbacks.onRedraw();
      closeDateModal();
      if (timeNowBtn) timeNowBtn.classList.add('active');
    };
    dateModalNow.addEventListener('click', handler);
    cleanups.push(() => dateModalNow.removeEventListener('click', handler));
  }

  // Close popups on outside click
  const outsideClickHandler = (e: Event) => {
    const target = e.target as HTMLElement;
    if (stepSelectorOpen && stepSelector && !stepSelector.contains(target) && target !== stepIndicator) {
      closeStepSelector();
    }
    if (dateModalOpen && dateModal && !dateModal.contains(target) && target !== calendarBtn) {
      closeDateModal();
    }
  };
  document.addEventListener('click', outsideClickHandler);
  cleanups.push(() => document.removeEventListener('click', outsideClickHandler));

  // Close popups on Escape
  const escapeHandler = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      if (stepSelectorOpen) closeStepSelector();
      if (dateModalOpen) closeDateModal();
    }
  };
  document.addEventListener('keydown', escapeHandler);
  cleanups.push(() => document.removeEventListener('keydown', escapeHandler));

  // Date modal — Enter key to submit
  const dateModalDay = document.getElementById('dateModalDay');
  const dateModalYearDate = document.getElementById('dateModalYearDate');
  const dateModalHour = document.getElementById('dateModalHour');
  const dateModalMin = document.getElementById('dateModalMin');
  for (const el of [dateModalDay, dateModalYearDate, dateModalHour, dateModalMin]) {
    if (el) {
      const handler = (e: KeyboardEvent) => { if (e.key === 'Enter') applyDateJump(); };
      el.addEventListener('keydown', handler);
      cleanups.push(() => el.removeEventListener('keydown', handler));
    }
  }

  // Year stepper buttons
  const dateModalYearUp = document.getElementById('dateModalYearUp');
  const dateModalYearDown = document.getElementById('dateModalYearDown');
  const yearDateInput = document.getElementById('dateModalYearDate') as HTMLInputElement | null;
  if (dateModalYearUp) {
    const handler = () => {
      if (!yearDateInput) return;
      const cur = parseInt(yearDateInput.value || '0');
      yearDateInput.value = String(cur + 1);
    };
    dateModalYearUp.addEventListener('click', handler);
    cleanups.push(() => dateModalYearUp.removeEventListener('click', handler));
  }
  if (dateModalYearDown) {
    const handler = () => {
      if (!yearDateInput) return;
      const cur = parseInt(yearDateInput.value || '0');
      yearDateInput.value = String(cur - 1);
    };
    dateModalYearDown.addEventListener('click', handler);
    cleanups.push(() => dateModalYearDown.removeEventListener('click', handler));
  }

  // ── Initial state ────────────────────────────────────────────────
  updateHemButtons();
  updatePlayPauseIcon();
  updateStepIndicator();

  return function cleanup(): void {
    cleanups.forEach(fn => fn());
  };
}