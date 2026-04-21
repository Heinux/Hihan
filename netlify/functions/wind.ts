import type { Handler } from '@netlify/functions';

// ── GFS Wind Data Proxy ─────────────────────────────────────────────
// Fetches 10m wind (u,v) from multiple NOAA data sources:
//   1. NOMADS GRIB2 filter — recent data (~15-day rolling window)
//   2. AWS S3 Open Data (noaa-gfs-bdp-pds) — historical 2021+, uses
//      GRIB2 idx + HTTP Range requests for efficient partial downloads
//   3. NCEI direct HTTPS — pre-2021 archive (Grid 4, 0.5° analysis)
//   4. NCEI THREDDS OPeNDAP — last resort (currently broken, 403 errors)

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Headers': 'Content-Type',
  'Access-Control-Max-Age': '86400',
};

const MAGIC = 0x57494e44;
const VERSION = 1;
const HEADER_SIZE = 56;
const GRID_WIDTH = 360;
const GRID_HEIGHT = 181;

// ── GRIB2 Decoder ───────────────────────────────────────────────────
// Supports simple packing (template 0) and complex packing with spatial
// differencing (template 3). GFS 0.25° uses template 3.

interface GribMessage {
  discipline: number;
  category: number;
  parameter: number;
  ni: number;
  nj: number;
  latFirst: number;
  lonFirst: number;
  latLast: number;
  lonLast: number;
  di: number;
  dj: number;
  scanMode: number;
  values: Float32Array;
}

function readBits(data: Uint8Array, bitOffset: number, nBits: number): number {
  let val = 0;
  for (let i = 0; i < nBits; i++) {
    const byteIdx = Math.floor((bitOffset + i) / 8);
    const bitIdx = 7 - ((bitOffset + i) % 8);
    if (byteIdx < data.length) val = (val << 1) | ((data[byteIdx] >> bitIdx) & 1);
  }
  return val;
}

function readSigned(rawData: Uint8Array, offset: number, nBytes: number): number {
  let val: number;
  if (nBytes === 1) val = rawData[offset];
  else if (nBytes === 2) val = (rawData[offset] << 8) | rawData[offset + 1];
  else val = ((rawData[offset] << 24) | (rawData[offset + 1] << 16) | (rawData[offset + 2] << 8) | rawData[offset + 3]) >>> 0;
  if (nBytes === 1 && val > 127) val -= 256;
  if (nBytes === 2 && val > 32767) val -= 65536;
  if (nBytes === 4 && val > 2147483647) val -= 4294967296;
  return val;
}

function decodeGrib2(buf: ArrayBuffer): GribMessage[] {
  const view = new DataView(buf);
  const messages: GribMessage[] = [];
  let offset = 0;

  while (offset < buf.byteLength - 8) {
    if (view.getUint32(offset, false) !== 0x47524942) { offset++; continue; }
    const msgLen = Number(view.getBigUint64(offset + 8, false));
    if (msgLen <= 0 || offset + msgLen > buf.byteLength) break;
    try {
      const msg = decodeGribMessage(buf, offset, msgLen);
      if (msg) messages.push(msg);
    } catch { /* skip */ }
    offset += msgLen;
  }
  return messages;
}

function decodeGribMessage(buf: ArrayBuffer, msgOffset: number, msgLen: number): GribMessage | null {
  const v = new DataView(buf, msgOffset, msgLen);
  const discipline = v.getUint8(6);
  let pos = 16; // Section 1

  // Section 1
  const s1Len = v.getUint32(pos, false);
  pos += s1Len;

  // Section 2 (optional)
  if (v.getUint8(pos + 4) === 2) pos += v.getUint32(pos, false);

  // Section 3: Grid Definition (corrected offsets per WMO GRIB2 spec)
  if (v.getUint8(pos + 4) !== 3) return null;
  const s3Len = v.getUint32(pos, false);
  const gridTemplate = v.getUint16(pos + 12, false);

  let ni = 0, nj = 0, latFirst = 0, lonFirst = 0, latLast = 0, lonLast = 0, di = 0, dj = 0, scanMode = 0;
  if (gridTemplate === 0) {
    ni = v.getUint32(pos + 30, false);
    nj = v.getUint32(pos + 34, false);
    latFirst = v.getInt32(pos + 46, false) / 1e6;
    lonFirst = v.getInt32(pos + 50, false) / 1e6;
    latLast = v.getInt32(pos + 55, false) / 1e6;
    lonLast = v.getInt32(pos + 59, false) / 1e6;
    di = v.getInt32(pos + 63, false) / 1e6;
    dj = v.getInt32(pos + 67, false) / 1e6;
    scanMode = v.getUint8(pos + 71);
  }
  pos += s3Len;

  // Section 4: Product Definition
  if (v.getUint8(pos + 4) !== 4) return null;
  const s4Len = v.getUint32(pos, false);
  const category = v.getUint8(pos + 9);
  const parameter = v.getUint8(pos + 10);
  pos += s4Len;

  // Section 5: Data Representation
  if (v.getUint8(pos + 4) !== 5) return null;
  const s5Len = v.getUint32(pos, false);
  const nDataPts = v.getUint32(pos + 5, false);
  const drTemplate = v.getUint16(pos + 9, false);
  const R = v.getFloat32(pos + 11, false);
  const E = v.getInt16(pos + 15, false);
  const D = v.getInt16(pos + 17, false);
  const nBits = v.getUint8(pos + 19);

  let values: Float32Array;

  if (drTemplate === 0) {
    // Simple packing
    pos += s5Len;
    if (v.getUint8(pos + 4) !== 6) return null;
    pos += v.getUint32(pos, false); // Section 6
    if (v.getUint8(pos + 4) !== 7) return null;
    const s7Len = v.getUint32(pos, false);
    const dataStart = pos + 5;
    const dataBytes = s7Len - 5;
    const eVal = Math.pow(2, E);
    const dVal = Math.pow(10, D);
    values = new Float32Array(nDataPts);
    if (nBits === 0) {
      values.fill(R / dVal);
    } else {
      const dataView = new Uint8Array(buf, msgOffset + dataStart, dataBytes);
      let bitPos = 0;
      for (let i = 0; i < nDataPts && Math.floor(bitPos / 8) < dataBytes; i++) {
        const val = readBits(dataView, bitPos, nBits);
        values[i] = (R + val * eVal) / dVal;
        bitPos += nBits;
      }
    }
  } else if (drTemplate === 3) {
    // Complex packing with spatial differencing
    const NG = v.getUint32(pos + 31, false);
    const refGW = v.getUint8(pos + 35);
    const nBitsGW = v.getUint8(pos + 36);
    const refGL = v.getUint32(pos + 37, false);
    const glInc = v.getUint8(pos + 41);
    const lastGL = v.getUint32(pos + 42, false);
    const nBitsSL = v.getUint8(pos + 46);
    const diffOrder = v.getUint8(pos + 47);
    const nOctSD = v.getUint8(pos + 48);

    pos += s5Len;
    if (v.getUint8(pos + 4) !== 6) return null;
    pos += v.getUint32(pos, false);
    if (v.getUint8(pos + 4) !== 7) return null;
    const s7Len = v.getUint32(pos, false);
    const rawData = new Uint8Array(buf, msgOffset + pos + 5, s7Len - 5);

    // Section 7 Template 7.3: spatial diff descriptors first
    let byteIdx = 0;
    const firstValues: number[] = [];
    for (let i = 0; i < diffOrder; i++) {
      firstValues.push(readSigned(rawData, byteIdx, nOctSD));
      byteIdx += nOctSD;
    }
    // Overall minimum with Regulation 92.1.5 sign-magnitude encoding
    const totalBits = nOctSD * 8;
    const firstBit = (rawData[byteIdx] >> 7) & 1;
    let omUnsigned = 0;
    if (nOctSD === 1) omUnsigned = rawData[byteIdx];
    else if (nOctSD === 2) omUnsigned = ((rawData[byteIdx] << 8) | rawData[byteIdx + 1]) & 0xFFFF;
    else if (nOctSD === 4) omUnsigned = ((rawData[byteIdx] << 24) | (rawData[byteIdx + 1] << 16) | (rawData[byteIdx + 2] << 8) | rawData[byteIdx + 3]) >>> 0;
    const omMag = omUnsigned & ((1 << (totalBits - 1)) - 1);
    const overallMin = firstBit ? -omMag : omMag;
    byteIdx += nOctSD;

    // Group reference values (X1): NG values, nBits each
    const X1: number[] = [];
    let bitPos = byteIdx * 8;
    for (let i = 0; i < NG; i++) { X1.push(readBits(rawData, bitPos, nBits)); bitPos += nBits; }
    byteIdx = Math.ceil(bitPos / 8);

    // Group widths
    const groupWidths: number[] = [];
    bitPos = byteIdx * 8;
    for (let i = 0; i < NG; i++) { groupWidths.push(refGW + readBits(rawData, bitPos, nBitsGW)); bitPos += nBitsGW; }
    byteIdx = Math.ceil(bitPos / 8);

    // Scaled group lengths
    const scaledGL: number[] = [];
    bitPos = byteIdx * 8;
    for (let i = 0; i < NG; i++) { scaledGL.push(readBits(rawData, bitPos, nBitsSL)); bitPos += nBitsSL; }
    byteIdx = Math.ceil(bitPos / 8);

    const groupLengths: number[] = [];
    for (let i = 0; i < NG; i++) groupLengths.push(refGL + scaledGL[i] * glInc);
    groupLengths[NG - 1] = lastGL;

    // Unpack values group by group
    bitPos = byteIdx * 8;
    const unpacked: number[] = [];
    for (let g = 0; g < NG; g++) {
      const gLen = groupLengths[g];
      const gWidth = groupWidths[g];
      if (gWidth === 0) {
        for (let j = 0; j < gLen; j++) unpacked.push(X1[g]);
      } else {
        for (let j = 0; j < gLen; j++) {
          unpacked.push(X1[g] + readBits(rawData, bitPos, gWidth));
          bitPos += gWidth;
        }
      }
    }

    // Add overall minimum to all differenced values
    for (let i = 0; i < unpacked.length; i++) unpacked[i] += overallMin;

    // Spatial differencing reconstruction
    values = new Float32Array(nDataPts);
    if (diffOrder === 2) {
      const h1 = firstValues[0];
      const h2 = firstValues[1];
      const g = new Float64Array(nDataPts);
      g[0] = h1;
      g[1] = h2 - h1;
      for (let i = 2; i < nDataPts; i++) g[i] = unpacked[i] + g[i - 1];
      values[0] = h1;
      for (let i = 1; i < nDataPts; i++) values[i] = g[i] + values[i - 1];
    } else if (diffOrder === 1) {
      const h1 = firstValues[0];
      values[0] = h1;
      for (let i = 1; i < nDataPts; i++) values[i] = unpacked[i] + values[i - 1];
    } else {
      for (let i = 0; i < nDataPts; i++) values[i] = unpacked[i];
    }

    // Decompress: Y = (R + P * 2^E) / 10^D
    const eVal = Math.pow(2, E);
    const dVal = Math.pow(10, D);
    for (let i = 0; i < nDataPts; i++) values[i] = (R + values[i] * eVal) / dVal;
  } else {
    return null; // unsupported packing
  }

  return { discipline, category, parameter, ni, nj, latFirst, lonFirst, latLast, lonLast, di, dj, scanMode, values };
}

// ── Find UGRD and VGRD messages ─────────────────────────────────────
// GFS Product Discipline 0 (Meteorological), Category 2 (Momentum)
// UGRD=2, VGRD=3

function findWindMessages(messages: GribMessage[]): { u: GribMessage; v: GribMessage } | null {
  let uMsg: GribMessage | null = null;
  let vMsg: GribMessage | null = null;

  for (const m of messages) {
    if (m.discipline === 0 && m.category === 2) {
      if (m.parameter === 2) uMsg = m;
      else if (m.parameter === 3) vMsg = m;
    }
  }

  return uMsg && vMsg ? { u: uMsg, v: vMsg } : null;
}

function resampleTo1Deg(msg: GribMessage): Float32Array {
  const out = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
  const ni = msg.ni;
  const nj = msg.nj;
  const src = msg.values;

  for (let row = 0; row < GRID_HEIGHT; row++) {
    const lat = 90 - row;
    for (let col = 0; col < GRID_WIDTH; col++) {
      const lon = col;
      const srcRow = Math.round((msg.latFirst - lat) / msg.dj);
      const srcCol = Math.round((lon - msg.lonFirst) / msg.di);
      const clampedRow = Math.max(0, Math.min(nj - 1, srcRow));
      const clampedCol = ((srcCol % ni) + ni) % ni;
      out[row * GRID_WIDTH + col] = src[clampedRow * ni + clampedCol] || 0;
    }
  }

  return out;
}

// ── Encode binary ───────────────────────────────────────────────────
function encodeBinary(u: Float32Array, v: Float32Array, timestamp: number, source: string): Buffer {
  const sourceBytes = Buffer.from(source, 'ascii').slice(0, 31);
  const buf = Buffer.alloc(HEADER_SIZE + u.byteLength + v.byteLength);
  buf.writeUInt32BE(MAGIC, 0);
  buf.writeUInt16BE(VERSION, 4);
  buf.writeUInt16BE(GRID_WIDTH, 6);
  buf.writeUInt16BE(GRID_HEIGHT, 8);
  buf.writeUInt16BE(0, 10);
  buf.writeDoubleBE(timestamp, 12);
  buf.writeUInt8(sourceBytes.length, 20);
  sourceBytes.copy(buf, 21);
  Buffer.from(u.buffer, u.byteOffset, u.byteLength).copy(buf, HEADER_SIZE);
  Buffer.from(v.buffer, v.byteOffset, v.byteLength).copy(buf, HEADER_SIZE + u.byteLength);
  return buf;
}

// ── Find best GFS run and forecast hour for a target time ──────────
// GFS runs at 00z, 06z, 12z, 18z. Each produces forecasts at 3h intervals.
// Data is typically available ~4h after the run starts.
// Returns { runDate, cycle, fhour } where runDate is YYYYMMDD, cycle is HH, fhour is forecast hours.

function findBestRun(targetDate: string, targetHour?: string): { runDate: string; cycle: string; fhour: number } | null {
  const CYCLES = [0, 6, 12, 18];
  const DELAY_HOURS = 4; // data availability lag

  if (targetDate === 'latest') {
    const now = new Date();
    return findRunForTime(now, CYCLES, DELAY_HOURS);
  }

  const hour = targetHour ? parseInt(targetHour, 10) : 0;
  if (isNaN(hour)) return findRunForTime(new Date(), CYCLES, DELAY_HOURS);

  const target = new Date(`${targetDate.slice(0, 4)}-${targetDate.slice(4, 6)}-${targetDate.slice(6, 8)}T${String(hour).padStart(2, '0')}:00:00Z`);
  if (isNaN(target.getTime())) return findRunForTime(new Date(), CYCLES, DELAY_HOURS);

  return findRunForTime(target, CYCLES, DELAY_HOURS);
}

function findRunForTime(
  target: Date,
  cycles: number[],
  delayHours: number,
): { runDate: string; cycle: string; fhour: number } | null {
  const now = new Date();
  const targetEpoch = target.getTime();

  const latestRun = findLatestAvailableRun(cycles, delayHours);
  const latestDate = `${latestRun.runDate.slice(0, 4)}-${latestRun.runDate.slice(4, 6)}-${latestRun.runDate.slice(6, 8)}`;
  const latestRunTime = new Date(`${latestDate}T${latestRun.cycle.padStart(2, '0')}:00:00Z`);
  const fhourFromLatest = Math.round((targetEpoch - latestRunTime.getTime()) / 3600000);

  if (fhourFromLatest >= 0) {
    if (fhourFromLatest > 384) return null;
    const fhour3 = Math.round(fhourFromLatest / 3) * 3;
    return { ...latestRun, fhour: fhour3 };
  }

  const targetDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth(), target.getUTCDate()));

  for (let dayOffset = 0; dayOffset <= 2; dayOffset++) {
    const day = new Date(targetDay.getTime() - dayOffset * 86400000);
    const dateStr = day.toISOString().slice(0, 10).replace(/-/g, '');

    const cycleOrder = [...cycles].reverse();
    for (const cyc of cycleOrder) {
      const runTime = new Date(day.getTime() + cyc * 3600000);
      const fhour = Math.round((targetEpoch - runTime.getTime()) / 3600000);

      if (fhour < 0) continue;
      if (fhour > 384) continue;
      const fhour3 = Math.round(fhour / 3) * 3;

      const dataAvailTime = runTime.getTime() + delayHours * 3600000;
      if (dataAvailTime > now.getTime()) continue;

      return { runDate: dateStr, cycle: String(cyc).padStart(2, '0'), fhour: fhour3 };
    }
  }

  return latestRun;
}

function findLatestAvailableRun(cycles: number[], delayHours: number): { runDate: string; cycle: string; fhour: number } {
  const now = new Date();
  const hour = now.getUTCHours();
  let latestCycle = hour >= delayHours ? Math.floor((hour - delayHours) / 6) * 6 : 18;
  const d = hour >= delayHours ? now : new Date(now.getTime() - 86400000);
  return {
    runDate: d.toISOString().slice(0, 10).replace(/-/g, ''),
    cycle: String(latestCycle).padStart(2, '0'),
    fhour: 0,
  };
}

// ── AWS S3 GFS Data Access ──────────────────────────────────────────
// AWS Open Data bucket noaa-gfs-bdp-pds has full GFS 0.25° data from 2021-01-01.
// Uses GRIB2 .idx index files for efficient partial downloads via HTTP range requests,
// fetching only the UGRD/VGRD messages at 10m (~2-4MB total vs ~500MB full file).

const AWS_S3_BASE = 'https://noaa-gfs-bdp-pds.s3.amazonaws.com';
const AWS_MIN_DATE = '20210101';
// GFS v16.3.0 (2021-03-23) restructured paths to include /atmos/
const AWS_PATH_CHANGE_DATE = '20210323';

function buildAwsGfsBaseUrl(dateStr: string, cycle: string): string {
  if (dateStr >= AWS_PATH_CHANGE_DATE) {
    return `${AWS_S3_BASE}/gfs.${dateStr}/${cycle}/atmos/gfs.t${cycle}z.pgrb2.0p25.f000`;
  }
  return `${AWS_S3_BASE}/gfs.${dateStr}/${cycle}/gfs.t${cycle}z.pgrb2.0p25.f000`;
}

interface IdxEntry {
  byteStart: number;
  byteEnd: number;
  variable: string;
  level: string;
}

function parseGribIdx(text: string): IdxEntry[] {
  const entries: IdxEntry[] = [];
  const lines = text.split('\n').filter(l => l.trim());

  // First pass: extract byte offsets and line content
  const parsed: { byteStart: number; lineIdx: number }[] = [];
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(':');
    if (parts.length < 4) continue;
    const byteStart = parseInt(parts[1], 10);
    if (isNaN(byteStart) || byteStart < 0) continue;
    parsed.push({ byteStart, lineIdx: i });
  }

  // Build entries with byte ranges computed from consecutive offsets
  for (let i = 0; i < parsed.length; i++) {
    const { byteStart, lineIdx } = parsed[i];
    const parts = lines[lineIdx].split(':');

    let byteEnd: number;
    if (i + 1 < parsed.length) {
      byteEnd = parsed[i + 1].byteStart;
    } else {
      byteEnd = byteStart + 5_000_000; // 5MB upper bound for last message
    }

    let variable = '';
    let level = '';
    for (const part of parts) {
      if (part === 'UGRD' || part === 'VGRD') variable = part;
      if (part.includes('m above ground')) level = part;
    }

    entries.push({ byteStart, byteEnd, variable, level });
  }

  return entries;
}

async function fetchAwsWind(dateStr: string, utcHour: number): Promise<{
  binary: Buffer;
  source: string;
} | null> {
  if (dateStr < AWS_MIN_DATE) return null;

  const cycle = String(Math.floor(utcHour / 6) * 6).padStart(2, '0');
  const baseUrl = buildAwsGfsBaseUrl(dateStr, cycle);
  const idxUrl = baseUrl + '.idx';

  console.log(`[wind] Trying AWS S3: ${idxUrl.slice(0, 100)}...`);

  // 1. Fetch the idx file
  let idxText: string;
  try {
    const idxRes = await fetch(idxUrl, {
      headers: { 'User-Agent': 'Hihan-WindFetcher/1.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!idxRes.ok) {
      console.log(`[wind] AWS S3 idx returned ${idxRes.status}`);
      return null;
    }
    idxText = await idxRes.text();
  } catch (err) {
    console.log(`[wind] AWS S3 idx failed: ${(err as Error).message}`);
    return null;
  }

  // 2. Parse idx to find UGRD/VGRD at 10m byte ranges
  const entries = parseGribIdx(idxText);
  const uEntry = entries.find(e => e.variable === 'UGRD' && e.level.includes('10 m above ground'));
  const vEntry = entries.find(e => e.variable === 'VGRD' && e.level.includes('10 m above ground'));

  if (!uEntry || !vEntry) {
    console.log(`[wind] AWS S3: no 10m wind in idx (UGRD=${uEntry ? 'found' : 'missing'}, VGRD=${vEntry ? 'found' : 'missing'})`);
    return null;
  }

  // 3. Merge overlapping/adjacent ranges for efficiency
  const ranges = [
    { start: uEntry.byteStart, end: uEntry.byteEnd - 1 },
    { start: vEntry.byteStart, end: vEntry.byteEnd - 1 },
  ].sort((a, b) => a.start - b.start);

  const mergedRanges = [{ start: ranges[0].start, end: ranges[0].end }];
  for (let i = 1; i < ranges.length; i++) {
    const last = mergedRanges[mergedRanges.length - 1];
    if (ranges[i].start <= last.end + 1) {
      last.end = Math.max(last.end, ranges[i].end);
    } else {
      mergedRanges.push({ start: ranges[i].start, end: ranges[i].end });
    }
  }

  // 4. Download via HTTP Range requests
  const chunks: Uint8Array[] = [];
  for (const range of mergedRanges) {
    const rangeHeader = `bytes=${range.start}-${range.end}`;
    console.log(`[wind] AWS S3 range: ${rangeHeader}`);

    try {
      const res = await fetch(baseUrl, {
        headers: {
          'User-Agent': 'Hihan-WindFetcher/1.0',
          'Range': rangeHeader,
        },
        signal: AbortSignal.timeout(30000),
      });

      if (res.status !== 206 && res.status !== 200) {
        console.log(`[wind] AWS S3 range returned ${res.status}`);
        return null;
      }

      const buf = await res.arrayBuffer();
      chunks.push(new Uint8Array(buf));
    } catch (err) {
      console.log(`[wind] AWS S3 range failed: ${(err as Error).message}`);
      return null;
    }
  }

  // Concatenate chunks
  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const gribBuf = new Uint8Array(totalLen);
  let offset = 0;
  for (const chunk of chunks) {
    gribBuf.set(chunk, offset);
    offset += chunk.length;
  }

  // 5. Decode GRIB2
  const messages = decodeGrib2(gribBuf.buffer);
  const wind = findWindMessages(messages);

  if (!wind) {
    console.log(`[wind] AWS S3: no UGRD/VGRD at 10m (${messages.length} messages decoded)`);
    return null;
  }

  const u = resampleTo1Deg(wind.u);
  const v = resampleTo1Deg(wind.v);

  const timestamp = Date.now() / 1000;
  const source = `aws-gfs0p25-${dateStr}-${cycle}z-f000`;
  const binary = encodeBinary(u, v, timestamp, source);

  return { binary, source };
}

// ── NCEI Direct HTTPS Access ────────────────────────────────────────
// For pre-2021 dates, try NCEI's direct HTTPS download of Grid 4 (0.5°)
// analysis GRIB2 files. Larger than OPeNDAP subsets but the only remaining
// path for 2004-2020 data without authentication.

const NCEI_HTTPS_BASE = 'https://www.ncei.noaa.gov/data/global-forecast-system/access/grid-004-0.5-degree/analysis';
const NCEI_DIRECT_MAX_SIZE = 50_000_000; // 50MB max

async function fetchNceiDirectWind(dateStr: string, utcHour: number): Promise<{
  binary: Buffer;
  source: string;
} | null> {
  const year = dateStr.slice(0, 4);
  const cycleHHMM = String(Math.floor(utcHour / 6) * 6 * 100).padStart(4, '0');
  const url = `${NCEI_HTTPS_BASE}/${year}/${dateStr}/gfsanl_4_${dateStr}_${cycleHHMM}_000.grb2`;

  console.log(`[wind] Trying NCEI direct: ${url.slice(0, 100)}...`);

  try {
    // HEAD request to check availability and size
    const headRes = await fetch(url, {
      method: 'HEAD',
      headers: { 'User-Agent': 'Hihan-WindFetcher/1.0' },
      signal: AbortSignal.timeout(10000),
    });

    if (!headRes.ok) {
      console.log(`[wind] NCEI direct returned ${headRes.status}`);
      return null;
    }

    const contentLength = parseInt(headRes.headers.get('Content-Length') || '0', 10);
    if (contentLength > NCEI_DIRECT_MAX_SIZE) {
      console.log(`[wind] NCEI direct file too large: ${contentLength} bytes`);
      return null;
    }

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Hihan-WindFetcher/1.0' },
      signal: AbortSignal.timeout(30000),
    });

    if (!res.ok) return null;

    const buf = await res.arrayBuffer();
    const messages = decodeGrib2(buf);
    const wind = findWindMessages(messages);

    if (!wind) {
      console.log(`[wind] NCEI direct: no UGRD/VGRD at 10m (${messages.length} messages)`);
      return null;
    }

    const u = resampleTo1Deg(wind.u);
    const v = resampleTo1Deg(wind.v);

    const cycle = String(Math.floor(utcHour / 6) * 6).padStart(2, '0');
    const source = `ncei-gfs4-${dateStr}-${cycle}z`;
    const timestamp = Date.now() / 1000;
    const binary = encodeBinary(u, v, timestamp, source);

    return { binary, source };
  } catch (err) {
    console.log(`[wind] NCEI direct failed: ${(err as Error).message}`);
    return null;
  }
}

// ── NCEI THREDDS OPeNDAP (last resort, currently broken) ───────────
// NCEI's backend migrated to S3; THREDDS proxy returns 403/500.
// Kept as fallback in case service is restored.

const NCEI_BASE = 'https://www.ncei.noaa.gov/thredds/dodsC';
const NCEI_MAX_DATE = '20231130';

const NCEI_CATALOGS = [
  { suffix: '', minDate: '20200501' },
  { suffix: '-old', minDate: '20040301' },
];

function buildNceiOpendapUrl(dateStr: string, hour: number, catalogSuffix: string): string {
  const cycleHHMM = String(Math.floor(hour / 6) * 6 * 100).padStart(4, '0');
  const catalogPath = `model-gfs-g4-anl-files${catalogSuffix}`;
  return (
    `${NCEI_BASE}/${catalogPath}/${dateStr.slice(0, 6)}/${dateStr}` +
    `/gfsanl_4_${dateStr}_${cycleHHMM}_000.grb2.ascii` +
    `?u-component_of_wind_height_above_ground[0][0][0:2:360][0:2:719]` +
    `&v-component_of_wind_height_above_ground[0][0][0:2:360][0:2:719]`
  );
}

interface ParsedOpendapWind {
  u: Float32Array;
  v: Float32Array;
}

function parseOpendapAscii(text: string): ParsedOpendapWind | null {
  const uArr = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
  const vArr = new Float32Array(GRID_WIDTH * GRID_HEIGHT);

  const uMarker = 'u-component_of_wind_height_above_ground.u-component_of_wind_height_above_ground';
  const vMarker = 'v-component_of_wind_height_above_ground.v-component_of_wind_height_above_ground';

  const uStart = text.indexOf(uMarker);
  const vStart = text.indexOf(vMarker);
  if (uStart < 0 || vStart < 0) return null;

  const uSection = text.slice(uStart, vStart);
  const vSection = text.slice(vStart);

  parseVariableSection(uSection, uArr);
  parseVariableSection(vSection, vArr);

  return { u: uArr, v: vArr };
}

function parseVariableSection(section: string, out: Float32Array): void {
  const lines = section.split('\n');
  for (const line of lines) {
    const match = line.match(/^\[0\]\[0\]\[(\d+)\],\s*(.*)/);
    if (!match) continue;
    const latIdx = parseInt(match[1], 10);
    if (latIdx < 0 || latIdx >= GRID_HEIGHT) continue;
    const values = match[2].split(',').map(s => parseFloat(s.trim()));
    for (let i = 0; i < values.length && i < GRID_WIDTH; i++) {
      if (isFinite(values[i])) {
        out[latIdx * GRID_WIDTH + i] = values[i];
      }
    }
  }
}

async function fetchNceiWind(dateStr: string, utcHour: number): Promise<{
  binary: Buffer;
  source: string;
} | null> {
  if (dateStr > NCEI_MAX_DATE) return null;

  const snappedHour = Math.floor(utcHour / 6) * 6;

  for (const catalog of NCEI_CATALOGS) {
    if (dateStr < catalog.minDate) continue;

    const url = buildNceiOpendapUrl(dateStr, snappedHour, catalog.suffix);
    console.log(`[wind] Trying NCEI OPeNDAP: ${url.slice(0, 100)}...`);

    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Hihan-WindFetcher/1.0' },
        signal: AbortSignal.timeout(10000),
      });

      if (!res.ok) {
        console.log(`[wind] NCEI OPeNDAP ${catalog.suffix || 'current'} returned ${res.status}`);
        continue;
      }

      const text = await res.text();
      const parsed = parseOpendapAscii(text);
      if (!parsed) {
        console.log(`[wind] NCEI OPeNDAP parse failed for ${catalog.suffix || 'current'}`);
        continue;
      }

      const timestamp = Date.now() / 1000;
      const cycle = String(snappedHour).padStart(2, '0');
      const source = `ncei-gfs4-${dateStr}-${cycle}z`;
      const binary = encodeBinary(parsed.u, parsed.v, timestamp, source);

      return { binary, source };
    } catch (err) {
      console.log(`[wind] NCEI OPeNDAP ${catalog.suffix || 'current'} failed: ${(err as Error).message}`);
      continue;
    }
  }

  return null;
}

// ── Historical wind data dispatcher ─────────────────────────────────
// Tries sources in priority order based on date range.

function isHistoricalDate(dateStr: string, hourStr?: string): boolean {
  if (dateStr === 'latest') return false;
  const now = new Date();
  const cutoff = new Date(now.getTime() - 15 * 86400000);
  const h = hourStr ? parseInt(hourStr, 10) : 0;
  const target = new Date(
    `${dateStr.slice(0, 4)}-${dateStr.slice(4, 6)}-${dateStr.slice(6, 8)}T${String(h).padStart(2, '0')}:00:00Z`
  );
  return !isNaN(target.getTime()) && target.getTime() < cutoff.getTime();
}

async function fetchHistoricalWind(dateStr: string, utcHour: number): Promise<{
  binary: Buffer;
  source: string;
} | null> {
  // 2021+ dates: AWS S3 is most reliable
  if (dateStr >= AWS_MIN_DATE) {
    const result = await fetchAwsWind(dateStr, utcHour);
    if (result) return result;
  }

  // Pre-2021: try NCEI direct HTTPS (Grid 4, 0.5°)
  if (dateStr < AWS_MIN_DATE) {
    const result = await fetchNceiDirectWind(dateStr, utcHour);
    if (result) return result;
  }

  // Last resort: NCEI THREDDS OPeNDAP (currently broken, 403 errors)
  if (dateStr <= NCEI_MAX_DATE) {
    const result = await fetchNceiWind(dateStr, utcHour);
    if (result) return result;
  }

  return null;
}

// ── Handler ──────────────────────────────────────────────────────────
const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const params = event.queryStringParameters || {};
  const targetDate = params.date || 'latest';
  const targetHour = params.hour;
  const hour = targetHour ? parseInt(targetHour, 10) : 0;
  const safeHour = isNaN(hour) ? 0 : hour;

  // Historical date: try AWS S3 (2021+), NCEI direct (pre-2021), NCEI OPeNDAP (last resort)
  if (isHistoricalDate(targetDate, targetHour)) {
    const result = await fetchHistoricalWind(targetDate, safeHour);
    if (result) {
      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=86400, stale-while-revalidate=604800',
          'X-Wind-Source': result.source,
        },
        body: result.binary.toString('base64'),
        isBase64Encoded: true,
      };
    }

    const msg = targetDate >= AWS_MIN_DATE
      ? 'GFS data temporarily unavailable for this date'
      : 'Historical wind data before 2021 requires NCEI archive access (currently unavailable)';
    return {
      statusCode: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: msg }),
    };
  }

  // Recent/future date: use NOMADS GRIB2 filter
  const runInfo = findBestRun(targetDate, targetHour);
  if (!runInfo) {
    return {
      statusCode: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'GFS forecast not available for this date (beyond 384h range)' }),
    };
  }
  const { runDate, cycle, fhour } = runInfo;

  // GRIB2 filter URL — 0.25° resolution, UGRD+VGRD at 10m
  const gribUrl =
    `https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl` +
    `?file=gfs.t${cycle}z.pgrb2.0p25.f${String(fhour).padStart(3, '0')}` +
    `&lev_10_m_above_ground=on` +
    `&var_UGRD=on&var_VGRD=on` +
    `&leftlon=0&rightlon=359.75&toplat=90&bottomlat=-90` +
    `&dir=%2Fgfs.${runDate}%2F${cycle}%2Fatmos`;

  try {
    const res = await fetch(gribUrl, {
      headers: { 'User-Agent': 'Hihan-WindFetcher/1.0' },
      signal: AbortSignal.timeout(25000),
    });

    if (!res.ok) {
      throw new Error(`NOMADS returned ${res.status}`);
    }

    const buf = await res.arrayBuffer();
    const messages = decodeGrib2(buf);
    const wind = findWindMessages(messages);

    if (!wind) {
      throw new Error(`No UGRD/VGRD found (${messages.length} messages decoded)`);
    }

    const u = resampleTo1Deg(wind.u);
    const v = resampleTo1Deg(wind.v);

    const timestamp = Date.now() / 1000;
    const source = `gfs-${runDate}-${cycle}z-f${String(fhour).padStart(3, '0')}`;
    const binary = encodeBinary(u, v, timestamp, source);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/octet-stream',
        'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
        'X-Wind-Source': source,
      },
      body: binary.toString('base64'),
      isBase64Encoded: true,
    };
  } catch (err) {
    // NOMADS failed — try historical sources as fallback
    const result = await fetchHistoricalWind(
      targetDate === 'latest' ? new Date().toISOString().slice(0, 10).replace(/-/g, '') : targetDate,
      safeHour,
    );
    if (result) {
      return {
        statusCode: 200,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/octet-stream',
          'Cache-Control': 'public, max-age=3600, stale-while-revalidate=86400',
          'X-Wind-Source': result.source,
        },
        body: result.binary.toString('base64'),
        isBase64Encoded: true,
      };
    }

    console.error(`[wind] All sources failed: ${(err as Error).message}`);
    return {
      statusCode: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `GFS unavailable: ${(err as Error).message}` }),
    };
  }
};

export { handler };