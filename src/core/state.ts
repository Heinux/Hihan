import { ZOOM, TOGGLE_IDS, JULIAN_UNIX_EPOCH, MS_PER_DAY } from '@/core/constants';
import type { CelestialBody } from '@/core/constants';
import { EventEmitter } from '@/core/event-emitter';
import { getLongitudeForTimezone } from '@/core/solar-time';
import type { WindGrid } from '@/data/wind-grid';

export interface BodyPosition {
  body: CelestialBody;
  px: number;
  py: number;
  ra: number;
  dec: number;
  dist?: number;
  moonPhase?: number;
  moonFraction?: number;
}

export interface SmoothPositions {
  [bodyId: string]: { lon: number; lat: number };
}

interface CheckboxCache {
  [key: string]: boolean;
}

export interface ViewportState {
  W: number;
  H: number;
  zoomK: number;
  panX: number;
  panY: number;
  viewScale: number;
}

export interface TimeState {
  isPaused: boolean;
  isRealtime: boolean;
  timeStepUnit: string;
  timeStepVal: number;
  currentTime: Date;
  currentJD: number | null;
  currentYearOverride: number | null;
  userTimezone: string;
  observerLongitude: number;
  observerLatitude: number;
  observerLongitudeApprox: boolean;
}

export interface CelestialState {
  smoothPositions: SmoothPositions;
  bodyPositions: BodyPosition[];
  sunScreenX: number;
  sunScreenY: number;
  moonScreenX: number | null;
  moonScreenY: number | null;
  moonPhaseDeg: number;
  currentSunEclLon: number;
}

export interface EnochState {
  enochHem: 'N' | 'S';
  enochAnimFactor: number;
  enochTargetFactor: number;
}

export class AppState extends EventEmitter {
  // Sub-states
  readonly viewport: ViewportState;
  readonly time: TimeState;
  readonly celestial: CelestialState;
  readonly enoch: EnochState;

  // Rendering
  needsRedraw: boolean;
  animationId: number | null;

  // Interaction
  isDragging: boolean;
  lastMouse: { x: number; y: number } | null;
  lastTouchDist: number | null;
  hoveredBody: BodyPosition | null;

  // World map data
  worldData: GeoJSON.FeatureCollection | null;

  // Wind grid data
  windGrid: WindGrid | null = null;
  windGridLoading = false;

  // City hover
  hoveredCity: { city: { name: string; lon: number; lat: number; type: 'city' | 'landmark'; symbol?: string }; px: number; py: number } | null;

  // UI callbacks
  updateTopTimeDisplay: (() => void) | null;

  // Cache
  private _checkboxCache: CheckboxCache;
  private _checkboxEls: Map<string, HTMLInputElement | null>;
  private _alertEnabledEl: HTMLInputElement | null;

  constructor() {
    super();

    // Viewport sub-state
    this.viewport = {
      W: 0,
      H: 0,
      zoomK: ZOOM.DEFAULT,
      panX: 0,
      panY: 0,
      viewScale: 1,
    };

    // Time sub-state
    this.time = {
      isPaused: false,
      isRealtime: true,
      timeStepUnit: 'sec',
      timeStepVal: 1,
      currentTime: new Date(),
      currentJD: null,
      currentYearOverride: null,
      userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      observerLongitude: 0,
      observerLatitude: 0,
      observerLongitudeApprox: false,
    };

    // Celestial sub-state
    this.celestial = {
      smoothPositions: {},
      bodyPositions: [],
      sunScreenX: 0,
      sunScreenY: 0,
      moonScreenX: null,
      moonScreenY: null,
      moonPhaseDeg: 0,
      currentSunEclLon: 0,
    };

    // Enoch sub-state
    this.enoch = {
      enochHem: 'N',
      enochAnimFactor: 0,
      enochTargetFactor: 0,
    };

    // Rendering
    this.needsRedraw = true;
    this.animationId = null;

    // Interaction
    this.isDragging = false;
    this.lastMouse = null;
    this.lastTouchDist = null;
    this.hoveredBody = null;

    // World map data
    this.worldData = null;

    // City hover
    this.hoveredCity = null;

    // UI callbacks
    this.updateTopTimeDisplay = null;

    // Cache
    this._checkboxCache = {};
    this._checkboxEls = new Map();
    this._alertEnabledEl = null;

    // Initialize observer coordinates from system timezone
    this.updateObserverCoords();
  }

  // ── Viewport getters/setters (backward compat) ───────────────────

  get W(): number { return this.viewport.W; }
  set W(v: number) { this.viewport.W = v; }

  get H(): number { return this.viewport.H; }
  set H(v: number) { this.viewport.H = v; }

  get zoomK(): number { return this.viewport.zoomK; }
  set zoomK(v: number) { this.viewport.zoomK = v; this.emit('viewport:zoom', { zoomK: v }); }

  get panX(): number { return this.viewport.panX; }
  set panX(v: number) { this.viewport.panX = v; }

  get panY(): number { return this.viewport.panY; }
  set panY(v: number) { this.viewport.panY = v; }

  get viewScale(): number { return this.viewport.viewScale; }
  set viewScale(v: number) { this.viewport.viewScale = v; }

  // ── Time getters/setters (backward compat) ────────────────────────

  get isPaused(): boolean { return this.time.isPaused; }
  set isPaused(v: boolean) { this.time.isPaused = v; this.emit('time:changed', { jd: this.getAstroJD() }); }

  get isRealtime(): boolean { return this.time.isRealtime; }
  set isRealtime(v: boolean) { this.time.isRealtime = v; }

  get timeStepUnit(): string { return this.time.timeStepUnit; }
  set timeStepUnit(v: string) { this.time.timeStepUnit = v; }

  get timeStepVal(): number { return this.time.timeStepVal; }
  set timeStepVal(v: number) { this.time.timeStepVal = v; }

  get currentTime(): Date { return this.time.currentTime; }
  set currentTime(v: Date) { this.time.currentTime = v; }

  get currentJD(): number | null { return this.time.currentJD; }
  set currentJD(v: number | null) { this.time.currentJD = v; }

  get currentYearOverride(): number | null { return this.time.currentYearOverride; }
  set currentYearOverride(v: number | null) { this.time.currentYearOverride = v; }

  /** User-selected timezone (IANA, e.g. "Europe/Paris") */
  get userTimezone(): string { return this.time.userTimezone; }
  set userTimezone(v: string) {
    this.time.userTimezone = v;
    this.updateObserverCoords();
    this.emit('timezone:changed', { tz: v });
    this.needsRedraw = true;
  }

  get observerLongitude(): number { return this.time.observerLongitude; }
  get observerLatitude(): number { return this.time.observerLatitude; }
  get observerLongitudeApprox(): boolean { return this.time.observerLongitudeApprox; }

  /** Update observer coordinates from the current timezone. */
  updateObserverCoords(): void {
    const { lng, lat, approx } = getLongitudeForTimezone(this.time.userTimezone, this.time.currentTime);
    this.time.observerLongitude = lng;
    this.time.observerLatitude = lat;
    this.time.observerLongitudeApprox = approx;
  }

  // ── Celestial getters/setters (backward compat) ───────────────────

  get smoothPositions(): SmoothPositions { return this.celestial.smoothPositions; }
  set smoothPositions(v: SmoothPositions) { this.celestial.smoothPositions = v; }

  get bodyPositions(): BodyPosition[] { return this.celestial.bodyPositions; }
  set bodyPositions(v: BodyPosition[]) { this.celestial.bodyPositions = v; }

  get sunScreenX(): number { return this.celestial.sunScreenX; }
  set sunScreenX(v: number) { this.celestial.sunScreenX = v; }

  get sunScreenY(): number { return this.celestial.sunScreenY; }
  set sunScreenY(v: number) { this.celestial.sunScreenY = v; }

  get moonScreenX(): number | null { return this.celestial.moonScreenX; }
  set moonScreenX(v: number | null) { this.celestial.moonScreenX = v; }

  get moonScreenY(): number | null { return this.celestial.moonScreenY; }
  set moonScreenY(v: number | null) { this.celestial.moonScreenY = v; }

  get moonPhaseDeg(): number { return this.celestial.moonPhaseDeg; }
  set moonPhaseDeg(v: number) { this.celestial.moonPhaseDeg = v; }

  get currentSunEclLon(): number { return this.celestial.currentSunEclLon; }
  set currentSunEclLon(v: number) { this.celestial.currentSunEclLon = v; }

  // ── Enoch getters/setters (backward compat) ───────────────────────

  get enochHem(): 'N' | 'S' { return this.enoch.enochHem; }
  set enochHem(v: 'N' | 'S') { this.enoch.enochHem = v; this.emit('hemisphere:changed', { hem: v }); }

  get enochAnimFactor(): number { return this.enoch.enochAnimFactor; }
  set enochAnimFactor(v: number) { this.enoch.enochAnimFactor = v; }

  get enochTargetFactor(): number { return this.enoch.enochTargetFactor; }
  set enochTargetFactor(v: number) { this.enoch.enochTargetFactor = v; }

  // ── Methods ────────────────────────────────────────────────────────

  requestRedraw(): void {
    this.needsRedraw = true;
    this.emit('redraw');
  }

  public getAstroJD(): number {
    if (this.currentJD !== null) return this.currentJD;
    return this.currentTime.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;
  }

  private _checkboxCacheValid = false;

  public cacheCheckboxes(): void {
    if (this._checkboxCacheValid) return;
    this._checkboxCacheValid = true;
    TOGGLE_IDS.forEach((id: string) => {
      let el = this._checkboxEls.get(id);
      if (el === undefined) {
        el = document.getElementById('show-' + id) as HTMLInputElement | null;
        this._checkboxEls.set(id, el);
        if (el) el.addEventListener('change', () => this.invalidateCheckboxCache());
      }
      this._checkboxCache[id] = el?.checked ?? false;
    });
    if (!this._alertEnabledEl) {
      this._alertEnabledEl = document.getElementById('alertEnabled') as HTMLInputElement | null;
      if (this._alertEnabledEl) this._alertEnabledEl.addEventListener('change', () => this.invalidateCheckboxCache());
    }
    this._checkboxCache.alertEnabled = this._alertEnabledEl?.checked ?? false;
  }

  public invalidateCheckboxCache(): void {
    this._checkboxCacheValid = false;
  }

  public isVisible(id: string): boolean {
    return this._checkboxCache[id] ?? false;
  }

  public cleanup(): void {
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
    this.removeAllListeners();
  }
}