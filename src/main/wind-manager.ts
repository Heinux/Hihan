// ── Wind grid caching, fetching, and temporal interpolation ────────────
// GFS data comes in 3h steps. We keep two bracketing grids (A=earlier, B=later)
// and interpolate the velocity field between them for smooth transitions.

import { JULIAN_UNIX_EPOCH, MS_PER_DAY } from '@/core/constants';
import { WindGrid } from '@/data/wind-grid';
import type { AppState } from '@/core/state';
import { WindParticleSystem } from '@/rendering/wind-particles';

const WIND_CACHE_MAX = 4;

const _windGridCache = new Map<string, WindGrid>();
let _windGridAKey = '';
let _windGridBKey = '';
let _windInterpT = 0;
let _windSource = '';
let _windUnavailable = false;
let _windFetchQueue: string[] = [];
let _windFetching = false;

export function getWindSource(): string { return _windSource; }
export function isWindUnavailable(): boolean { return _windUnavailable; }

/** Convert a UTC date to a GFS 3h cache key "YYYYMMDD-HHH" */
function windDateToKey(d: Date): string {
  const hour3 = Math.floor(d.getUTCHours() / 3) * 3;
  return d.getUTCFullYear().toString().padStart(4, '0') +
    (d.getUTCMonth() + 1).toString().padStart(2, '0') +
    d.getUTCDate().toString().padStart(2, '0') +
    '-' + hour3;
}

function getWindGridCached(key: string): WindGrid | null {
  const grid = _windGridCache.get(key);
  if (grid) {
    _windGridCache.delete(key);
    _windGridCache.set(key, grid);
  }
  return grid ?? null;
}

function cacheWindGrid(key: string, grid: WindGrid): void {
  _windGridCache.set(key, grid);
  while (_windGridCache.size > WIND_CACHE_MAX) {
    const oldest = _windGridCache.keys().next().value;
    if (oldest) _windGridCache.delete(oldest);
  }
}

/** Fetch real GFS wind data for a given date+hour from the Netlify function */
function fetchGfsWind(dateStr: string, utcHour: number): Promise<WindGrid | null> {
  return new Promise((resolve) => {
    const url = `/api/wind?date=${dateStr}&hour=${utcHour}`;
    fetch(url)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const ct = res.headers.get('Content-Type') || '';
        if (!ct.includes('octet-stream') && !ct.includes('application/x-')) {
          throw new Error(`Unexpected content type: ${ct}`);
        }
        const source = res.headers.get('X-Wind-Source') || 'gfs';
        _windSource = source;
        return res.arrayBuffer().then(buf => ({ buf, source }));
      })
      .then(({ buf, source }) => {
        const grid = WindGrid.decode(buf);
        _windSource = source;
        _windUnavailable = false;
        resolve(grid);
      })
      .catch(err => {
        console.warn('[wind] GFS fetch failed:', err);
        resolve(null);
      });
  });
}

/** Compute the two bracketing 3h keys and interpolation factor for a given JD */
function gfsWindBracket(jd: number): {
  keyA: string; keyB: string; t: number; dateStrA: string; hourA: number; dateStrB: string; hourB: number;
} | null {
  const ms = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;

  const hour = d.getUTCHours();
  const min = d.getUTCMinutes();
  const hourFloor3 = Math.floor(hour / 3) * 3;
  const hourCeil3 = hourFloor3 + 3;
  const t = ((hour - hourFloor3) * 60 + min) / 180;

  const dateStrA = d.getUTCFullYear().toString().padStart(4, '0') +
    (d.getUTCMonth() + 1).toString().padStart(2, '0') +
    d.getUTCDate().toString().padStart(2, '0');
  const keyA = `${dateStrA}-${hourFloor3}`;

  let dateStrB: string;
  if (hourCeil3 >= 24) {
    const nextDay = new Date(d.getTime() + 86400000);
    dateStrB = nextDay.getUTCFullYear().toString().padStart(4, '0') +
      (nextDay.getUTCMonth() + 1).toString().padStart(2, '0') +
      nextDay.getUTCDate().toString().padStart(2, '0');
  } else {
    dateStrB = dateStrA;
  }
  const keyB = `${dateStrB}-${hourCeil3 % 24}`;

  return { keyA, keyB, t, dateStrA, hourA: hourFloor3, dateStrB, hourB: hourCeil3 % 24 };
}

function processWindFetchQueue(currentBracket: ReturnType<typeof gfsWindBracket>, state: AppState, windSystem: WindParticleSystem): void {
  if (_windFetching || _windFetchQueue.length === 0) return;

  const keys = _windFetchQueue.splice(0);
  const keyAToFetch = keys.find(k => k === currentBracket?.keyA);
  const keyToFetch = keyAToFetch ?? keys[0];
  const remaining = keys.filter(k => k !== keyToFetch);
  _windFetchQueue.push(...remaining);

  _windFetching = true;
  const dashIdx = keyToFetch.lastIndexOf('-');
  const datePart = keyToFetch.slice(0, dashIdx);
  const hourPart = keyToFetch.slice(dashIdx + 1);
  const utcHour = parseInt(hourPart, 10);

  fetchGfsWind(datePart, utcHour).then(grid => {
    if (grid) {
      cacheWindGrid(keyToFetch, grid);
      if (keyToFetch === currentBracket?.keyA) {
        _windGridAKey = keyToFetch;
        state.windGrid = grid;
        windSystem.setGrid(grid);
      }
      if (keyToFetch === currentBracket?.keyB) {
        _windGridBKey = keyToFetch;
      }
    } else {
      _windUnavailable = true;
      _windSource = 'Indisponible';
    }
    _windFetching = false;
    if (_windFetchQueue.length > 0) {
      processWindFetchQueue(currentBracket, state, windSystem);
    }
  });
}

/** Check if we need new wind data for the current simulated time */
export function maybeFetchWind(jd: number, state: AppState, windSystem: WindParticleSystem): void {
  const bracket = gfsWindBracket(jd);
  if (!bracket) return;

  _windInterpT = bracket.t;

  const ms = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
  const d = new Date(ms);
  const now = new Date();
  const twoWeeksAgo = new Date(now.getTime() - 15 * 86400000);
  if (d.getTime() < twoWeeksAgo.getTime()) {
    _windUnavailable = true;
    _windSource = 'Indisponible';
    state.windGrid = null;
    windSystem.reset();
    return;
  }
  const maxForecast = new Date(now.getTime() + 16 * 86400000);
  if (d.getTime() > maxForecast.getTime()) {
    _windUnavailable = true;
    _windSource = 'Indisponible';
    state.windGrid = null;
    windSystem.reset();
    return;
  }
  _windUnavailable = false;

  if (bracket.keyA !== _windGridAKey) {
    const cached = getWindGridCached(bracket.keyA);
    if (cached) {
      _windGridAKey = bracket.keyA;
      state.windGrid = cached;
      windSystem.setGrid(cached);
    } else {
      _windFetchQueue.push(bracket.keyA);
    }
  }

  if (bracket.keyB !== _windGridBKey) {
    const cached = getWindGridCached(bracket.keyB);
    if (cached) {
      _windGridBKey = bracket.keyB;
    } else {
      _windFetchQueue.push(bracket.keyB);
    }
  }

  if (!_windFetching && _windFetchQueue.length > 0) {
    processWindFetchQueue(bracket, state, windSystem);
  }
}

/** Get the interpolation factor between wind grid A and B */
export function getWindInterpT(): number { return _windInterpT; }

/** Whether a GFS fetch is in progress */
export function isWindFetching(): boolean { return _windFetching; }

/** Get the interpolation grid B (for temporal blending) */
export function getWindGridB(): WindGrid | null {
  if (!_windGridBKey) return null;
  return getWindGridCached(_windGridBKey);
}

/** Initialize wind system with placeholder data */
export function initWindData(windDataUrl: string, state: AppState, windSystem: WindParticleSystem): void {
  WindGrid.fetchLatest(windDataUrl).then(grid => {
    const key = windDateToKey(new Date(grid.timestamp * 1000));
    cacheWindGrid(key, grid);
    _windGridAKey = key;
    state.windGrid = grid;
    windSystem.setGrid(grid);
    _windSource = grid.source || '';
    state.emit('wind:loaded', { grid });
  }).catch(err => {
    console.warn('[wind] Failed to load wind data:', err);
    state.emit('wind:error', { error: err });
  });
}