import { ZOOM, WHEEL_SENSITIVITY, WHEEL_ZOOM_FACTOR, HOVER_MIN_RADIUS, HOVER_EXTRA_RADIUS, PAN_CLAMP_FACTOR } from '@/core/constants';
import type { BodyPosition } from '@/core/state';
import { checkWindHover, getHoveredWind, setMapRotationFromMouse, isWindRoseFixed, isRoseDocked, isRoseHit, isNearHome, dockRose, anchorRose, undockRose } from '@/rendering/wind-layer';
import type { WindRoseViewport } from '@/rendering/wind-layer';
import { positionTooltip as calcTooltipPos, applyTooltipPosition } from '@/ui/tooltip';

// ── Types ───────────────────────────────────────────────────────────
interface InteractionDeps {
  enochCanvas?: HTMLCanvasElement;
  applyProjection?: () => void;
  formatRA?: (ra: number) => string;
  formatDec?: (dec: number) => string;
  getMoonPhaseName?: (deg: number) => string;
  checkDSOHover?: (mx: number, my: number) => void;
  checkCityHover?: (mx: number, my: number) => void;
}

interface InteractionState {
  W: number;
  H: number;
  panX: number;
  panY: number;
  zoomK: number;
  viewScale: number;
  hoveredBody: BodyPosition | null;
  needsRedraw: boolean;
  animationId: number | null;
  enochHem?: 'N' | 'S';
}

interface TrackedListener {
  el: EventTarget;
  evt: string;
  fn: EventListener;
  opts?: AddEventListenerOptions;
}

// ── Main interaction setup ───────────────────────────────────────────
// Returns a cleanup function that removes all listeners.
export function setupInteraction(
  canvas: HTMLCanvasElement,
  state: InteractionState,
  projection: d3.GeoProjection,
  tooltipEl: HTMLElement,
  getBodyPositions: () => BodyPosition[],
  _onRedraw: () => void,
  deps?: InteractionDeps,
): () => void {
  const listeners: TrackedListener[] = [];

  // Cached DOM references (lazy-init)
  let _zoomIndEl: HTMLElement | null | undefined;
  let _ttNameEl: HTMLElement | null | undefined;
  let _ttRaEl: HTMLElement | null | undefined;
  let _ttDecEl: HTMLElement | null | undefined;
  let _ttAzEl: HTMLElement | null | undefined;

  function track(el: EventTarget, evt: string, fn: EventListener, opts?: AddEventListenerOptions): void {
    el.addEventListener(evt, fn, opts);
    listeners.push({ el, evt, fn, opts });
  }

  // ── Resize ──
  function resize(): void {
    state.W = window.innerWidth;
    state.H = window.innerHeight;
    state.viewScale = Math.min(1, state.W / 550);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = state.W * dpr;
    canvas.height = state.H * dpr;
    canvas.style.width = state.W + 'px';
    canvas.style.height = state.H + 'px';
    // Resize secondary canvases if present
    if (deps && deps.enochCanvas) {
      deps.enochCanvas.width = state.W * dpr;
      deps.enochCanvas.height = state.H * dpr;
      deps.enochCanvas.style.width = state.W + 'px';
      deps.enochCanvas.style.height = state.H + 'px';
    }
    if (deps && deps.applyProjection) deps.applyProjection();
    state.needsRedraw = true;
  }

  // ── Pan clamping ──
  function clampPan(): void {
    const vs = state.viewScale ?? 1;
    const r = (Math.min(state.W, state.H) / 2 / Math.PI) * Math.PI * state.zoomK;
    // Scale by 1/vs so the virtual panning range matches desktop
    const maxPan = r * PAN_CLAMP_FACTOR / vs;
    state.panX = Math.max(-maxPan, Math.min(maxPan, state.panX));
    state.panY = Math.max(-maxPan, Math.min(maxPan, state.panY));
  }

  // ── Wheel zoom ──
  const handleWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const delta = -e.deltaY * WHEEL_SENSITIVITY;
    const prev = state.zoomK;
    state.zoomK = Math.max(ZOOM.MIN, Math.min(ZOOM.MAX, state.zoomK * (1 + delta * WHEEL_ZOOM_FACTOR)));
    const mx = e.clientX - state.W / 2, my = e.clientY - state.H / 2;
    state.panX += (mx - state.panX) * (1 - state.zoomK / prev);
    state.panY += (my - state.panY) * (1 - state.zoomK / prev);
    clampPan();
    if (_zoomIndEl === undefined) _zoomIndEl = document.getElementById('zoomIndicator');
    if (_zoomIndEl) _zoomIndEl.textContent = `\u00D7${state.zoomK.toFixed(1)}`;
    state.needsRedraw = true;
  };
  track(canvas, 'wheel', handleWheel as EventListener, { passive: false });

  // ── Mouse drag ──
  let isDragging = false;
  let lastMouse: [number, number] | null = null;
  let mouseDownPos: [number, number] | null = null;

  const handleMouseDown = (e: MouseEvent): void => {
    mouseDownPos = [e.clientX, e.clientY];
    isDragging = true;
    lastMouse = [e.clientX, e.clientY];
    canvas.classList.add('grabbing');
  };
  track(canvas, 'mousedown', handleMouseDown as EventListener);

// Track viewport state to skip redundant applyProjection calls
let _lastAppliedZoom = 0;
let _lastAppliedPanX = 0;
let _lastAppliedPanY = 0;

const handleMouseMove = (e: MouseEvent): void => {
  if (isDragging && lastMouse) {
    state.panX += e.clientX - lastMouse[0];
    state.panY += e.clientY - lastMouse[1];
    clampPan();
    lastMouse = [e.clientX, e.clientY];
    state.needsRedraw = true;
  }

  // Only update projection if viewport state actually changed
  if (deps && deps.applyProjection) {
    if (state.zoomK !== _lastAppliedZoom || state.panX !== _lastAppliedPanX || state.panY !== _lastAppliedPanY) {
      _lastAppliedZoom = state.zoomK;
      _lastAppliedPanX = state.panX;
      _lastAppliedPanY = state.panY;
      deps.applyProjection();
    }
  }

  // Update rotation when rose is following cursor (not docked, not anchored)
  if (!isWindRoseFixed() && !isRoseDocked()) {
    setMapRotationFromMouse(
      e.clientX,
      e.clientY,
      projection,
      state.enochHem,
      state as WindRoseViewport,
    );
  }

  checkHover(e.clientX, e.clientY);
  if (deps && deps.checkDSOHover) deps.checkDSOHover(e.clientX, e.clientY);
  if (deps && deps.checkCityHover) deps.checkCityHover(e.clientX, e.clientY);
  const windsCb = document.getElementById('show-winds') as HTMLInputElement | null;
  const windChanged = checkWindHover(e.clientX, e.clientY, windsCb ? windsCb.checked : false);
  if (windChanged) {
    const wind = getHoveredWind();
    if (wind) {
      if (_ttNameEl === undefined) _ttNameEl = document.getElementById('tt-name');
      if (_ttRaEl   === undefined) _ttRaEl   = document.getElementById('tt-ra');
      if (_ttDecEl  === undefined) _ttDecEl  = document.getElementById('tt-dec');
      if (_ttAzEl   === undefined) _ttAzEl   = document.getElementById('tt-az');
      if (_ttNameEl) _ttNameEl.textContent = wind.name;
      if (_ttRaEl)   _ttRaEl.textContent   = wind.abbr;
      if (_ttDecEl)  _ttDecEl.textContent  = wind.label;
      if (_ttAzEl)   _ttAzEl.textContent   = `${wind.azimuth}°`;
      tooltipEl.classList.add('visible');
      requestAnimationFrame(() => positionTooltip(e.clientX, e.clientY));
    } else if (!state.hoveredBody) {
      tooltipEl.classList.remove('visible');
    }
    state.needsRedraw = true;
  }
};
  track(window, 'mousemove', handleMouseMove as EventListener);

const handleMouseUp = (e: MouseEvent): void => {
  // Click detection (mousedown/up within 5px)
  if (mouseDownPos) {
    const dist = Math.hypot(e.clientX - mouseDownPos[0], e.clientY - mouseDownPos[1]);
    if (dist < 5) {
      // Click on rose while docked → undock + follow cursor
      if (isRoseDocked() && isRoseHit(e.clientX, e.clientY)) {
        undockRose();
        if (deps && deps.applyProjection) deps.applyProjection();
        setMapRotationFromMouse(
          e.clientX, e.clientY,
          projection, state.enochHem,
          state as WindRoseViewport,
        );
        state.needsRedraw = true;
      }
      // Click on rose while anchored → unanchor + follow cursor
      else if (isWindRoseFixed() && isRoseHit(e.clientX, e.clientY)) {
        undockRose(); // sets _isFixed=false, _isDocked=false
        if (deps && deps.applyProjection) deps.applyProjection();
        setMapRotationFromMouse(
          e.clientX, e.clientY,
          projection, state.enochHem,
          state as WindRoseViewport,
        );
        state.needsRedraw = true;
      }
      // Click while following cursor → dock if near home, else anchor
      else if (!isRoseDocked() && !isWindRoseFixed()) {
        if (isNearHome(e.clientX, e.clientY, state.W, state.H)) {
          dockRose();
        } else {
          anchorRose(e.clientX, e.clientY);
        }
        state.needsRedraw = true;
      }
    }
  }

  mouseDownPos = null;
  isDragging = false;
  lastMouse = null;
  canvas.classList.remove('grabbing');
};


  track(window, 'mouseup', handleMouseUp as EventListener);

  // ── Touch support ──
  let lastTouchDist: number | null = null;
  let roseTouchId: number | null = null;
  let roseTouchStart: [number, number] | null = null;
  let roseTouchMoved = false;

  const handleTouchStart = (e: TouchEvent): void => {
    // Rose touch detection: single touch on the rose claims it
    const windsCb = document.getElementById('show-winds') as HTMLInputElement | null;
    const roseVisible = windsCb ? windsCb.checked : false;
    if (e.touches.length === 1 && roseVisible) {
      const tx = e.touches[0].clientX;
      const ty = e.touches[0].clientY;
      if (isRoseHit(tx, ty)) {
        roseTouchId = e.touches[0].identifier;
        roseTouchStart = [tx, ty];
        roseTouchMoved = false;
        if (isRoseDocked() || isWindRoseFixed()) {
          undockRose();
          if (deps && deps.applyProjection) deps.applyProjection();
          setMapRotationFromMouse(tx, ty, projection, state.enochHem, state as WindRoseViewport);
          state.needsRedraw = true;
        }
        return; // Don't start map drag
      }
    }

    if (e.touches.length === 1) {
      isDragging = true;
      lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
    } else if (e.touches.length === 2) {
      lastTouchDist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
    }
  };
  track(canvas, 'touchstart', handleTouchStart as EventListener, { passive: true });

  const handleTouchMove = (e: TouchEvent): void => {
    // Rose drag: if a touch is claimed by the rose
    if (roseTouchId !== null) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === roseTouchId) {
          const tx = touch.clientX;
          const ty = touch.clientY;
          roseTouchMoved = true;
          setMapRotationFromMouse(tx, ty, projection, state.enochHem, state as WindRoseViewport);
          state.needsRedraw = true;
          break;
        }
      }
      e.preventDefault();
      return; // Don't process map pan while rose is being dragged
    }

    if (e.touches.length === 1 && isDragging && lastMouse) {
      state.panX += e.touches[0].clientX - lastMouse[0];
      state.panY += e.touches[0].clientY - lastMouse[1];
      clampPan();
      lastMouse = [e.touches[0].clientX, e.touches[0].clientY];
      state.needsRedraw = true;
    } else if (e.touches.length === 2 && lastTouchDist) {
      const d = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      );
      state.zoomK = Math.max(ZOOM.MIN, Math.min(ZOOM.MAX, state.zoomK * d / lastTouchDist));
      lastTouchDist = d;
      if (_zoomIndEl === undefined) _zoomIndEl = document.getElementById('zoomIndicator');
      if (_zoomIndEl) _zoomIndEl.textContent = `\u00D7${state.zoomK.toFixed(1)}`;
      state.needsRedraw = true;
    }
    e.preventDefault();
  };
  track(canvas, 'touchmove', handleTouchMove as EventListener, { passive: false });

  const handleTouchEnd = (e: TouchEvent): void => {
    if (roseTouchId !== null) {
      for (let i = 0; i < e.changedTouches.length; i++) {
        const touch = e.changedTouches[i];
        if (touch.identifier === roseTouchId) {
          const tx = touch.clientX;
          const ty = touch.clientY;

          if (!roseTouchMoved && roseTouchStart) {
            // Tap (no drag) — toggle dock/anchor
            if (isWindRoseFixed()) {
              // Tap on anchored rose: dock it
              dockRose();
            } else if (!isRoseDocked()) {
              // Tap on following rose: anchor it
              if (isNearHome(tx, ty, state.W, state.H)) {
                dockRose();
              } else {
                anchorRose(tx, ty);
              }
            }
          } else {
            // Drag ended — anchor or dock
            if (isNearHome(tx, ty, state.W, state.H)) {
              dockRose();
            } else {
              anchorRose(tx, ty);
            }
          }

          roseTouchId = null;
          roseTouchStart = null;
          roseTouchMoved = false;
          state.needsRedraw = true;
          return;
        }
      }
      return;
    }

    isDragging = false;
    lastMouse = null;
    lastTouchDist = null;
  };
  track(canvas, 'touchend', handleTouchEnd as EventListener);

  // ── Hover / tooltip ──
  function positionTooltip(mx: number, my: number): void {
    const tipW = tooltipEl.offsetWidth || 160;
    const tipH = tooltipEl.offsetHeight || 80;
    const pos = calcTooltipPos({ tipW, tipH, viewportW: state.W, viewportH: state.H, mouseX: mx, mouseY: my });
    applyTooltipPosition(tooltipEl, pos);
  }

  function checkHover(mx: number, my: number): void {
    const bodyPositions = getBodyPositions();
    const vs = state.viewScale ?? 1;
    const mxv = mx / vs, myv = my / vs;
    let found: BodyPosition | null = null;
    for (const bp of bodyPositions) {
      const dx = mxv - bp.px, dy = myv - bp.py;
      if (Math.sqrt(dx * dx + dy * dy) < Math.max(bp.body.radius + HOVER_EXTRA_RADIUS, HOVER_MIN_RADIUS)) {
        found = bp;
        break;
      }
    }
    if (found !== state.hoveredBody) {
      state.hoveredBody = found;
      state.needsRedraw = true;
      if (found) {
        if (_ttNameEl === undefined) _ttNameEl = document.getElementById('tt-name');
        if (_ttRaEl === undefined) _ttRaEl = document.getElementById('tt-ra');
        if (_ttDecEl === undefined) _ttDecEl = document.getElementById('tt-dec');
        if (_ttAzEl === undefined) _ttAzEl = document.getElementById('tt-az');
        if (_ttNameEl) _ttNameEl.textContent = found.body.name;
        if (_ttRaEl && deps && deps.formatRA) _ttRaEl.textContent = deps.formatRA(found.ra);
        if (_ttDecEl && deps && deps.formatDec) _ttDecEl.textContent = deps.formatDec(found.dec);
        if (_ttAzEl) {
          if (found.body.id === 'Moon' && found.moonPhase !== undefined) {
            const phaseName = deps && deps.getMoonPhaseName ? deps.getMoonPhaseName(found.moonPhase) : '';
            _ttAzEl.textContent = `${phaseName} \u00B7 ${Math.round((found.moonFraction ?? 0) * 100)}%`;
          } else {
            _ttAzEl.textContent = '\u2014';
          }
        }
        tooltipEl.classList.add('visible');
        requestAnimationFrame(() => positionTooltip(mx, my));
      } else {
        tooltipEl.classList.remove('visible');
      }
    }
    if (found) {
      positionTooltip(mx, my);
    }
  }

  // ── Window resize ──
  track(window, 'resize', resize as EventListener);

  // ── Cleanup ──
  return function cleanup(): void {
    listeners.forEach(({ el, evt, fn, opts }) => el.removeEventListener(evt, fn, opts));
    listeners.length = 0;
    if (state.animationId) {
      cancelAnimationFrame(state.animationId);
      state.animationId = null;
    }
  };
}
