import { geoPath } from 'd3-geo';
import * as Astronomy from 'astronomy-engine';
import './styles.css';

import { CELESTIAL_BODIES, J2000_EPOCH, JULIAN_UNIX_EPOCH, MS_PER_DAY, MINUTES_PER_DAY, MOBILE_VIEWPORT_THRESHOLD, BIBLICAL_EVENTS_THROTTLE_MS, UI_TRANSITION_MS, DT_FALLBACK, WIND_PARTICLE_COUNT, WIND_DATA_URL } from '@/core/constants';
import { detectHemisphere } from '@/core/geo';
import { AppState } from '@/core/state';
import { dateToJD, jdToDateString, jdToLocalDateString, jdToJulianDisplayString, advanceTime, getComputedData, getAstroTimeIfValid, getTzOffsetMinutes } from '@/core/time';
import { TimeService } from '@/core/time-service';
import type { CalendarSnapshot } from '@/core/types';
import { getObliquity, gmstFromJD, normLon } from '@/core/astronomy';
import { formatRA, formatDec, getMoonPhaseName } from '@/core/formatters';
import { getProjection } from '@/rendering/projections';
import { CanvasRenderer } from '@/rendering/renderer';
import { computeBodyPositions } from '@/rendering/body-renderer';
import { checkCityHover } from '@/rendering/constellation-renderer';
import { createDefaultPipeline } from '@/rendering/render-pipeline';
import type { FrameContext, RenderDeps } from '@/rendering/render-pipeline';
import { drawWindRose, updateActiveWind } from '@/rendering/wind-layer';
import type { WindRoseViewport } from '@/rendering/wind-layer';
import { WindParticleSystem } from '@/rendering/wind-particles';
import { setupInteraction } from '@/ui/interaction';
import { setupPanel, syncDateInput, updateDateDisplay } from '@/ui/ui-panel';
import { setupOverlayControls } from '@/ui/overlay-controls';
import { updateEventPanel, updateSeasonBar, updateEventCountdowns } from '@/features/seasons';
import { DSOManager } from '@/features/dso';
import { NEOManager } from '@/features/neo';
import { AlertSystem } from '@/features/alerts';
import { drawEnochWheel, setupEnochUI } from '@/features/enoch';
import { renderBiblicalEventsPanel } from '@/features/biblical-events';
import { initWorldData } from '@/data/world-topo';
import { observer } from '@/data/observer';
import { SITE_MAP } from '@/data/cities';
import { DSO_GROUPS } from '@/data/dso-catalog';
import { maybeFetchWind, getWindSource, isWindUnavailable, getWindInterpT, getWindGridB, initWindData, isWindFetching } from '@/main/wind-manager';
import { setupPanelToggles } from '@/main/panel-toggles';
import { applyUrlParams, setupShareButton } from '@/main/share-url';
import { setupTideUI, isTidePanelOpen, closeTidePanel, getCachedTideState, updateTideCache, clearTideCache, drawTideCurveIfReady, formatTideTopBar } from '@/main/tide-ui';
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
const pathGen = geoPath(projection, canvas.getContext('2d'));

function applyProjection(): void {
  const vs = state.viewScale;
  const Wv = state.W / vs, Hv = state.H / vs;
  const minDim = Math.min(Wv, Hv);
  const polarRot = state.enochHem === 'S' ? 90 : -90;
  projection.scale((minDim / 2) / Math.PI).translate([Wv / 2, Hv / 2]).rotate([0, polarRot]);
}

const renderer = new CanvasRenderer(canvas, projection, pathGen);

let _cachedTopDateHtml = '';
let _cachedTopHenochHtml = '';
let _lastTopTimeUpdate = 0;
const TOP_TIME_THROTTLE_MS = 200;

function updateTopTimeDisplay(snap?: CalendarSnapshot): void {
  const now = performance.now();
  if (now - _lastTopTimeUpdate < TOP_TIME_THROTTLE_MS) return;
  _lastTopTimeUpdate = now;

  const topDateMainEl = lazyEl('topDateMain');
  const topHenochEl = lazyEl('topHenoch');

  const jd = state.currentJD !== null ? state.currentJD : dateToJD(state.currentTime);
  const snapshot = snap ?? timeService.getSnapshot(
    jd, state.userTimezone, state.enochHem, state.currentSunEclLon || 0,
    undefined, state.observerLongitude, state.observerLongitudeApprox, state.observerLatitude
  );

  if (topDateMainEl) {
    const joursSemaine = ['Dimanche', 'Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi'];

    const jdLocal = jd - (snapshot.tzOffsetMinutes / MINUTES_PER_DAY);

    const dayIndex = Math.floor(jdLocal + 1.5) % 7;
    const nomJour = joursSemaine[dayIndex];

    const localStr = `${nomJour} ${snapshot.localDateString}`;

    const calLabel = snapshot.julianDisplayString ? ' <span class="top-cal-label">(grég.)</span>' : '';
    const julianHtml = snapshot.julianDisplayString
      ? `<br><span>${snapshot.julianDisplayString} <span class="top-cal-label">(jul.)</span></span>`
      : '';
    const newHtml = `<span class="top-date-local">${localStr}${calLabel}</span>${julianHtml}`;
    if (newHtml !== _cachedTopDateHtml) {
      topDateMainEl.innerHTML = newHtml;
      _cachedTopDateHtml = newHtml;
    }
  }

  if (topHenochEl) {
    const enochStr = `${snapshot.enoch.labelText}`;
    const hebrewStr = `${snapshot.hebrew.labelText} <span class="top-hebrew-label">(Hébraïque)</span>`;
    const newHtml =
      `<span class="top-enoch-label">${enochStr}</span>` +
      `<br><span class="top-hebrew-text">${hebrewStr}</span>`;
    if (newHtml !== _cachedTopHenochHtml) {
      topHenochEl.innerHTML = newHtml;
      _cachedTopHenochHtml = newHtml;
    }
  }

  // Solar + lunar time display
  const topSolarEl = lazyEl('topSolar');
  if (state.isVisible('solarTime')) {
    if (topSolarEl) {
      const s = snapshot.solar;
      const l = snapshot.lunar;
      const lonDir = s.longitude >= 0 ? 'E' : 'O';
      const lonStr = `${Math.abs(s.longitude).toFixed(2)}°${lonDir}`;
      const solarHtml = `<span class="solar-time-label">☀</span> ${s.lastFormatted} · <span class="solar-noon-label">Midi</span> ${s.solarNoonLocalTime} · <span class="eot-label">EoT</span> ${s.eotFormatted} · <span class="lon-label">${lonStr}</span>` +
          `<br><span class="lunar-time-label">☽</span> ${l.lunarTimeFormatted} · <span class="lunar-transit-label">Transit</span> ${l.lunarTransitLocalTime} · <span class="lunar-shift-label">Décalage</span> +${Math.round(l.lunarShiftMinutes)}min/j`;
      topSolarEl.innerHTML = solarHtml;
      topSolarEl.style.display = '';
    }
  } else if (topSolarEl) {
    topSolarEl.style.display = 'none';
  }

  // Tide display (always visible, independent of layer toggle)
  const cachedTide = getCachedTideState();
  const topTideEl = lazyEl('topTide');
  if (cachedTide) {
    if (topTideEl) {
      topTideEl.innerHTML = formatTideTopBar()!;
      topTideEl.style.display = '';
    }
  } else if (topTideEl) {
    topTideEl.style.display = 'none';
  }
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

const alertSiteEl = document.getElementById('alertSite') as HTMLSelectElement | null;
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

const { updateToggleArrows, addCloseButtons } = setupPanelToggles(state);

// ── Initial resize ─────────────────────────────────────────────────

state.W = window.innerWidth;
state.H = window.innerHeight;
state.viewScale = Math.min(1, state.W / MOBILE_VIEWPORT_THRESHOLD);
const dpr = window.devicePixelRatio || 1;
canvas.width = state.W * dpr;
canvas.height = state.H * dpr;
canvas.style.width = state.W + 'px';
canvas.style.height = state.H + 'px';
enochCanvas.width = state.W * dpr;
enochCanvas.height = state.H * dpr;
enochCanvas.style.width = state.W + 'px';
enochCanvas.style.height = state.H + 'px';
applyProjection();

if (typeof WORLD_DATA !== 'undefined') {
  state.worldData = initWorldData(WORLD_DATA);
}

syncDateInput(state);

// ── URL GET parameters ──────────────────────────────────────────────

applyUrlParams({ state, timeService, applyProjection, eventListEl });
setupShareButton(state);

// ── Wind toggle + Tide modal ──────────────────────────────────────────

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
const tideBtn = document.getElementById('tideBtn') as HTMLButtonElement | null;

// ── Main Draw Loop ─────────────────────────────────────────────────

// ── FPS counter ───────────────────────────────────────────────────────
const fpsEl = document.createElement('div');
fpsEl.style.cssText = 'position:fixed;top:6px;right:6px;font:500 11px/1 "DM Mono",monospace;color:rgba(140,180,220,0.6);pointer-events:none;z-index:9999;user-select:none;contain:layout paint;display:flex;gap:10px;align-items:center';
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
let _fpsFrames = 0;
let _fpsLast = performance.now();

let _lastFrameTime: number = performance.now();
let _lastAdvanceTime: number = performance.now();
let _lastRealtimeSec = -1;
let _enochWasVisible = false;
let _cachedMoonKey = -1;
let _cachedMoonPhaseDeg = 0;
let _cachedMoonFraction = 0;
let _lastBiblicalUpdate = 0;
let _cachedTideKey = -1;


function draw(): void {
  if (!state.worldData) { state.animationId = requestAnimationFrame(draw); return; }

  const now = performance.now();

  // FPS counter update
  _fpsFrames++;
  if (now - _fpsLast >= 500) {
    fpsTextEl.textContent = Math.round(_fpsFrames / ((now - _fpsLast) / 1000)) + ' fps';
    _fpsFrames = 0;
    _fpsLast = now;
  }

  const dt = (now - _lastFrameTime) / 1000;
  _lastFrameTime = now;


  if (state.isRealtime) {
    state.currentTime = new Date();
    state.currentJD = null;
    // Throttle to 1 redraw/second in realtime — celestial positions barely change
    const nowSec = Math.floor(performance.now() / 1000);
    if (nowSec !== _lastRealtimeSec) {
      _lastRealtimeSec = nowSec;
      state.needsRedraw = true;
    }
  } else if (!state.isPaused) {
    // All units advance by full steps at a throttled rate.
    // sec/min: proportional to step size.
    // hour/day/month/year: fixed cadence so large jumps stay readable.
    const stepMs =
      state.timeStepUnit === 'sec' ? state.timeStepVal * 1000 :
      state.timeStepUnit === 'min' ? 50 :
      state.timeStepUnit === 'hour' ? 200 :
      state.timeStepUnit === 'day' ? 80 :
      state.timeStepUnit === 'month' ? 250 :
      state.timeStepUnit === 'year' ? 500 :
      0;
    const dt = now - _lastAdvanceTime;
    if (dt >= stepMs) {
      advanceTime(state);
      _lastAdvanceTime = now;
      state.needsRedraw = true;
    }
  }

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
    // Cache moon phase per minute — phase changes ~0.5°/h, invisible at minute granularity
    const moonCacheKey = Math.floor(jd * 1440);
    if (moonCacheKey !== _cachedMoonKey) {
      _cachedMoonKey = moonCacheKey;
      try {
        const moonIllum = Astronomy.Illumination(Astronomy.Body.Moon, astroTimeObj);
        _cachedMoonPhaseDeg = Astronomy.MoonPhase(astroTimeObj);
        _cachedMoonFraction = moonIllum.phase_fraction;
      } catch (e) {
        console.warn('[main] Moon phase calc failed', e);
      }
    }
    moonPhaseDeg = _cachedMoonPhaseDeg;
    moonFraction = _cachedMoonFraction;
  }
  state.moonPhaseDeg = moonPhaseDeg;

  state.cacheCheckboxes();

  // Wind overlay buttons
  const windOn = state.isVisible('windParticles');
  if (windBtn) windBtn.classList.toggle('active', windOn);
  const roseOn = state.isVisible('winds');
  if (windRoseBtn) windRoseBtn.classList.toggle('active', roseOn);

  // Show/hide tide button and modal based on layer toggle
  const tideLayersOn = state.isVisible('tideLayers');
  if (tideBtn) tideBtn.classList.toggle('active', isTidePanelOpen());
  if (!tideLayersOn && isTidePanelOpen()) closeTidePanel();

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
    jd: computedJD, T, epsRad, gmst,
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

  // Wind rose — drawn in screen space (after viewport transform is restored)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  if (state.isVisible('winds')) {
    updateActiveWind(projection, state as WindRoseViewport, state.windGrid);
    drawWindRose(ctx, state.W, state.H, state.enochHem);
  }

  // Wind particles — drawn in screen space after pipeline
  const windInfoEl = lazyEl('windInfo');
  if (state.isVisible('windParticles')) {
    if (windInfoEl) {
      const src = getWindSource();
      const label = isWindFetching() ? 'Chargement GFS…' : isWindUnavailable() ? 'GFS indisponible' : src.startsWith('placeholder') ? 'Climatologie' : src;
      windInfoEl.textContent = label;
      windInfoEl.style.display = '';
    }

    if (state.windGrid && !isWindUnavailable()) {
      windSystem.ensureCanvas(state.W, state.H, dpr);
      let windDt = dt || DT_FALLBACK;
      if (!state.isRealtime && !state.isPaused) {
        const stepScale =
          state.timeStepUnit === 'hour' ? 60 :
          state.timeStepUnit === 'day' ? 300 :
          state.timeStepUnit === 'month' ? 600 :
          state.timeStepUnit === 'year' ? 1200 :
          state.timeStepUnit === 'min' ? 5 : 1;
        windDt = Math.min((dt || DT_FALLBACK) * stepScale, 0.5);
      }
      const gridB = getWindGridB();
      windSystem.update(state.windGrid, gridB, getWindInterpT(), projection, state, windDt);
      windSystem.render(ctx);
    }
  } else if (windInfoEl) {
    windInfoEl.style.display = 'none';
  }

  if (state.currentJD === null) {
    updateSeasonBar(state, seasonBarEl);
  }

  const currentJD = state.getAstroJD();
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

  // Throttle biblical events panel and SEO meta — they only change on day transitions
  const _now = performance.now();
  const _forceBiblical = snap.isMidnightTransition;

  if (state.isVisible('enoch')) {
    _enochWasVisible = true;
    drawEnochWheel(state, enochCtx, true, snap);
    if (_forceBiblical || _now - _lastBiblicalUpdate > BIBLICAL_EVENTS_THROTTLE_MS) {
      _lastBiblicalUpdate = _now;
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
    if (_enochWasVisible) {
      enochCtx.clearRect(0, 0, state.W, state.H);
      _enochWasVisible = false;
    }
    if (_now - _lastBiblicalUpdate > BIBLICAL_EVENTS_THROTTLE_MS) {
      _lastBiblicalUpdate = _now;
      renderBiblicalEventsPanel({ container: biblicalEventsEl, enochMonthIdx: -1, enochDayInMonth: -1, enochCurDay: -1, gregYear: snap.gregorian.year, gregMonth: snap.gregorian.month, gregDay: snap.gregorian.day, hebrewMonth: -1, hebrewDay: -1, enochHem: state.enochHem });
    }
  }

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