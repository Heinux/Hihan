/**
 * neo.ts
 *
 * Near Earth Object manager.
 *
 * Fetches close-approach data from the CNEOS CAD API (via Netlify proxy),
 * then queries Horizons for RA/Dec ephemerides, interpolates positions
 * at the current Julian Date, and derives comet tails from the ephemeris
 * arc (re-projected each frame so trails stay fixed on the celestial sphere).
 *
 * Only available at second/minute time steps — auto-disables otherwise.
 * API calls are throttled to 1 per 60s.
 */

import type { AppState } from '@/core/state';
import type { GeoProjection } from '@/core/types';

// ── Types ──────────────────────────────────────────────────────────

export interface NEODatum {
  des: string;    // designation (e.g. "2024 AB")
  cd: string;    // close-approach date "YYYY-MMM-DD HH:MM"
  dist: string;  // nominal approach distance (AU)
  dist_min: string;
  dist_max: string;
}

export interface EphemerisEntry {
  jd: number;
  ra: number;   // hours
  dec: number;  // degrees
}

export interface TrailPoint {
  px: number;
  py: number;
}

export interface NEORenderData {
  des: string;
  px: number;
  py: number;
  dist: number;  // AU — for size scaling
  trail: TrailPoint[];
}

// ── Constants ──────────────────────────────────────────────────────

const PROXY_BASE = '/api/horizons-proxy';
const FETCH_INTERVAL_MS = 60_000;       // minimum 60s between API calls
const TRAIL_MAX_ENTRIES = 80;           // max ephemeris entries used for tail
const EPH_STEP_MINUTES = 30;           // Horizons step size
const EPH_WINDOW_HOURS = 24;           // fetch ±12h around current JD
const DATE_RANGE_DAYS = 7;             // CAD query: ±7 days
const MAX_NEOS = 10;                   // cap on number of tracked NEOs

// ── Helpers ────────────────────────────────────────────────────────

function formatCADDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ── NEOManager ─────────────────────────────────────────────────────

export class NEOManager {
  #state: AppState;
  #projection: GeoProjection;
  #normLonFn: (lon: number) => number;

  // Data
  #neos: NEODatum[] = [];
  #ephemerides = new Map<string, EphemerisEntry[]>();

  // Throttle
  #lastCADFetch = 0;
  #lastEphFetches = new Map<string, number>();

  // State
  #enabled = false;
  #fetching = false;
  #warned = new Set<string>(); // one-time warning tracker

  constructor(
    state: AppState,
    projection: GeoProjection,
    normLonFn: (lon: number) => number,
  ) {
    this.#state = state;
    this.#projection = projection;
    this.#normLonFn = normLonFn;
  }

  // ── Public API ─────────────────────────────────────────────────

  get enabled(): boolean { return this.#enabled; }

  set enabled(v: boolean) {
    this.#enabled = v;
    if (v) {
      this.#warned.clear(); // allow fresh warnings on new activation
    }
    this.#state.needsRedraw = true;
  }

  /** Whether the current time step allows NEO tracking (sec/min only) */
  isAvailable(): boolean {
    const unit = this.#state.timeStepUnit;
    return unit === 'sec' || unit === 'min';
  }

  /** Check step on change; auto-disable if too coarse */
  checkTimeStep(): void {
    if (this.#enabled && !this.isAvailable()) {
      this.#enabled = false;
      // Update checkbox visual
      const cb = document.getElementById('show-neo') as HTMLInputElement | null;
      if (cb) cb.checked = false;
      this.#state.cacheCheckboxes();
      this.#state.needsRedraw = true;
    }
  }

  /** Project a single RA/Dec to screen coords via current GMST */
  #projectRADec(ra: number, dec: number, gmst: number): [number, number] | null {
    const lon = this.#normLonFn((ra - gmst) * 15);
    return this.#projection([lon, dec]);
  }

  /** Get current NEO positions + ephemeris-derived trails (projected each frame) */
  getNEOPositions(gmst: number, _T: number): NEORenderData[] {
    if (!this.#enabled || !this.isAvailable()) return [];

    const results: NEORenderData[] = [];
    const jd = this.#state.getAstroJD();

    for (const neo of this.#neos) {
      const pos = this.#interpolatePosition(neo.des, jd);
      if (!pos) continue;

      const coords = this.#projectRADec(pos.ra, pos.dec, gmst);
      if (!coords) continue;

      const [px, py] = coords;

      // Derive trail from ephemeris — past entries up to current JD, re-projected each frame
      const eph = this.#ephemerides.get(neo.des);
      const trail: TrailPoint[] = [];
      if (eph) {
        // Collect entries with jd <= current jd
        const pastEntries: EphemerisEntry[] = [];
        for (const entry of eph) {
          if (entry.jd <= jd) pastEntries.push(entry);
        }
        // Take last TRAIL_MAX_ENTRIES
        const start = Math.max(0, pastEntries.length - TRAIL_MAX_ENTRIES);
        for (let i = start; i < pastEntries.length; i++) {
          const tc = this.#projectRADec(pastEntries[i].ra, pastEntries[i].dec, gmst);
          if (tc) trail.push({ px: tc[0], py: tc[1] });
        }
      }
      // Close the trail to the head position
      trail.push({ px, py });

      results.push({ des: neo.des, px, py, dist: parseFloat(neo.dist) || 0.05, trail });
    }

    return results;
  }

  /** Trigger a fetch if enough time has passed. Call from the draw loop. */
  maybeFetch(): void {
    if (!this.#enabled || !this.isAvailable() || this.#fetching) return;

    const now = Date.now();
    if (now - this.#lastCADFetch < FETCH_INTERVAL_MS) return;

    this.#doFetch();
  }

  // ── Internal ───────────────────────────────────────────────────

  async #doFetch(): Promise<void> {
    this.#fetching = true;
    this.#lastCADFetch = Date.now(); // throttle immediately — prevent spam on failure
    const jd = this.#state.getAstroJD();
    const nowDate = new Date((jd - 2440587.5) * 86400000);

    // 1. Fetch close approaches
    try {
      const dateMin = formatCADDate(new Date(nowDate.getTime() - DATE_RANGE_DAYS * 86400000));
      const dateMax = formatCADDate(new Date(nowDate.getTime() + DATE_RANGE_DAYS * 86400000));

      const res = await fetch(`${PROXY_BASE}?endpoint=cad&date-min=${dateMin}&date-max=${dateMax}`);
      if (!res.ok) throw new Error(`CAD ${res.status}`);

      const data = await res.json();
      const fields: string[] = data.fields || [];
      const rows: string[][] = data.data || [];

      const desIdx = fields.indexOf('des');
      const cdIdx = fields.indexOf('cd');
      const distIdx = fields.indexOf('dist');
      const distMinIdx = fields.indexOf('dist_min');
      const distMaxIdx = fields.indexOf('dist_max');

      if (desIdx < 0 || distIdx < 0) {
        if (!this.#warned.has('cad-fields')) {
          console.warn('[NEO] CAD response missing expected fields:', fields);
          this.#warned.add('cad-fields');
        }
        this.#fetching = false;
        return;
      }

      // Sort by distance, take top N
      this.#neos = rows
        .map((e: string[]) => ({
          des: e[desIdx] || '',
          cd: cdIdx >= 0 ? (e[cdIdx] || '') : '',
          dist: e[distIdx] || '999',
          dist_min: distMinIdx >= 0 ? (e[distMinIdx] || '') : '',
          dist_max: distMaxIdx >= 0 ? (e[distMaxIdx] || '') : '',
        }))
        .filter(n => n.des)
        .sort((a: NEODatum, b: NEODatum) => parseFloat(a.dist) - parseFloat(b.dist))
        .slice(0, MAX_NEOS);

    } catch (err) {
      if (!this.#warned.has('cad')) {
        console.warn('[NEO] CAD fetch failed:', (err as Error).message);
        this.#warned.add('cad');
      }
      this.#fetching = false;
      return;
    }

    // 2. Fetch ephemerides for all NEOs (parallel)
    const ephStart = jd - EPH_WINDOW_HOURS / 48;
    const ephStop = jd + EPH_WINDOW_HOURS / 48;
    const nowMs = Date.now();

    const fetchTasks = this.#neos
      .filter(neo => {
        const lastEph = this.#lastEphFetches.get(neo.des) || 0;
        return nowMs - lastEph >= FETCH_INTERVAL_MS;
      })
      .map(neo => this.#fetchEphemeris(neo.des, ephStart, ephStop));

    await Promise.allSettled(fetchTasks);
    this.#fetching = false;

    if (this.#neos.length > 0) {
      this.#state.needsRedraw = true;
    }
  }

  /** Fetch ephemeris for a single NEO designation */
  async #fetchEphemeris(des: string, ephStart: number, ephStop: number): Promise<void> {
    try {
      const res = await fetch(
        `${PROXY_BASE}?endpoint=eph&des=${encodeURIComponent(des)}&start=JD${ephStart.toFixed(6)}&stop=JD${ephStop.toFixed(6)}&step=${EPH_STEP_MINUTES}m`,
      );
      if (!res.ok) throw new Error(`Horizons ${res.status}`);

      const text = await res.text();
      // Check for Horizons error messages (in both JSON and plain-text responses)
      if (text.includes('DATA ERROR') || text.includes('No ephemeris') || text.includes('NO MATCH')) {
        throw new Error('Horizons input error');
      }
      const entries = this.#parseHorizonsResponse(text);
      if (entries.length > 0) {
        this.#ephemerides.set(des, entries);
        this.#lastEphFetches.set(des, Date.now());
      }
    } catch (err) {
      if (!this.#warned.has(`eph:${des}`)) {
        console.warn(`[NEO] Ephemeris fetch failed for ${des}:`, (err as Error).message);
        this.#warned.add(`eph:${des}`);
      }
    }
  }

  /** Parse Horizons text response into ephemeris entries */
  #parseHorizonsResponse(text: string): EphemerisEntry[] {
    // Try JSON format first
    try {
      const json = JSON.parse(text);
      if (json.error) return []; // Horizons returned an error
      if (json.result) {
        return this.#parseHorizonsText(json.result);
      }
    } catch {
      // Not JSON, try plain text
    }

    return this.#parseHorizonsText(text);
  }

  #parseHorizonsText(text: string): EphemerisEntry[] {
    const entries: EphemerisEntry[] = [];
    const lines = text.split('\n');
    let inData = false;

    // Month abbreviations used by Horizons
    const MONTH_MAP: Record<string, number> = {
      Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
      Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11,
    };

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith('$$SOE') || trimmed.startsWith('SOE')) { inData = true; continue; }
      if (trimmed.startsWith('$$EOE') || trimmed.startsWith('EOE')) { inData = false; continue; }
      if (!inData) continue;

      // With ANG_FORMAT=DEG, output is:
      // "YYYY-Mon-DD HH:MM:SS.fff  DDD.DDDDD  +DD.DDDDD"
      // RA in decimal degrees, Dec in decimal degrees
      const match = trimmed.match(
        /^\s*(\d{4})-(\w{3})-(\d{2})\s+(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?\s+([+-]?\d+\.\d+)\s+([+-]?\d+\.\d+)/,
      );
      if (match) {
        const year = parseInt(match[1], 10);
        const month = MONTH_MAP[match[2]];
        const day = parseInt(match[3], 10);
        const hour = parseInt(match[4], 10);
        const minute = parseInt(match[5], 10);
        const second = match[6] ? parseFloat(match[6]) : 0;
        const raDeg = parseFloat(match[7]);   // degrees
        const decDeg = parseFloat(match[8]);    // degrees

        if (isNaN(month)) continue;

        // Convert to JD
        const d = new Date(Date.UTC(year, month, day, hour, minute, second));
        if (!isNaN(d.getTime())) {
          const jd = d.getTime() / 86400000 + 2440587.5;
          // Convert RA from degrees to hours
          const raHours = ((raDeg / 15) % 24 + 24) % 24;
          entries.push({ jd, ra: raHours, dec: decDeg });
        }
      }
    }

    return entries;
  }

  /** Linear interpolation of RA/Dec between two ephemeris entries */
  #interpolatePosition(des: string, jd: number): { ra: number; dec: number } | null {
    const eph = this.#ephemerides.get(des);
    if (!eph || eph.length < 2) return null;

    // Binary search for bracketing entries
    let lo = 0;
    let hi = eph.length - 1;

    if (jd <= eph[lo].jd) return { ra: eph[lo].ra, dec: eph[lo].dec };
    if (jd >= eph[hi].jd) return { ra: eph[hi].ra, dec: eph[hi].dec };

    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (jd < eph[mid].jd) hi = mid;
      else lo = mid;
    }

    const a = eph[lo];
    const b = eph[hi];
    const t = (jd - a.jd) / (b.jd - a.jd);

    // Handle RA wraparound
    let raDiff = b.ra - a.ra;
    if (raDiff > 12) raDiff -= 24;
    if (raDiff < -12) raDiff += 24;

    const ra = ((a.ra + t * raDiff) % 24 + 24) % 24;
    const dec = a.dec + t * (b.dec - a.dec);

    return { ra, dec };
  }
}