import type { SeasonDef } from '@/core/constants';
export type { SeasonDef } from '@/core/constants';

export interface GregorianDate {
  year: number;
  month: number;
  day: number;
  hours: number;
  mins: number;
}

export interface CalendarSnapshot {
  canonicalJD: number;
  gregorian: GregorianDate;
  gregorianUTC: GregorianDate;
  localDateString: string;
  julianDisplayString: string | null;
  enoch: {
    preciseDay: number;
    curDay: number;
    currentMonthIdx: number;
    dayInMonth: number;
    isOutOfTime: boolean;
    outOfTimeDay: number | null;
    labelText: string;
    monthOffsets: number[];
  };
  hebrew: {
    day: number;
    month: number;
    monthName: string;
    hebrewYear: number;
    labelText: string;
  };
  tzOffsetMinutes: number;
  userTimezone: string;
  isMidnightTransition: boolean;
  solar: {
    lastHours: number;
    lastFormatted: string;
    eotMinutes: number;
    eotFormatted: string;
    solarNoonLocalTime: string;
    longitude: number;
    longitudeApprox: boolean;
  };
  lunar: {
    lunarTimeHours: number;
    lunarTimeFormatted: string;
    lunarTransitLocalTime: string;
    lunarShiftMinutes: number;
  };
}

export interface SeasonDeps {
  currentJD: number | null;
  currentTime: Date;
  enochHem: 'N' | 'S';
  getAstroJD(): number;
  currentSunEclLon?: number;
}

export interface EnochComputeDeps {
  currentJD: number | null;
  currentTime: Date;
  currentSunEclLon?: number;
  enochHem: 'N' | 'S';
  userTimezone: string;
}

export interface EnochDeps extends EnochComputeDeps {
  getAstroJD(): number;
  panX: number;
  panY: number;
  zoomK: number;
  needsRedraw: boolean;
  sunScreenX?: number;
  sunScreenY?: number;
  moonScreenX?: number | null;
  moonScreenY?: number | null;
  moonPhaseDeg?: number;
}

export interface AlertDeps {
  getAstroJD(): number;
  isVisible(id: string): boolean;
  jdToDateString: (jd: number) => string;
  dsoGroups: readonly import('@/data/dso-catalog').DSOGroup[];
  dsoGroupState: Record<string, boolean>;
}

export interface DSODeps {
  W: number;
  H: number;
  panX: number;
  panY: number;
  zoomK: number;
  needsRedraw: boolean;
}

export interface PanelDeps {
  currentJD: number | null;
  currentTime: Date;
  timeStepUnit: string;
  timeStepVal: number;
  isPaused: boolean;
  isRealtime: boolean;
  needsRedraw: boolean;
  userTimezone: string;
  updateTopTimeDisplay?: (() => void) | null;
}

export interface OverlayState {
  enochHem: 'N' | 'S';
  isPaused: boolean;
  isRealtime: boolean;
  timeStepUnit: string;
  timeStepVal: number;
  currentTime: Date;
  currentJD: number | null;
  needsRedraw: boolean;
  userTimezone: string;
  getAstroJD(): number;
  updateTopTimeDisplay?: (() => void) | null;
}

export interface OverlayCallbacks {
  onRedraw: () => void;
  onHemSwitch: (hem: 'N' | 'S') => void;
  onStepChange?: (unit: string) => void;
}

export interface PanelState {
  currentJD: number | null;
  currentTime: Date;
  userTimezone: string;
  needsRedraw: boolean;
}

export interface SeasonResult {
  vernal: Date;
  summer: Date;
  autumnal: Date;
  winter: Date;
}

export interface SeasonJDs {
  vernal: number;
  summer: number;
  autumnal: number;
  winter: number;
}

export interface SeasonEvent {
  def: SeasonDef;
  date: Date;
  jd: number;
  year: number;
}

export interface CurrentSeasonInfo {
  season: string;
  progress: number;
}

export interface AlertEntry {
  dsoName: string;
  siteName: string;
  separation: string;
  dateStr: string;
  jd: number;
  group: string;
  groupColor: string;
}

export interface CanvasObject {
  obj: import('@/data/dso-catalog').DSOObject;
  group: import('@/data/dso-catalog').DSOGroup;
  px: number;
  py: number;
}

export interface DateDisplayDeps {
  jdToDateString: (jd: number) => string;
  jdToLocalDateString: (jd: number, tz?: string) => string;
  jdToJulianDisplayString: (jd: number) => string | null;
}

export interface EnochCallbacks {
  applyProjection: () => void;
  forceEventPanelRefresh: () => void;
}

export interface SeasonArc {
  name: string;
  months: number[];
  color: string;
  stroke: string;
}

export interface Site {
  name: string;
  lon: number;
  lat: number;
  type: 'city' | 'landmark';
  symbol?: string;
}

export type GeoProjection = (point: [number, number]) => [number, number] | null;
