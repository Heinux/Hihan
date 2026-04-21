// ── Wind grid caching, fetching, and temporal interpolation ────────────
// GFS data comes in 3h steps. We keep two bracketing grids (A=earlier, B=later)
// and interpolate the velocity field between them for smooth transitions.

import { JULIAN_UNIX_EPOCH, MS_PER_DAY } from '@/core/constants';
import { WindGrid } from '@/data/wind-grid';
import type { AppState } from '@/core/state';
import { WindParticleSystem } from '@/rendering/wind-particles';

type WindBracket = {
  keyA: string; keyB: string; t: number; dateStrA: string; hourA: number; dateStrB: string; hourB: number;
};

const WIND_CACHE_MAX = 4;

/** Convert a UTC date to a GFS 3h cache key "YYYYMMDD-HHH" */
function windDateToKey(d: Date): string {
  const hour3 = Math.floor(d.getUTCHours() / 3) * 3;
  return d.getUTCFullYear().toString().padStart(4, '0') +
    (d.getUTCMonth() + 1).toString().padStart(2, '0') +
    d.getUTCDate().toString().padStart(2, '0') +
    '-' + hour3;
}

export class WindManager {
  #cache = new Map<string, WindGrid>();
  #gridAKey = '';
  #gridBKey = '';
  #interpT = 0;
  #source = '';
  #unavailable = false;
  #fetchQueue: string[] = [];
  #fetching = false;

  getWindSource(): string { return this.#source; }
  isWindUnavailable(): boolean { return this.#unavailable; }
  getWindInterpT(): number { return this.#interpT; }
  isWindFetching(): boolean { return this.#fetching; }

  #getGridCached(key: string): WindGrid | null {
    const grid = this.#cache.get(key);
    if (grid) {
      this.#cache.delete(key);
      this.#cache.set(key, grid);
    }
    return grid ?? null;
  }

  #cacheGrid(key: string, grid: WindGrid): void {
    this.#cache.set(key, grid);
    while (this.#cache.size > WIND_CACHE_MAX) {
      const oldest = this.#cache.keys().next().value;
      if (oldest) this.#cache.delete(oldest);
    }
  }

  #fetchGfsWind(dateStr: string, utcHour: number): Promise<WindGrid | null> {
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
          this.#source = source;
          return res.arrayBuffer().then(buf => ({ buf, source }));
        })
        .then(({ buf, source }) => {
          const grid = WindGrid.decode(buf);
          this.#source = source;
          this.#unavailable = false;
          resolve(grid);
        })
        .catch(err => {
          console.warn('[wind] GFS fetch failed:', err);
          resolve(null);
        });
    });
  }

  #gfsWindBracket(jd: number): WindBracket | null {
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

  #processFetchQueue(currentBracket: WindBracket | null, state: AppState, windSystem: WindParticleSystem): void {
    if (this.#fetching || this.#fetchQueue.length === 0) return;

    const keys = this.#fetchQueue.splice(0);
    const keyAToFetch = keys.find(k => k === currentBracket?.keyA);
    const keyToFetch = keyAToFetch ?? keys[0];
    const remaining = keys.filter(k => k !== keyToFetch);
    this.#fetchQueue.push(...remaining);

    this.#fetching = true;
    const dashIdx = keyToFetch.lastIndexOf('-');
    const datePart = keyToFetch.slice(0, dashIdx);
    const hourPart = keyToFetch.slice(dashIdx + 1);
    const utcHour = parseInt(hourPart, 10);

    this.#fetchGfsWind(datePart, utcHour).then(grid => {
      if (grid) {
        this.#cacheGrid(keyToFetch, grid);
        if (keyToFetch === currentBracket?.keyA) {
          this.#gridAKey = keyToFetch;
          state.windGrid = grid;
          windSystem.setGrid(grid);
        }
        if (keyToFetch === currentBracket?.keyB) {
          this.#gridBKey = keyToFetch;
        }
      } else {
        this.#unavailable = true;
        this.#source = 'Indisponible';
      }
      this.#fetching = false;
      if (this.#fetchQueue.length > 0) {
        this.#processFetchQueue(currentBracket, state, windSystem);
      }
    });
  }

  maybeFetchWind(jd: number, state: AppState, windSystem: WindParticleSystem): void {
    const bracket = this.#gfsWindBracket(jd);
    if (!bracket) return;

    this.#interpT = bracket.t;

    const ms = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
    const d = new Date(ms);
    // No GFS data before 2004-03-01 (earliest NCEI archive)
    const minDate = new Date(Date.UTC(2004, 2, 1));
    if (d.getTime() < minDate.getTime()) {
      this.#unavailable = true;
      this.#source = 'Indisponible';
      state.windGrid = null;
      windSystem.reset();
      return;
    }
    // Only block dates beyond the GFS forecast range (~16 days from now).
    const now = new Date();
    const maxForecast = new Date(now.getTime() + 16 * 86400000);
    if (d.getTime() > maxForecast.getTime()) {
      this.#unavailable = true;
      this.#source = 'Indisponible';
      state.windGrid = null;
      windSystem.reset();
      return;
    }
    this.#unavailable = false;

    if (bracket.keyA !== this.#gridAKey) {
      const cached = this.#getGridCached(bracket.keyA);
      if (cached) {
        this.#gridAKey = bracket.keyA;
        state.windGrid = cached;
        windSystem.setGrid(cached);
      } else {
        this.#fetchQueue.push(bracket.keyA);
      }
    }

    if (bracket.keyB !== this.#gridBKey) {
      const cached = this.#getGridCached(bracket.keyB);
      if (cached) {
        this.#gridBKey = bracket.keyB;
      } else {
        this.#fetchQueue.push(bracket.keyB);
      }
    }

    if (!this.#fetching && this.#fetchQueue.length > 0) {
      this.#processFetchQueue(bracket, state, windSystem);
    }
  }

  getWindGridB(): WindGrid | null {
    if (!this.#gridBKey) return null;
    return this.#getGridCached(this.#gridBKey);
  }

  initWindData(windDataUrl: string, state: AppState, windSystem: WindParticleSystem): void {
    WindGrid.fetchLatest(windDataUrl).then(grid => {
      const key = windDateToKey(new Date(grid.timestamp * 1000));
      this.#cacheGrid(key, grid);
      this.#gridAKey = key;
      state.windGrid = grid;
      windSystem.setGrid(grid);
      this.#source = grid.source || '';
      state.emit('wind:loaded', { grid });
    }).catch(err => {
      console.warn('[wind] Failed to load wind data:', err);
      state.emit('wind:error', { error: err });
    });
  }
}

// Singleton for production use
export const windManager = new WindManager();

// Convenience re-exports that delegate to the singleton
export const getWindSource = () => windManager.getWindSource();
export const isWindUnavailable = () => windManager.isWindUnavailable();
export const maybeFetchWind = (jd: number, state: AppState, ws: WindParticleSystem) => windManager.maybeFetchWind(jd, state, ws);
export const getWindInterpT = () => windManager.getWindInterpT();
export const isWindFetching = () => windManager.isWindFetching();
export const getWindGridB = () => windManager.getWindGridB();
export const initWindData = (url: string, state: AppState, ws: WindParticleSystem) => windManager.initWindData(url, state, ws);