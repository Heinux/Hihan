#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const GRID_WIDTH = 360;
const GRID_HEIGHT = 181;
const MAGIC = 0x57494e44;
const VERSION = 1;
const HEADER_SIZE = 56;

// sense: -1 = cyclone (CCW in NH), +1 = anticyclone (CW in NH)
const VORTICES = [
  { lat: 58, lon: 330, radius: 12, vmax: 14, sense: -1 },  // Icelandic Low
  { lat: 52, lon: 175, radius: 14, vmax: 12, sense: -1 },  // Aleutian Low
  { lat: 38, lon: 15,  radius: 8,  vmax: 8,  sense: -1 },  // Mediterranean
  { lat: 15, lon: 310, radius: 6,  vmax: 12, sense: -1 },  // Tropical Atlantic
  { lat: 14, lon: 88,  radius: 7,  vmax: 14, sense: -1 },  // Bay of Bengal
  { lat: 18, lon: 135, radius: 8,  vmax: 16, sense: -1 },  // W. Pacific typhoon
  { lat: -28, lon: 340, radius: 15, vmax: 8,  sense: 1 },  // St. Helena High
  { lat: -30, lon: 75,  radius: 14, vmax: 7,  sense: 1 },  // S. Indian High
  { lat: 35, lon: 150,  radius: 12, vmax: 7,  sense: 1 },  // N. Pacific High
  { lat: 32, lon: 345,  radius: 13, vmax: 6,  sense: 1 },  // Azores High
  { lat: -28, lon: 240, radius: 14, vmax: 7,  sense: 1 },  // S. Pacific High
  { lat: -55, lon: 120, radius: 10, vmax: 12, sense: -1 }, // Southern Ocean cyclone
  { lat: -52, lon: 300, radius: 10, vmax: 11, sense: -1 }, // Southern Ocean low
];

function vortexUV(lat, lon, v) {
  const dlat = lat - v.lat;
  let dlon = lon - v.lon;
  if (dlon > 180) dlon -= 360;
  if (dlon < -180) dlon += 360;
  const cosLat = Math.cos(lat * Math.PI / 180);
  const dx = dlon * cosLat; // east-west distance (degrees at latitude)
  const dy = dlat;           // north-south distance (degrees)
  const r = Math.sqrt(dx * dx + dy * dy);
  if (r < 0.3) return { u: 0, v: 0 };
  const rMax = v.radius;
  let vt;
  if (r < rMax) {
    vt = v.vmax * (r / rMax);
  } else {
    vt = v.vmax * (rMax / r) * Math.exp(-(r - rMax) / (rMax * 2.5));
  }
  // CCW tangent: (-dy, dx)/r → u=-dy/r * vt, v=dx/r * vt
  // CW tangent:  (dy, -dx)/r → u=dy/r * vt, v=-dx/r * vt
  // Cyclone in NH: CCW rotation. In SH: CW rotation (Coriolis flips).
  // Anticyclone in NH: CW. In SH: CCW.
  // rotDir: +1 = CCW, -1 = CW
  const hemSign = lat >= 0 ? 1 : -1;
  const rotDir = -v.sense * hemSign; // cyclone(-1)*NH(+1) = +1=CCW ✓
  const tx = (-dy / r) * rotDir;     // eastward tangent component
  const ty = (dx / r) * rotDir;      // northward tangent component
  return { u: vt * tx, v: vt * ty };
}

function backgroundWind(lat, lon) {
  const latRad = lat * Math.PI / 180;
  const absLat = Math.abs(lat);
  let u, v;
  if (absLat < 30) {
    u = -5.5 * Math.cos(latRad);
    v = lat >= 0 ? -1.2 : 1.2;
  } else if (absLat < 60) {
    const t = (absLat - 30) / 30;
    u = 7 * Math.sin(Math.PI * t) * Math.cos(latRad);
    v = lat >= 0 ? (t < 0.4 ? 0.3 : -0.6) : (t < 0.4 ? -0.3 : 0.6);
  } else {
    u = -2.5 * Math.cos(latRad);
    v = lat >= 0 ? 0.4 : -0.4;
  }
  const k1 = 3, k2 = 5;
  u += 2.0 * Math.sin(k1 * lon * Math.PI / 180 + latRad * 2) * Math.cos(latRad);
  u += 1.0 * Math.cos(k2 * lon * Math.PI / 180 - latRad * 1.5) * Math.cos(latRad * 0.7);
  v += 1.2 * Math.cos(k1 * lon * Math.PI / 180 + latRad * 2) * Math.sin(latRad);
  v += 0.6 * Math.sin(k2 * lon * Math.PI / 180 - latRad * 1.5);
  if (absLat < 8) v += (lat >= 0 ? -1.2 : 1.2) * Math.cos(latRad * 11);
  return { u, v };
}

const uArr = new Float32Array(GRID_WIDTH * GRID_HEIGHT);
const vArr = new Float32Array(GRID_WIDTH * GRID_HEIGHT);

for (let row = 0; row < GRID_HEIGHT; row++) {
  const lat = 90 - row * (180 / (GRID_HEIGHT - 1));
  for (let col = 0; col < GRID_WIDTH; col++) {
    const lon = col * (360 / (GRID_WIDTH - 1));
    const idx = row * GRID_WIDTH + col;
    const bg = backgroundWind(lat, lon);
    let vu = 0, vv = 0;
    for (const vx of VORTICES) {
      const vc = vortexUV(lat, lon, vx);
      vu += vc.u; vv += vc.v;
    }
    uArr[idx] = bg.u + vu;
    vArr[idx] = bg.v + vv;
  }
}

// Verify rotation around Icelandic Low (58N, 330E) — should be CCW
const iceland = VORTICES[0];
console.log('=== Verifying Icelandic Low (CCW in NH) ===');
for (const [dlon, dlat, label] of [[5,0,'East'],[0,5,'North'],[-5,0,'West'],[0,-5,'South']]) {
  const checkLat = iceland.lat + dlat;
  const checkLon = ((iceland.lon + dlon) % 360 + 360) % 360;
  const r = Math.round((90 - checkLat) * (GRID_HEIGHT - 1) / 180);
  const c = Math.round(checkLon * (GRID_WIDTH - 1) / 360);
  const idx = r * GRID_WIDTH + c;
  console.log(`  ${label} (${checkLat}N, ${checkLon}E): u=${uArr[idx].toFixed(1)} v=${vArr[idx].toFixed(1)}`);
}
console.log('Expected CCW: N→W, E→N, S→E, W→S');

const timestamp = Date.now() / 1000;
const sourceStr = 'placeholder-climatology-v2';
const sourceBytes = Buffer.from(sourceStr, 'ascii');
const buf = Buffer.alloc(HEADER_SIZE + uArr.byteLength + vArr.byteLength);
buf.writeUInt32BE(MAGIC, 0);
buf.writeUInt16BE(VERSION, 4);
buf.writeUInt16BE(GRID_WIDTH, 6);
buf.writeUInt16BE(GRID_HEIGHT, 8);
buf.writeUInt16BE(0, 10);
buf.writeDoubleBE(timestamp, 12);
buf.writeUInt8(sourceBytes.length, 20);
sourceBytes.copy(buf, 21);
Buffer.alloc(31 - sourceBytes.length).copy(buf, 21 + sourceBytes.length);
Buffer.from(uArr.buffer).copy(buf, HEADER_SIZE);
Buffer.from(vArr.buffer).copy(buf, HEADER_SIZE + uArr.byteLength);

const dirs = [
  path.resolve(__dirname, '..', 'public', 'wind'),
  path.resolve(__dirname, '..', 'static', 'wind'),
];
const metadata = { timestamp, timestamp_iso: new Date(timestamp*1000).toISOString(), source: sourceStr, gridWidth: GRID_WIDTH, gridHeight: GRID_HEIGHT, forecastHour: 0 };
for (const outDir of dirs) {
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'gfs-current.bin'), buf);
  fs.writeFileSync(path.join(outDir, 'gfs-current.json'), JSON.stringify(metadata, null, 2));
}

console.log('U range:', Math.min(...uArr).toFixed(2), 'to', Math.max(...uArr).toFixed(2));
console.log('V range:', Math.min(...vArr).toFixed(2), 'to', Math.max(...vArr).toFixed(2));
console.log('Done!');
