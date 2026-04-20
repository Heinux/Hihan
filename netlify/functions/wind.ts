import type { Handler } from '@netlify/functions';

// ── GFS Wind Data Proxy ─────────────────────────────────────────────
// Fetches 10m wind (u,v) from NOAA NOMADS GRIB2 filter service,
// decodes the grid data, re-encodes as the app's binary format.
// Falls back gracefully if NOMADS is unavailable.

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
      // g = first-differenced field: g[0]=f[0]=h1, g[1]=f[1]-f[0]=h2-h1
      const g = new Float64Array(nDataPts);
      g[0] = h1;
      g[1] = h2 - h1;
      for (let i = 2; i < nDataPts; i++) g[i] = unpacked[i] + g[i - 1];
      // f = original field: f[0]=g[0], f[i]=g[i]+f[i-1]
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
    // Use current UTC time, find most recent available cycle
    const now = new Date();
    return findRunForTime(now, CYCLES, DELAY_HOURS);
  }

  // Parse target date + hour into a Date
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

  // Find the latest available run — used for future targets and as fallback
  const latestRun = findLatestAvailableRun(cycles, delayHours);
  const latestDate = `${latestRun.runDate.slice(0, 4)}-${latestRun.runDate.slice(4, 6)}-${latestRun.runDate.slice(6, 8)}`;
  const latestRunTime = new Date(`${latestDate}T${latestRun.cycle.padStart(2, '0')}:00:00Z`);
  const fhourFromLatest = Math.round((targetEpoch - latestRunTime.getTime()) / 3600000);

  // For future targets: use the latest available run if within forecast range
  if (fhourFromLatest >= 0) {
    if (fhourFromLatest > 384) return null; // too far ahead for any forecast
    const fhour3 = Math.round(fhourFromLatest / 3) * 3;
    return { ...latestRun, fhour: fhour3 };
  }

  // For past targets: find a run near the target time
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

      // Verify this run should be available (run + delay <= now)
      const dataAvailTime = runTime.getTime() + delayHours * 3600000;
      if (dataAvailTime > now.getTime()) continue;

      return { runDate: dateStr, cycle: String(cyc).padStart(2, '0'), fhour: fhour3 };
    }
  }

  // Fallback: use latest available run
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

// ── Handler ──────────────────────────────────────────────────────────
const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS_HEADERS, body: '' };
  }

  const params = event.queryStringParameters || {};
  const targetDate = params.date || 'latest';
  const targetHour = params.hour; // UTC hour (0-23)
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
    console.error(`[wind] GRIB2 fetch/decode failed: ${(err as Error).message}`);
    return {
      statusCode: 502,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: `GFS unavailable: ${(err as Error).message}` }),
    };
  }
};

export { handler };