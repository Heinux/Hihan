import type { CalendarSnapshot } from '@/core/types';
import type { AppState } from '@/core/state';
import { BIBLICAL_EVENTS_THROTTLE_MS } from '@/core/constants';
import { updateEventPanel, updateEventCountdowns, updateSeasonBar } from '@/features/seasons';
import { renderBiblicalEventsPanel } from '@/features/biblical-events';
import { drawEnochWheel } from '@/features/enoch';
import { syncDateInput } from '@/ui/ui-panel';

interface EventUpdateDeps {
  state: AppState;
  eventListEl: HTMLElement;
  seasonBarEl: HTMLElement;
  biblicalEventsEl: HTMLElement;
  enochCtx: CanvasRenderingContext2D;
  JULIAN_UNIX_EPOCH: number;
  MS_PER_DAY: number;
}

export function createEventUpdate(deps: EventUpdateDeps) {
  let enochWasVisible = false;
  let lastBiblicalUpdate = 0;

  function update(snap: CalendarSnapshot, currentJD: number, now: number): void {
    const { state, eventListEl, seasonBarEl, biblicalEventsEl, enochCtx, JULIAN_UNIX_EPOCH, MS_PER_DAY } = deps;

    if (state.currentJD === null) {
      updateSeasonBar(state, seasonBarEl);
    }

    const attachListeners = updateEventPanel(state, eventListEl, currentJD);
    if (attachListeners) {
      attachListeners((eventJD: number) => {
        state.isRealtime = false;
        state.isPaused = true;
        state.currentJD = eventJD;
        state.currentTime = new Date((state.currentJD - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
        syncDateInput(state);
        state.needsRedraw = true;
      });
    }

    updateEventCountdowns(state, eventListEl, currentJD);

    const forceBiblical = snap.isMidnightTransition;

    if (state.isVisible('enoch')) {
      enochWasVisible = true;
      drawEnochWheel(state, enochCtx, true, snap);
      if (forceBiblical || now - lastBiblicalUpdate > BIBLICAL_EVENTS_THROTTLE_MS) {
        lastBiblicalUpdate = now;
        renderBiblicalEventsPanel({
          container: biblicalEventsEl,
          enochMonthIdx: snap.enoch.currentMonthIdx,
          enochDayInMonth: snap.enoch.dayInMonth,
          enochCurDay: snap.enoch.curDay,
          gregYear: snap.gregorian.year,
          gregMonth: snap.gregorian.month,
          gregDay: snap.gregorian.day,
          hebrewMonth: snap.hebrew.month,
          hebrewDay: snap.hebrew.day,
          enochHem: state.enochHem,
        });
      }
    } else {
      if (enochWasVisible) {
        enochCtx.clearRect(0, 0, state.W, state.H);
        enochWasVisible = false;
      }
      if (now - lastBiblicalUpdate > BIBLICAL_EVENTS_THROTTLE_MS) {
        lastBiblicalUpdate = now;
        renderBiblicalEventsPanel({
          container: biblicalEventsEl,
          enochMonthIdx: -1,
          enochDayInMonth: -1,
          enochCurDay: -1,
          gregYear: snap.gregorian.year,
          gregMonth: snap.gregorian.month,
          gregDay: snap.gregorian.day,
          hebrewMonth: -1,
          hebrewDay: -1,
          enochHem: state.enochHem,
        });
      }
    }
  }

  return { update };
}