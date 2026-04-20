import { ENOCH_YEAR_DAYS, ENOCH_MONTHS, ENOCH_OUT_OF_TIME_START } from '@/core/constants';
import { getTarenaDay } from '@/core/formatters';
import { getSeasonsForYear } from '@/features/seasons';
import { dateToJD, getYearFromJD, jdToCalendar, formatAstroYear, getTzOffsetMinutes } from '@/core/time';
import { JULIAN_UNIX_EPOCH, MS_PER_DAY, JS_DATE_MAX_MS, MINUTES_PER_DAY, MONTH_NAMES_LONG_FR } from '@/core/constants';
import { computeHebrewFromJD } from '@/features/hebrew';
import { computeTahitianState } from '@/features/tahitian';
import * as Astronomy from 'astronomy-engine';


import type { CalendarSnapshot } from '@/core/types';
import type { EnochComputeDeps, EnochCallbacks, SeasonArc } from '@/core/types';
import type { AppState } from '@/core/state';

function getSeasonArcs(_hem: 'N' | 'S'): SeasonArc[] {
  const spring = { color: 'rgba(160,230,175,0.18)', stroke: 'rgba(160,230,175,0.55)' };
  const summer = { color: 'rgba(255,220,140,0.15)', stroke: 'rgba(255,210,100,0.5)' };
  const autumn = { color: 'rgba(210,175,240,0.15)', stroke: 'rgba(200,160,235,0.5)' };
  const winter = { color: 'rgba(160,205,240,0.15)', stroke: 'rgba(140,190,235,0.5)' };
  return [
    { name: 'PRINTEMPS', months: [0, 1, 2], ...spring },
    { name: '\u00C9T\u00C9', months: [3, 4, 5], ...summer },
    { name: 'AUTOMNE', months: [6, 7, 8], ...autumn },
    { name: 'HIVER', months: [9, 10, 11], ...winter },
  ];
}

function getHistoricalLabel(jd: number): string {
  const { year, month, day } = jdToCalendar(jd);
  return `${day} ${MONTH_NAMES_LONG_FR[month - 1]} ${formatAstroYear(year)}`;
}


interface DrawTextOnArcOptions {
  ctx: CanvasRenderingContext2D;
  text: string;
  cx: number;
  cy: number;
  radius: number;
  globalRot: number;
  localA1: number;
  localA2: number;
  font: string;
  color: string;
}

/** Draw text with a glow outline — replaces expensive shadowBlur on text. */
function fillTextGlow(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  glowColor: string,
  glowWidth: number = 3,
): void {
  ctx.save();
  ctx.strokeStyle = glowColor;
  ctx.lineWidth = glowWidth;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.restore();
  ctx.fillText(text, x, y);
}

function drawTextOnArc(opts: DrawTextOnArcOptions): void {
  const { ctx, text, cx, cy, radius, globalRot, localA1, localA2, font, color } = opts;
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const midA = (localA1 + localA2) / 2;
  let finalAngle = (midA + globalRot) % (Math.PI * 2);
  if (finalAngle < 0) finalAngle += Math.PI * 2;

  const shouldFlip = (finalAngle > 0 && finalAngle < Math.PI);
  const chars = shouldFlip ? [...text].reverse() : [...text];
  const totalWidth = ctx.measureText(text).width;
  const angleStep = totalWidth / radius / Math.max(1, text.length);
  let currentA = midA - (totalWidth / radius) / 2 + (angleStep / 2);

  chars.forEach((ch) => {
    const x = cx + radius * Math.cos(currentA);
    const y = cy + radius * Math.sin(currentA);
    const angle = currentA + (shouldFlip ? -Math.PI / 2 : Math.PI / 2);
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.fillText(ch, 0, 0);
    ctx.rotate(-angle);
    ctx.translate(-x, -y);
    currentA += angleStep;
  });
  ctx.restore();
}


interface EnochState {
  preciseDay: number;
  curDay: number;
  currentMonthIdx: number;
  dayInMonth: number;
  offs: number[];
  jdForLabel: number;
  offsetDays: number;
}

let _enochCache: { key: string; result: EnochState } | null = null;

/**
 * Computes the Enoch calendar state for a given state.
 *
 * @param state - State with currentJD/currentTime, enochHem, userTimezone, etc.
 * @returns EnochState with day, month, year, etc.
 */
export function computeEnochState(state: EnochComputeDeps): EnochState {
  const jd_from_date = state.currentJD !== null ? state.currentJD : dateToJD(state.currentTime);
  const sunLon = state.currentSunEclLon || 0;
  const cacheKey = `${jd_from_date}|${state.enochHem}|${sunLon.toFixed(4)}|${state.userTimezone}`;
  if (_enochCache && _enochCache.key === cacheKey) return _enochCache.result;
  let tzOffset: number;
  if (state.currentJD !== null) {
    const ms_tz = (jd_from_date - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
    if (ms_tz > -JS_DATE_MAX_MS && ms_tz < JS_DATE_MAX_MS) {
      tzOffset = getTzOffsetMinutes(new Date(ms_tz), state.userTimezone);
    } else {
      const year = getYearFromJD(jd_from_date);
      const d = new Date(Date.UTC(year, 0, 1, 12, 0, 0));
      tzOffset = getTzOffsetMinutes(d, state.userTimezone);
    }
  } else {
    const nowMs = state.currentTime.getTime();
    tzOffset = getTzOffsetMinutes(new Date(nowMs), state.userTimezone);
  }
  const offsetDays = tzOffset / MINUTES_PER_DAY;
  const jd_local = jd_from_date - offsetDays;
  const yr = getYearFromJD(jd_local);
  const startKey = (state.enochHem === 'S') ? 'autumnal' : 'vernal' as const;

  // JD day boundary is at noon (n.0), midnight is at n.5.
  // Math.floor(jd + 0.5) gives the midnight-to-midnight boundary.
  const localDayIndex = Math.floor(jd_local + 0.5);

  let eq_local_day: number | null = null;

  for (const y of [yr + 1, yr, yr - 1]) {
    const s = getSeasonsForYear(y);
    if (s && s[startKey]) {
      const candidate_utc = dateToJD(s[startKey]);
      const candidate_local = candidate_utc - offsetDays;
      const candidate_day = Math.floor(candidate_local + 0.5);
      if (candidate_day <= localDayIndex) {
        eq_local_day = candidate_day;
        break;
      }
    }
  }

  let preciseDay = 0;
  let curDay = 0;

  if (eq_local_day !== null) {
    curDay = localDayIndex - eq_local_day;
    const eq_jd_local = eq_local_day - 0.5;
    preciseDay = jd_local - eq_jd_local;
  } else {
    const sunEcl = state.currentSunEclLon || 0;
    const hemOffset = (state.enochHem === 'S') ? 180 : 0;
    const effectiveLon = ((sunEcl - hemOffset + 360) % 360);
    preciseDay = (effectiveLon / 360) * ENOCH_YEAR_DAYS;
    curDay = Math.floor(preciseDay);
  }

  let cum = 0;
  let currentMonthIdx = 0;
  let dayInMonth = 1;
  const offs = ENOCH_MONTHS.map((m, i) => {
    const o = cum;
    if (curDay >= o && curDay < o + m.days) {
      currentMonthIdx = i;
      dayInMonth = curDay - o + 1;
    }
    cum += m.days;
    return o;
  });

  const jdForLabel = jd_local;

  const result = { preciseDay, curDay, currentMonthIdx, dayInMonth, offs, jdForLabel, offsetDays };
  _enochCache = { key: cacheKey, result };
  return result;
}

interface EclipseMarker {
  angle: number;
  type: 'solar' | 'lunar';
  maxPercent: number;
  currentPercent: number;
  label: string;
}

interface CachedEclipseResult {
  dayKey: number;
  hem: string;
  tz: string;
  markers: Array<{
    eclJD: number;
    eclAngle: number;
    type: 'solar' | 'lunar';
    maxPercent: number;
    label: string;
  }>;
}

let _eclipseCache: CachedEclipseResult | null = null;

function computeEclipseMarkers(
  state: AppState,
  wheelRot: number,
  preciseDay: number,
): EclipseMarker[] {
  const markers: EclipseMarker[] = [];
  const jd = state.currentJD !== null
    ? state.currentJD
    : state.currentTime.getTime() / MS_PER_DAY + JULIAN_UNIX_EPOCH;

  const currentCurDay = Math.floor(preciseDay);
  const dayKey = Math.floor(jd);
  const hem = state.enochHem;
  const tz = state.userTimezone;

  try {
    let cached = _eclipseCache;
    if (!cached || cached.dayKey !== dayKey || cached.hem !== hem || cached.tz !== tz) {
      cached = { dayKey, hem, tz, markers: [] };
      const startJD = jd - 2;
      const endJD = jd + 2;

      for (const kind of [0, 1] as const) {
        const searchDate = new Date((startJD - JULIAN_UNIX_EPOCH) * MS_PER_DAY);
        if (isNaN(searchDate.getTime())) continue;

        const searchTime = new Astronomy.AstroTime(searchDate);
        const eclipse = kind === 0
          ? Astronomy.SearchGlobalSolarEclipse(searchTime)
          : Astronomy.SearchLunarEclipse(searchTime);

        if (!eclipse) continue;

        const eclJD = eclipse.peak.tt + 2451545.0;
        if (eclJD > endJD) continue;

        const eclipseState = computeEnochState({
          currentJD: eclJD,
          currentTime: new Date((eclJD - JULIAN_UNIX_EPOCH) * MS_PER_DAY),
          enochHem: hem,
          userTimezone: state.userTimezone
        });

        if (Math.floor(eclipseState.preciseDay) === currentCurDay) {
          const eclAngle = (eclipseState.preciseDay / ENOCH_YEAR_DAYS) * Math.PI * 2 + wheelRot;

          let maxPercent = 0;

          if (kind === 0) {
            const obsc = (eclipse as Astronomy.GlobalSolarEclipseInfo).obscuration;
            if (obsc === undefined || obsc === 0 || isNaN(obsc)) {
              maxPercent = 50;
            } else {
              maxPercent = 100;
            }
          } else {
            const lunar = eclipse as Astronomy.LunarEclipseInfo;
            const rawMag = lunar.obscuration ?? 0;
            maxPercent = Math.min(100, Math.max(0, Math.round(Math.abs(rawMag) * 100)));
          }

          const eclipseKind = kind === 0
            ? ((eclipse as Astronomy.GlobalSolarEclipseInfo).kind ?? 'total')
            : ((eclipse as Astronomy.LunarEclipseInfo).kind ?? 'penumbral');

          let eclipseStr = 'Éclipse partielle';
          if (eclipseKind === 'total') eclipseStr = 'Éclipse totale';
          if (eclipseKind === 'annular') eclipseStr = 'Éclipse annulaire';
          if (kind === 1 && eclipseKind === 'penumbral') eclipseStr = 'Éclipse pénombrale';

          cached.markers.push({
            eclJD,
            eclAngle,
            type: kind === 0 ? 'solar' : 'lunar',
            maxPercent,
            label: `${kind === 0 ? '☀' : '☽'} ${eclipseStr}`,
          });
        }
      }
      _eclipseCache = cached;
    }

    // Build final markers with per-frame currentPercent from exact jd
    for (const cm of cached.markers) {
      const diffDays = jd - cm.eclJD;
      const diffHours = Math.abs(diffDays) * 24;
      const durationHalfHours = cm.type === 'solar' ? 1.5 : 2.0;
      const dynamicRatio = Math.max(0, 1 - Math.pow(diffHours / durationHalfHours, 2));
      const currentPercent = Math.round(cm.maxPercent * dynamicRatio);

      markers.push({
        angle: cm.eclAngle,
        type: cm.type,
        maxPercent: cm.maxPercent,
        currentPercent,
        label: cm.label,
      });
    }
  } catch (e) {
    console.warn('[enoch] eclipse computation failed', e);
  }

  return markers;
}

// Offscreen canvas cache for the Enoch wheel — only redraws when state changes
let _enochOffCanvas: HTMLCanvasElement | null = null;
let _enochOffCtx: CanvasRenderingContext2D | null = null;
let _enochCacheKey = '';

export function drawEnochWheel(state: AppState, enochCtx: CanvasRenderingContext2D, showEnoch: boolean, snap?: CalendarSnapshot): void {
  const vs = state.viewScale ?? 1;
  const Wv = state.W / vs, Hv = state.H / vs;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  // Cache key: second-precision JD + hemisphere + timezone + viewport
  const jd = state.getAstroJD();
  const cacheKey = `${Math.round(jd * 86400)}|${state.enochHem}|${state.userTimezone}|${Math.round(state.zoomK * 100)}|${Math.round(state.panX)}|${Math.round(state.panY)}`;

  if (cacheKey === _enochCacheKey && _enochOffCanvas) {
    // Cache hit — blit directly
    enochCtx.setTransform(1, 0, 0, 1, 0, 0);
    enochCtx.clearRect(0, 0, enochCtx.canvas.width, enochCtx.canvas.height);
    enochCtx.drawImage(_enochOffCanvas, 0, 0);
    return;
  }

  // Ensure offscreen canvas exists
  if (!_enochOffCanvas) {
    _enochOffCanvas = document.createElement('canvas');
    _enochOffCtx = _enochOffCanvas.getContext('2d')!;
  }
  const pxW = Math.round(Wv * dpr * vs);
  const pxH = Math.round(Hv * dpr * vs);
  _enochOffCanvas.width = pxW;
  _enochOffCanvas.height = pxH;

  // Render to offscreen canvas
  const off = _enochOffCtx!;
  off.setTransform(dpr * vs, 0, 0, dpr * vs, 0, 0);
  off.clearRect(0, 0, Wv, Hv);

  if (!showEnoch) {
    _enochCacheKey = cacheKey;
    // Blit empty offscreen
    enochCtx.setTransform(1, 0, 0, 1, 0, 0);
    enochCtx.clearRect(0, 0, enochCtx.canvas.width, enochCtx.canvas.height);
    enochCtx.drawImage(_enochOffCanvas, 0, 0);
    return;
  }

  const cx = Wv / 2 + state.panX / vs;
  const cy = Hv / 2 + state.panY / vs;
  const baseR = (Math.min(Wv, Hv) / 2 / Math.PI) * Math.PI * state.zoomK;

  const r0 = baseR * 0.985;
  const r1 = r0 + baseR * 0.065;
  const r2 = r1 + baseR * 0.065;
  const TAU = Math.PI * 2;

  const { preciseDay, curDay, currentMonthIdx, dayInMonth, offs, jdForLabel, offsetDays: _offsetDays } = snap
    ? {
        preciseDay: snap.enoch.preciseDay,
        curDay: snap.enoch.curDay,
        currentMonthIdx: snap.enoch.currentMonthIdx,
        dayInMonth: snap.enoch.dayInMonth,
        offs: snap.enoch.monthOffsets,
        jdForLabel: snap.canonicalJD,
        offsetDays: 0,
      }
    : computeEnochState(state);

  const sx = state.sunScreenX ? state.sunScreenX / vs : cx;
  const sy = state.sunScreenY ? state.sunScreenY / vs : cy;
  const sunAngle = Math.atan2((sy - cy), (sx - cx));

  const dayAngleOnWheel = (preciseDay / ENOCH_YEAR_DAYS) * TAU;
  const wheelRot = sunAngle - dayAngleOnWheel;

  // ── Draw season arcs ────────────────────────────────────────────
  off.save();
  off.translate(cx, cy);
  off.rotate(wheelRot);

  getSeasonArcs(state.enochHem).forEach(season => {
    const sd = offs[season.months[0]];
    const ed = offs[season.months[season.months.length - 1]] + ENOCH_MONTHS[season.months[season.months.length - 1]].days;
    const a1 = (sd / ENOCH_YEAR_DAYS) * TAU, a2 = (ed / ENOCH_YEAR_DAYS) * TAU;
    off.beginPath(); off.arc(0, 0, r1, a1, a2); off.arc(0, 0, r0, a2, a1, true);
    off.fillStyle = season.color; off.fill();
    off.strokeStyle = season.stroke; off.stroke();
    drawTextOnArc({ ctx: off, text: season.name, cx: 0, cy: 0, radius: (r0 + r1) / 2, globalRot: wheelRot, localA1: a1, localA2: a2,
      font: `500 ${baseR * 0.024}px "DM Mono"`, color: season.stroke });
  });

  // ── Draw month arcs ─────────────────────────────────────────────
  ENOCH_MONTHS.forEach((month, i) => {
    const sd = offs[i], ed = sd + month.days;
    const a1 = (sd / ENOCH_YEAR_DAYS) * TAU, a2 = (ed / ENOCH_YEAR_DAYS) * TAU;
    const isCur = currentMonthIdx === i;
    off.beginPath(); off.arc(0, 0, r2, a1, a2); off.arc(0, 0, r1, a2, a1, true);
    if (isCur) { off.fillStyle = 'rgba(255,255,255,0.12)'; off.fill(); }
    off.strokeStyle = 'rgba(120,150,190,0.15)'; off.stroke();
    drawTextOnArc({ ctx: off, text: month.name, cx: 0, cy: 0, radius: (r1 + r2) / 2, globalRot: wheelRot, localA1: a1, localA2: a2,
      font: `300 ${baseR * 0.026}px "DM Mono"`, color: isCur ? '#fff' : 'rgba(200,220,255,0.5)' });
  });

  const hem = state.enochHem;
  const tahState = computeTahitianState(jdForLabel, hem);

  off.restore();

  // ── Calcul des éclipses ─────────────────────────────────────────
  const eclipseMarkers = computeEclipseMarkers(state, wheelRot, preciseDay);
  const solarEclipse = eclipseMarkers.find(em => em.type === 'solar');
  const lunarEclipse = eclipseMarkers.find(em => em.type === 'lunar');

  const isOutOfTime = curDay >= ENOCH_OUT_OF_TIME_START;
  const markerR = r2;

  // ── Sun marker (Toujours jaune normalement) ─────────────────────
  const mx = cx + markerR * Math.cos(sunAngle);
  const my = cy + markerR * Math.sin(sunAngle);

  // Sun glow halo (radial gradient replaces shadowBlur)
  const sunGlow = off.createRadialGradient(mx, my, 0, mx, my, 18);
  sunGlow.addColorStop(0, 'rgba(255,170,0,0.55)');
  sunGlow.addColorStop(1, 'rgba(255,170,0,0)');
  off.beginPath();
  off.arc(mx, my, 18, 0, TAU);
  off.fillStyle = sunGlow;
  off.fill();

  off.beginPath();
  off.arc(mx, my, 5, 0, TAU);
  off.fillStyle = '#ffcc00';
  off.fill();

  // ── Calcul position Lune de base ────────────────────────────────
  const moonSX = state.moonScreenX !== null ? state.moonScreenX / vs : null;
  const moonSY = state.moonScreenY !== null ? state.moonScreenY / vs : null;
  const moonAngle = (moonSX !== null && moonSY !== null)
    ? Math.atan2(moonSY - cy, moonSX - cx)
    : sunAngle + Math.PI;

  // Cacher les textes de la lune si elle est en train de passer sur le soleil
  const hideMoonLabels = solarEclipse && solarEclipse.currentPercent > 10;

  // ── Moon marker (Interpolation angulaire pour un mouvement circulaire réaliste) ──
  let drawMoonX = cx + markerR * Math.cos(moonAngle);
  let drawMoonY = cy + markerR * Math.sin(moonAngle);
  let currentVisualAngle = moonAngle;

  // Taille dynamique : 4 normalement, grandit jusqu'à 5 pendant l'éclipse solaire
  let moonRadius = 4;

  if (solarEclipse && solarEclipse.currentPercent > 0) {
    const progress = solarEclipse.currentPercent / 100;
    moonRadius = 4 + progress * 1; // De 4 à 5

    // Calcul de l'angle le plus court entre la lune et le soleil (respecte l'orientation hémisphérique)
    let angleDiff = sunAngle - moonAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    currentVisualAngle = moonAngle + angleDiff * progress;
    drawMoonX = cx + markerR * Math.cos(currentVisualAngle);
    drawMoonY = cy + markerR * Math.sin(currentVisualAngle);
  }

  off.save();
  off.beginPath();
  off.arc(drawMoonX, drawMoonY, moonRadius, 0, TAU);

  if (lunarEclipse && lunarEclipse.currentPercent > 0) {
    const shadowAngle = Math.atan2(my - drawMoonY, mx - drawMoonX);
    const intensity = lunarEclipse.currentPercent / 100;
    const gradX1 = drawMoonX - Math.cos(shadowAngle) * 5;
    const gradY1 = drawMoonY - Math.sin(shadowAngle) * 5;
    const gradX2 = drawMoonX + Math.cos(shadowAngle) * 5;
    const gradY2 = drawMoonY + Math.sin(shadowAngle) * 5;
    const moonGrad = off.createLinearGradient(gradX1, gradY1, gradX2, gradY2);
    moonGrad.addColorStop(0, '#e8c8a0');
    moonGrad.addColorStop(Math.max(0.4, 1 - intensity), '#a03020');
    moonGrad.addColorStop(1, `rgba(60, 0, 0, ${intensity})`);
    off.fillStyle = moonGrad;
    // Moon glow halo for lunar eclipse (radial gradient replaces shadowBlur)
    off.fill();
    const moonEclGlow = off.createRadialGradient(drawMoonX, drawMoonY, moonRadius, drawMoonX, drawMoonY, moonRadius + 12);
    moonEclGlow.addColorStop(0, `rgba(180, 40, 20, ${intensity * 0.35})`);
    moonEclGlow.addColorStop(1, 'rgba(180, 40, 20, 0)');
    off.beginPath();
    off.arc(drawMoonX, drawMoonY, moonRadius + 12, 0, TAU);
    off.fillStyle = moonEclGlow;
    off.fill();
 } else if (solarEclipse && solarEclipse.currentPercent > 0) {
    const intensity = solarEclipse.currentPercent / 100;
    off.fillStyle = `rgba(0, 0, 0, ${intensity})`;
    off.fill();
  } else {
    off.fillStyle = '#ffffff';
    off.fill();
    // Moon glow halo (radial gradient replaces shadowBlur)
    const moonGlow = off.createRadialGradient(drawMoonX, drawMoonY, moonRadius, drawMoonX, drawMoonY, moonRadius + 10);
    moonGlow.addColorStop(0, 'rgba(170,212,255,0.35)');
    moonGlow.addColorStop(1, 'rgba(170,212,255,0)');
    off.beginPath();
    off.arc(drawMoonX, drawMoonY, moonRadius + 10, 0, TAU);
    off.fillStyle = moonGlow;
    off.fill();
  }

  off.restore();

  // Detect when moon is near sun on the wheel — flip moon labels to opposite side
  let moonSunDiff = currentVisualAngle - sunAngle;
  while (moonSunDiff > Math.PI) moonSunDiff -= Math.PI * 2;
  while (moonSunDiff < -Math.PI) moonSunDiff += Math.PI * 2;
  const moonNearSun = Math.abs(moonSunDiff) < Math.PI / 6;

  if (!hideMoonLabels) {
    const isNorth = state.enochHem === 'N';
    const tarena = getTarenaDay(state.currentTime, isNorth);
    const isMoonRightSide = moonNearSun
      ? (Math.cos(sunAngle) <= 0)
      : Math.cos(currentVisualAngle) > 0; // Utilise l'angle visuel pour l'alignement
    const fontSize = Math.max(12, baseR * 0.026);
    const moonOffsetX = isMoonRightSide ? 15 : -15;

    off.textAlign = isMoonRightSide ? 'left' : 'right';

    off.font = `300 ${fontSize}px "DM Mono", monospace`;
    off.fillStyle = 'rgba(180,210,255,0.75)';
    fillTextGlow(off, tarena.name, drawMoonX + moonOffsetX, drawMoonY, 'rgba(0,0,0,0.8)', 3);

    const dotRadius = 2.5;
    const dotSpacing = 9;
    const dotY = drawMoonY + fontSize * 0.8;
    const startX = drawMoonX + moonOffsetX;

    off.fillStyle = '#ffffff';

    for (let i = 0; i < tarena.energy; i++) {
      const xOffset = isMoonRightSide ? (i * dotSpacing) : -(i * dotSpacing);
      const dotX = startX + xOffset;
      // Glow per dot (radial gradient replaces shadowBlur)
      const dotGlow = off.createRadialGradient(dotX, dotY, 0, dotX, dotY, dotRadius * 4);
      dotGlow.addColorStop(0, 'rgba(170,212,255,0.4)');
      dotGlow.addColorStop(1, 'rgba(170,212,255,0)');
      off.beginPath();
      off.arc(dotX, dotY, dotRadius * 4, 0, Math.PI * 2);
      off.fillStyle = dotGlow;
      off.fill();
      off.beginPath();
      off.arc(dotX, dotY, dotRadius, 0, Math.PI * 2);
      off.fillStyle = '#ffffff';
      off.fill();
    }

    const tahLabel = tahState.current ? `${tahState.current.month.name}` : '—';
    const tahLabelY = dotY + dotRadius + fontSize * 1.2;
    off.font = `300 ${Math.max(9, baseR * 0.022)}px "DM Mono", monospace`;
    off.fillStyle = 'rgba(160,185,210,0.5)';
    off.textAlign = isMoonRightSide ? 'left' : 'right';
    fillTextGlow(off, tahLabel, startX, tahLabelY, 'rgba(0,0,0,0.7)', 2);
  }

  // ── Labels des Éclipses ─────────────────────────────────────────
  eclipseMarkers.forEach(em => {
    if (em.currentPercent === 0) return;

    const isSolar = em.type === 'solar';
    const targetX = isSolar ? mx : drawMoonX;
    const targetY = isSolar ? my : drawMoonY;
    const angle = isSolar ? sunAngle : currentVisualAngle;
    const isRight = Math.cos(angle) > 0;

    const lx = targetX + (isRight ? 15 : -15);
    const ly = targetY - Math.max(16, baseR * 0.04);

    off.save();
    off.font = `500 ${Math.max(9, baseR * 0.024)}px "DM Mono", monospace`;
    off.textAlign = isRight ? 'left' : 'right';
    off.fillStyle = isSolar ? '#ffcc00' : '#ff7c73';
    fillTextGlow(off, `${em.label} ${em.currentPercent}%`, lx, ly, 'rgba(0,0,0,0.8)', 3);
    off.restore();
  });

  // ── Sun date label ──────────────────────────────────────────────
  const hasActiveSolarEclipse = solarEclipse && solarEclipse.currentPercent > 0;
  const solarEclipseOffset = hasActiveSolarEclipse ? Math.max(22, baseR * 0.06) : 0;
  const baseLabelY = my + solarEclipseOffset;

  off.fillStyle = isOutOfTime ? '#e05555' : '#fff';
  off.font = `500 ${Math.max(12, baseR * 0.035)}px "DM Mono", monospace`;
  const isRightSide = Math.cos(sunAngle) > 0;
  off.textAlign = isRightSide ? 'left' : 'right';
  const offsetX = isRightSide ? 15 : -15;

  const labelText = snap
    ? snap.enoch.labelText
    : (isOutOfTime
      ? `Jour ${curDay - ENOCH_OUT_OF_TIME_START + 1} hors du temps`
      : `Jour ${dayInMonth} · Mois ${currentMonthIdx + 1} (Hénoch)`);

  fillTextGlow(off, labelText, mx + offsetX, baseLabelY, 'rgba(0,0,0,0.8)', 3);

  const hebrewLabel = snap
    ? snap.hebrew.labelText
    : (() => {
        const hb = computeHebrewFromJD(jdForLabel, 0, undefined, undefined, state.userTimezone);
        return `Jour ${hb.day} · Mois ${hb.month}`;
      })();
  off.font = `400 ${Math.max(10, baseR * 0.028)}px "DM Mono", monospace`;
  off.fillStyle = 'rgba(198, 198, 198, 0.8)';
  fillTextGlow(off, hebrewLabel + ' (Hébraïque)', mx + offsetX, baseLabelY + Math.max(14, baseR * 0.038), 'rgba(0,0,0,0.8)', 3);

  const gregLabel = getHistoricalLabel(jdForLabel);
  off.font = `300 ${Math.max(10, baseR * 0.026)}px "DM Mono", monospace`;
  off.fillStyle = 'rgba(200,215,235,0.5)';
  fillTextGlow(off, gregLabel, mx + offsetX, baseLabelY + Math.max(28, baseR * 0.072), 'rgba(0,0,0,0.7)', 3);

  // Cache the rendered wheel and blit to main canvas
  _enochCacheKey = cacheKey;
  enochCtx.setTransform(1, 0, 0, 1, 0, 0);
  enochCtx.clearRect(0, 0, enochCtx.canvas.width, enochCtx.canvas.height);
  enochCtx.drawImage(_enochOffCanvas, 0, 0);
}
export function setupEnochUI(state: AppState, callbacks: EnochCallbacks): () => void {
  const showEnochCb = document.getElementById('show-enoch') as HTMLInputElement | null;
  const enochControlsEl = document.getElementById('enoch-controls');
  let showEnoch = true;

  if (enochControlsEl) enochControlsEl.classList.remove('hidden');

  const onShowChange = (): void => {
    showEnoch = showEnochCb!.checked;
    if (enochControlsEl) enochControlsEl.classList.toggle('hidden', !showEnoch);
    state.needsRedraw = true;
  };

  const onNorth = (): void => {
    state.enochHem = 'N';
    document.getElementById('enochN')!.classList.add('hem-active');
    document.getElementById('enochS')!.classList.remove('hem-active');
    if (callbacks.applyProjection) callbacks.applyProjection();
    if (callbacks.forceEventPanelRefresh) callbacks.forceEventPanelRefresh();
    state.needsRedraw = true;
  };

  const onSouth = (): void => {
    state.enochHem = 'S';
    document.getElementById('enochS')!.classList.add('hem-active');
    document.getElementById('enochN')!.classList.remove('hem-active');
    if (callbacks.applyProjection) callbacks.applyProjection();
    if (callbacks.forceEventPanelRefresh) callbacks.forceEventPanelRefresh();
    state.needsRedraw = true;
  };

  if (showEnochCb) showEnochCb.addEventListener('change', onShowChange);
  const enochN = document.getElementById('enochN');
  const enochS = document.getElementById('enochS');
  if (enochN) enochN.addEventListener('click', onNorth);
  if (enochS) enochS.addEventListener('click', onSouth);

  // Sync initial panel button state with state.enochHem
  const isNorth = state.enochHem === 'N';
  if (enochN) enochN.classList.toggle('hem-active', isNorth);
  if (enochS) enochS.classList.toggle('hem-active', !isNorth);

  // Cleanup function
  return function cleanup(): void {
    if (showEnochCb) showEnochCb.removeEventListener('change', onShowChange);
    if (enochN) enochN.removeEventListener('click', onNorth);
    if (enochS) enochS.removeEventListener('click', onSouth);
  };
}