import './styles.css';

import { CELESTIAL_BODIES, J2000_EPOCH, JULIAN_UNIX_EPOCH, MS_PER_DAY, MOBILE_VIEWPORT_THRESHOLD, UI_TRANSITION_MS, WIND_PARTICLE_COUNT, WIND_DATA_URL } from '@/core/constants';
import { detectHemisphere } from '@/core/geo';
import { AppState } from '@/core/state';
import { jdToDateString, jdToLocalDateString, jdToJulianDisplayString, getComputedData, getAstroTimeIfValid, getTzOffsetMinutes } from '@/core/time';
import { TimeService } from '@/core/time-service';
import type { CalendarSnapshot } from '@/core/types';
import { getObliquity, gmstFromJD, normLon } from '@/core/astronomy';
import { formatRA, formatDec, getMoonPhaseName } from '@/core/formatters';
import { getProjection } from '@/rendering/projections';
import { createTypedGeoPath } from '@/rendering/geo-path';
import { CanvasRenderer } from '@/rendering/renderer';
import { computeBodyPositions } from '@/rendering/body-renderer';
import { checkCityHover } from '@/rendering/constellation-renderer';
import { createDefaultPipeline } from '@/rendering/render-pipeline';
import type { FrameContext, RenderDeps } from '@/rendering/render-pipeline';
import { WindParticleSystem } from '@/rendering/wind-particles';
import { setupInteraction } from '@/ui/interaction';
import { setupPanel, syncDateInput, updateDateDisplay } from '@/ui/ui-panel';
import { setupOverlayControls } from '@/ui/overlay-controls';
import { updateEventPanel } from '@/features/seasons';
import { DSOManager } from '@/features/dso';
import { NEOManager } from '@/features/neo';
import { AlertSystem } from '@/features/alerts';
import { setupEnochUI } from '@/features/enoch';
import { initWorldData } from '@/data/world-topo';
import { observer } from '@/data/observer';
import { SITE_MAP } from '@/data/cities';
import { DSO_GROUPS } from '@/data/dso-catalog';
import { maybeFetchWind, getWindSource, isWindUnavailable, initWindData, isWindFetching } from '@/main/wind-manager';
import { setupPanelToggles } from '@/main/panel-toggles';
import { applyUrlParams, setupShareButton } from '@/main/share-url';
import { getCachedTideState, updateTideCache, clearTideCache, drawTideCurveIfReady } from '@/main/tide-ui';
import { setupLogModal } from '@/ui/log-modal';
import { setupWindTideControls } from '@/ui/wind-tide-controls';
import { createTopTimeDisplay } from '@/ui/top-time-display';
import { createFPSCounter } from '@/ui/fps-counter';
import { createTimeLoop } from '@/main/time-loop';
import { createMoonCache } from '@/main/moon-cache';
import { createEventUpdate } from '@/main/event-update';
import { lazyEl } from '@/ui/dom-cache';

declare const WORLD_DATA: import('topojson-specification').Topology | undefined;

// ── Initialize ──────────────────────────────────────────────────────

const state = new AppState();
state.enochHem = detectHemisphere();
state.updateTopTimeDisplay = updateTopTimeDisplay;
const timeService = new TimeService();
const canvas = document.getElementById('map') as HTMLCanvasElement;
const enochCanvas = document.getElementById('enochCanvas') as HTMLCanvasElement;
const enochCtx = enochCanvas.getContext('2d')!;
const tooltipEl = document.getElementById('tooltip') as HTMLElement;
const eventListEl = document.getElementById('eventList') as HTMLElement;
const seasonBarEl = document.getElementById('seasonBar') as HTMLElement;
const biblicalEventsEl = document.getElementById('biblicalEventsPanel') as HTMLElement;

updateDateDisplay.setDeps({ jdToDateString, jdToLocalDateString, jdToJulianDisplayString });

const projection = getProjection('azimuthalEquidistant');
const pathGen = createTypedGeoPath(projection, canvas.getContext('2d'));

function applyProjection(): void {
  const vs = state.viewScale;
  const Wv = state.W / vs, Hv = state.H / vs;
  const minDim = Math.min(Wv, Hv);
  const polarRot = state.enochHem === 'S' ? 90 : -90;
  projection.scale((minDim / 2) / Math.PI).translate([Wv / 2, Hv / 2]).rotate([0, polarRot]);
}

const renderer = new CanvasRenderer(canvas, projection, pathGen);

const topTimeDisplay = createTopTimeDisplay({
  getState: () => state,
  timeService,
});

function updateTopTimeDisplay(snap?: CalendarSnapshot): void {
  topTimeDisplay.update(snap);
}

const dsoManager = new DSOManager(state, DSO_GROUPS, projection, normLon);

const neoManager = new NEOManager(state, projection, normLon);

const alertSystem = new AlertSystem(state, SITE_MAP, {
  getAstroJD: () => state.getAstroJD(),
  isVisible: (id: string) => state.isVisible(id),
  jdToDateString,
  dsoGroups: DSO_GROUPS,
  dsoGroupState: dsoManager.groupState,
});

const pipeline = createDefaultPipeline();

// ── Wind particle system ──────────────────────────────────────────────
const windSystem = new WindParticleSystem(WIND_PARTICLE_COUNT);
initWindData(WIND_DATA_URL, state, windSystem);

const renderDeps: RenderDeps = {
  renderer,
  projection,
  pathGen,
  dsoManager,
  alertSystem,
  neoManager,
  windSystem,
  alertSiteEl: document.getElementById('alertSite') as HTMLSelectElement | null,
  alertPrecEl: document.getElementById('alertPrecision') as HTMLInputElement | null,
  frame: null! as FrameContext,
};

let cityHitTargets: Array<{ city: { name: string; lon: number; lat: number; type: 'city' | 'landmark'; symbol?: string }; px: number; py: number }> = [];

const interactionCleanup = setupInteraction(canvas, state, projection, tooltipEl,
  () => state.bodyPositions,
  () => { state.needsRedraw = true; },
  {
    enochCanvas,
    applyProjection,
    formatRA,
    formatDec,
    getMoonPhaseName,
    checkDSOHover: (mx: number, my: number) => dsoManager.checkHover(mx, my),
    checkCityHover: (mx: number, my: number) => {
      const cityTooltipEl = lazyEl('cityTooltip');
      if (cityTooltipEl) checkCityHover(mx, my, state, projection, cityHitTargets, cityTooltipEl, state.isVisible('cities'));
    },
  }
);

const panelCleanup = setupPanel(state, CELESTIAL_BODIES);

// Wire NEO checkbox to neoManager
const neoCheckbox = document.getElementById('show-neo') as HTMLInputElement | null;
if (neoCheckbox) {
  neoCheckbox.checked = false; // Start unchecked — requires API call
  neoCheckbox.addEventListener('change', () => {
    neoManager.enabled = neoCheckbox.checked;
    state.cacheCheckboxes();
    state.needsRedraw = true;
  });
}

const enochCleanup = setupEnochUI(state, {
  applyProjection,
  forceEventPanelRefresh: () => updateEventPanel(state, eventListEl, state.getAstroJD()),
});

// ── Overlay Controls (decoupled from render loop) ──────────────────

const overlayCleanup = setupOverlayControls(state, {
  onRedraw: () => { state.needsRedraw = true; },
  onHemSwitch: (_hem) => {
    timeService.invalidate();
    applyProjection();
    updateEventPanel(state, eventListEl, state.getAstroJD());
    state.needsRedraw = true;
  },
  onStepChange: (_unit) => {
    neoManager.checkTimeStep();
  },
});

// Invalidate TimeService cache on timezone change
state.on('timezone:changed', () => { timeService.invalidate(); });

// ── DSO panel ──────────────────────────────────────────────────────

dsoManager.buildPanel(document.getElementById('panel') as HTMLElement);

// ── Alert site selector ────────────────────────────────────────────

const alertSiteEl = renderDeps.alertSiteEl;
if (alertSiteEl) {
  alertSiteEl.innerHTML = '';
  Object.entries(SITE_MAP).forEach(([key, site]) => {
    const opt = document.createElement('option');
    opt.value = key;
    opt.textContent = site.name || key;
    alertSiteEl.appendChild(opt);
  });
}

// ── Log modal ──────────────────────────────────────────────────────

setupLogModal(alertSystem, state);

const { updateToggleArrows, addCloseButtons } = setupPanelToggles(state);

// ── Initial resize ─────────────────────────────────────────────────

state.W = canvas.clientWidth || window.innerWidth;
state.H = canvas.clientHeight || window.innerHeight;
state.viewScale = Math.min(1, state.W / MOBILE_VIEWPORT_THRESHOLD);
const dpr = window.devicePixelRatio || 1;
canvas.width = state.W * dpr;
canvas.height = state.H * dpr;
enochCanvas.width = state.W * dpr;
enochCanvas.height = state.H * dpr;
applyProjection();

if (typeof WORLD_DATA !== 'undefined') {
  state.worldData = initWorldData(WORLD_DATA);
}

syncDateInput(state);

// ── URL GET parameters ──────────────────────────────────────────────

applyUrlParams({ state, timeService, applyProjection, eventListEl });
setupShareButton(state);

// ── Wind toggle + Tide modal ──────────────────────────────────────────

const { updateButtons: updateWindTideButtons } = setupWindTideControls(state);

// ── Main Draw Loop ─────────────────────────────────────────────────

// ── FPS counter ───────────────────────────────────────────────────────
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;top:calc(6px + env(safe-area-inset-top, 0));right:calc(6px + env(safe-area-inset-right, 0));font:500 11px/1 "DM Mono",monospace;color:rgba(140,180,220,0.6);pointer-events:none;z-index:9999;user-select:none;contain:layout paint;display:flex;gap:10px;align-items:center';
document.body.appendChild(fpsEl);
const fpsTextEl = document.createElement('span');
fpsEl.appendChild(fpsTextEl);
// Move windInfo into the FPS row
const windInfoEl = lazyEl('windInfo');
if (windInfoEl) {
  windInfoEl.style.position = '';
  windInfoEl.style.top = '';
  windInfoEl.style.right = '';
  windInfoEl.style.zIndex = '';
  windInfoEl.style.marginLeft = '';
  windInfoEl.style.font = 'inherit';
  windInfoEl.style.color = 'rgba(140,180,220,0.45)';
  fpsEl.appendChild(windInfoEl);
}
const fpsCounter = createFPSCounter(fpsTextEl);
const timeLoop = createTimeLoop();
const moonCache = createMoonCache();
const eventUpdate = createEventUpdate({ state, eventListEl, seasonBarEl, biblicalEventsEl, enochCtx, JULIAN_UNIX_EPOCH, MS_PER_DAY });
let _cachedTideKey = -1;


function draw(): void {
  if (!state.worldData) { state.animationId = requestAnimationFrame(draw); return; }

  const now = performance.now();

  fpsCounter.update(now);

  const dt = timeLoop.dt(now);
  if (timeLoop.advance(now, state)) state.needsRedraw = true;

  // Wind particles need continuous animation at 60fps
  if (state.isVisible('windParticles') && state.windGrid) {
    state.needsRedraw = true;
  }

  if (!state.needsRedraw) { state.animationId = requestAnimationFrame(draw); return; }
  state.needsRedraw = false;

  const jd = state.getAstroJD();

  // ── Unique snapshot pour toute la frame ──
  const { jd: computedJD, T } = getComputedData(state);
  const epsRad = getObliquity(T);
  const gmst = gmstFromJD(computedJD);

  let moonPhaseDeg = 0, moonFraction = 0;
  const astroTimeObj = getAstroTimeIfValid(state);
  if (astroTimeObj) {
    const moonResult = moonCache.getMoonPhase(jd, astroTimeObj);
    moonPhaseDeg = moonResult.moonPhaseDeg;
    moonFraction = moonResult.moonFraction;
  }
  state.moonPhaseDeg = moonPhaseDeg;

  state.cacheCheckboxes();

  // Wind/tide button state
  updateWindTideButtons();

  const { bodyPositions, sunLon, sunLat } = computeBodyPositions({
    state, astroTimeObj: astroTimeObj!, celestialBodies: CELESTIAL_BODIES, gmst, observer, projection, moonPhaseDeg, moonFraction,
    isVisible: (id: string) => state.isVisible(id),
  });
  state.bodyPositions = bodyPositions;

  if (sunLon !== null) {
    const D = computedJD - J2000_EPOCH;
    const g = (357.529 + 0.98560028 * D) * Math.PI / 180;
    const q = 280.459 + 0.98564736 * D;
    const L = (q + 1.915 * Math.sin(g) + 0.020 * Math.sin(2 * g)) % 360;
    state.currentSunEclLon = L < 0 ? L + 360 : L;
  }

  // ── Snapshot (needs Sun/Moon RA for solar/lunar time) ──
  const sunBodyPos = bodyPositions.find(bp => bp.body.id === 'Sun');
  const sunRA = sunBodyPos?.ra;
  const moonBodyPos = bodyPositions.find(bp => bp.body.id === 'Moon');
  const moonRA = moonBodyPos?.ra;
  const snap = timeService.getSnapshot(
    jd, state.userTimezone, state.enochHem, state.currentSunEclLon || 0,
    sunRA, state.observerLongitude, state.observerLongitudeApprox, state.observerLatitude, moonRA
  );
  updateTopTimeDisplay(snap);

  const frame: FrameContext = {
    jd: computedJD, T, dt, epsRad, gmst,
    moonPhaseDeg, moonFraction,
    sunLon, sunLat,
    moonLon: moonBodyPos ? state.smoothPositions['Moon']?.lon : undefined,
    moonLat: moonBodyPos ? state.smoothPositions['Moon']?.lat : undefined,
    moonDistAU: moonBodyPos?.dist,
    sunDistAU: sunBodyPos?.dist,
    placedLabels: [],
    cityHitTargets: [],
    astroTimeObj,
  };
  renderDeps.frame = frame;

  // Fetch real GFS wind data when simulated time changes by >3h
  if (state.isVisible('windParticles')) {
    maybeFetchWind(computedJD, state, windSystem);
  }

  const ctx = renderer.ctx;
  const dpr = window.devicePixelRatio || 1;
  const vs = state.viewScale;
  ctx.setTransform(dpr * vs, 0, 0, dpr * vs, 0, 0);
  ctx.clearRect(0, 0, state.W / vs, state.H / vs);
  renderer.applyViewportTransform(state);

  // NEO — trigger fetch if needed (before pipeline so data is available for rendering)
  neoManager.maybeFetch();

  pipeline.execute(ctx, state, renderDeps);
  cityHitTargets = frame.cityHitTargets;

  // Wind info label (DOM side-effect, not canvas rendering)
  const windInfoEl = lazyEl('windInfo');
  if (state.isVisible('windParticles')) {
    if (windInfoEl) {
      const src = getWindSource();
      const label = isWindFetching() ? 'Chargement GFS…' : isWindUnavailable() ? 'GFS indisponible' : src.startsWith('placeholder') ? 'Climatologie' : src;
      windInfoEl.textContent = label;
      windInfoEl.style.display = '';
    }
  } else if (windInfoEl) {
    windInfoEl.style.display = 'none';
  }

  const currentJD = state.getAstroJD();
  eventUpdate.update(snap, currentJD, now);

  // ── Tide state + curve (modal) ──
  if (astroTimeObj) {
    const tideCacheKey = Math.floor(jd * 48); // 30-min cache
    if (tideCacheKey !== _cachedTideKey || !getCachedTideState()) {
      _cachedTideKey = tideCacheKey;
      const moonDistAU = moonBodyPos?.dist ?? 0.00257;
      const sunDistAU = sunBodyPos?.dist ?? 1.0;
      const mLon = state.smoothPositions['Moon']?.lon ?? 0;
      const mLat = state.smoothPositions['Moon']?.lat ?? 0;
      const sLon = sunLon ?? 0;
      const sLat = sunLat ?? 0;
      const tzOffset = getTzOffsetMinutes(state.currentTime, state.userTimezone);
      updateTideCache({
        moonDistAU, sunDistAU,
        moonLon: mLon, moonLat: mLat,
        sunLon: sLon, sunLat: sLat,
        observerLon: state.observerLongitude,
        observerLat: state.observerLatitude,
        moonPhaseDeg,
        astroTimeObj,
        userTz: state.userTimezone,
        tzOffsetMinutes: tzOffset,
      });
    }
    // Draw curve in modal if open
    drawTideCurveIfReady();
  } else {
    clearTideCache();
  }

  state.animationId = requestAnimationFrame(draw);
}

// ── Cleanup ────────────────────────────────────────────────────────

window.addEventListener('beforeunload', () => {
  interactionCleanup();
  panelCleanup();
  overlayCleanup();
  if (enochCleanup) enochCleanup();
  state.cleanup();
});

// ── Loading dismiss ────────────────────────────────────────────────

const loadingEl = document.getElementById('loading');
if (loadingEl) {
  loadingEl.classList.add('fade');
  setTimeout(() => loadingEl.remove(), UI_TRANSITION_MS);
}

window.addEventListener('load', () => {
  setTimeout(() => {
    addCloseButtons();
    updateToggleArrows();
  }, UI_TRANSITION_MS);
});

draw();