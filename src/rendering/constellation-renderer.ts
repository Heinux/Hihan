import type { GeoProjection } from 'd3';
import type { TypedGeoPath } from '@/rendering/geo-path';
import { precessJ2000ToDate, normLon } from '@/core/astronomy';
import { zoomLabelScale } from '@/core/constants';
import { getGlowSprite, blitGlow } from '@/rendering/glow-sprite-cache';
import { placeLabel } from '@/rendering/renderer';
import type { LabelBox } from '@/rendering/renderer';
import { NAV_STARS } from '@/data/nav-stars';
import { ZODIAC_CONSTELLATIONS } from '@/data/zodiac-constellations';
import { CITIES } from '@/data/cities';
import type { City } from '@/data/cities';
import { positionTooltip as calcTooltipPos, applyTooltipPosition } from '@/ui/tooltip';

interface CityHitTarget {
  city: City;
  px: number;
  py: number;
}

interface CityHoverState {
  W: number;
  H: number;
  panX: number;
  panY: number;
  zoomK: number;
  viewScale: number;
  hoveredCity: CityHitTarget | null;
  needsRedraw: boolean;
}


export function drawConstellations(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  gmst: number,
  T: number,
  placedLabels: LabelBox[],
  showZodiac: boolean,
  W: number,
  H: number,
  _vs: number = 1,
  zoomK: number = 1,
): void {
  if (!showZodiac) return;
  const z = zoomLabelScale(zoomK);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';

  ZODIAC_CONSTELLATIONS.forEach(cst => {
    const projected = cst.stars.map(star => {
      const { ra_deg, dec_deg } = precessJ2000ToDate(star.ra * 15, star.dec, T);
      const lon = normLon((ra_deg / 15 - gmst) * 15);
      const coords = projection([lon, dec_deg]);
      if (!coords) return null;
      return { x: coords[0], y: coords[1], n: star.n };
    });

    const maxLinkPx = Math.min(W, H) * (cst.maxLink || 0.20);

    // Draw constellation links
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 234, 153, 0.5)';
    ctx.lineWidth = 0.3 * z;
    cst.links.forEach(([a, b]) => {
      const pa = projected[a], pb = projected[b];
      if (!pa || !pb) return;
      if (Math.hypot(pb.x - pa.x, pb.y - pa.y) > maxLinkPx) return;
      ctx.beginPath();
      ctx.moveTo(pa.x, pa.y);
      ctx.lineTo(pb.x, pb.y);
      ctx.stroke();
    });
    ctx.restore();

    // Draw stars
    const zodiacR = 1.4 * z;
    let cx = 0, cy = 0, cnt = 0;
    projected.forEach(p => {
      if (!p) return;

      // Core dot only (no glow)
      ctx.beginPath();
      ctx.arc(p.x, p.y, zodiacR, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 234, 153, 0.5)';
      ctx.fill();

      cx += p.x;
      cy += p.y;
      cnt++;
    });

    // Constellation name label
    if (cnt > 0) {
      placeLabel({ labels: placedLabels, x: cx / cnt, y: cy / cnt, text: cst.name, font: `300 ${7 * z}px "DM Mono",monospace`, color: 'rgba(255, 234, 153, 0.3)', radius: 10 * z, context2d: ctx, zoomK });
    }
  });
}

export function drawNavStars(
  ctx: CanvasRenderingContext2D,
  gmst: number,
  T: number,
  projection: GeoProjection,
  _pathGen: TypedGeoPath,
  placedLabels: LabelBox[],
  vs: number = 1,
  zoomK: number = 1,
): void {
  const z = zoomLabelScale(zoomK);
  NAV_STARS.forEach(star => {
    const { ra_deg, dec_deg } = precessJ2000ToDate(star.ra * 15, star.dec, T, star.pm_ra, star.pm_dec);
    const lon = normLon((ra_deg / 15 - gmst) * 15);
    const coords = projection([lon, dec_deg]);
    if (!coords) return;
    const [sx, sy] = coords;

    const isPleiades = star.pleiades;
    // Radius from magnitude
    const baseR = star.nav
      ? Math.max(1.5, 2.5 - star.mag * 1.1)
      : (isPleiades ? 1.2 : 1.0);
    const r = baseR * z;

    // Colors
    const coreColor  = star.nav ? 'rgba(220, 235, 255, 0.95)' : 'rgba(200,215,255,0.7)';
    // Halo gradient — subtle glow hint, not a disc
    const blurSigma = (star.nav ? 1.8 : 0.8) * vs * vs * z;
    const totalGlowR = r + blurSigma * 4;
    const ce = r / totalGlowR;

    // Pre-rendered glow sprite (avoids per-frame createRadialGradient)
    const spriteKey = star.nav ? 'nav' : 'non-nav';
    const sprite = getGlowSprite(totalGlowR,
      star.nav
        ? [
            { offset: 0, color: 'rgba(160,200,255,0.12)' },
            { offset: ce, color: 'rgba(200,225,255,0.35)' },
            { offset: ce + (1 - ce) * 0.25, color: 'rgba(180,215,255,0.12)' },
            { offset: ce + (1 - ce) * 0.55, color: 'rgba(165,205,255,0.03)' },
            { offset: 1, color: 'rgba(0,0,0,0)' },
          ]
        : [
            { offset: 0, color: 'rgba(160,190,255,0.06)' },
            { offset: ce, color: 'rgba(180,205,255,0.18)' },
            { offset: ce + (1 - ce) * 0.3, color: 'rgba(170,200,255,0.05)' },
            { offset: 1, color: 'rgba(0,0,0,0)' },
          ],
      spriteKey);
    blitGlow(ctx, sprite, sx, sy);

    // Core dot — brighter center to compensate for glow replacing shadowBlur
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fillStyle = coreColor;
    ctx.fill();

    // Diffraction cross for bright nav stars (mag < 1.5)
    if (star.nav && star.mag < 1.5) {
      const arm = r * 2.5;
      // Glow pass (wide, faint)
      ctx.beginPath();
      ctx.moveTo(sx - arm, sy); ctx.lineTo(sx + arm, sy);
      ctx.moveTo(sx, sy - arm); ctx.lineTo(sx, sy + arm);
      ctx.strokeStyle = 'rgba(180,215,255,0.15)';
      ctx.lineWidth = 2.5 * vs * z;
      ctx.stroke();
      // Core pass (thin, bright)
      ctx.beginPath();
      ctx.moveTo(sx - arm, sy); ctx.lineTo(sx + arm, sy);
      ctx.moveTo(sx, sy - arm); ctx.lineTo(sx, sy + arm);
      ctx.strokeStyle = 'rgba(200,225,255,0.5)';
      ctx.lineWidth = 0.5 * z;
      ctx.stroke();
    }

    // Star name label
    if (star.nav || isPleiades) {
      const baseFontSize = star.nav
        ? (star.mag < 0.5 ? 8 : star.mag < 1.5 ? 7 : 6)
        : 5.5;
      const fontSize = Math.round(baseFontSize * vs * z);
      const fontWeight = star.nav && star.mag < 1.0 ? '500' : '300';
      const labelColor = star.nav
        ? (star.mag < 0.5 ? 'rgba(230,242,255,0.95)' : 'rgba(200,225,255,0.8)')
        : 'rgba(180,205,255,0.65)';
      placeLabel({ labels: placedLabels, x: sx, y: sy, text: star.n, font: `${fontWeight} ${fontSize}px "DM Mono",monospace`, color: labelColor, radius: r + 2 * z, context2d: ctx, zoomK });
    }

    // Pleiades group badge
    if (star.n === 'Alcyone') {
      ctx.save();
      ctx.font = `300 ${5 * z}px "DM Mono",monospace`;
      ctx.fillStyle = 'rgba(180,210,255,0.55)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText('Pleiades', sx + r + 3 * z, sy - 8 * z);
      ctx.restore();
    }
  });
}

export function drawCities(
  ctx: CanvasRenderingContext2D,
  projection: GeoProjection,
  showCities: boolean,
  citiesData?: readonly City[],
  vs: number = 1,
  zoomK: number = 1,
): CityHitTarget[] {
  if (!showCities) return [];
  const z = zoomLabelScale(zoomK);
  const cityHitTargets: CityHitTarget[] = [];
  (citiesData || CITIES).forEach(city => {
    const coords = projection([city.lon, city.lat]);
    if (!coords) return;
    const [cx, cy] = coords;
    cityHitTargets.push({ city, px: cx, py: cy });
    if (city.type === 'landmark') {
      ctx.font = `${9 * z}px system-ui`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      // Glow via strokeText (replaces shadowBlur)
      ctx.strokeStyle = 'rgba(255,180,60,0.25)';
      ctx.lineWidth = 3 * z;
      ctx.lineJoin = 'round';
      ctx.strokeText(city.symbol || '\u25C6', cx, cy);
      ctx.fillStyle = 'rgba(255,200,110,0.8)';
      ctx.fillText(city.symbol || '\u25C6', cx, cy);
    } else {
      // Glow via pre-rendered sprite (replaces per-frame createRadialGradient)
      const cityGlowR = (2 * vs * vs + 4) * z;
      const citySprite = getGlowSprite(cityGlowR, [
        { offset: 0, color: 'rgba(255,190,90,0.4)' },
        { offset: 0.5, color: 'rgba(255,190,90,0.1)' },
        { offset: 1, color: 'rgba(255,190,90,0)' },
      ], 'city');
      blitGlow(ctx, citySprite, cx, cy);
      // Core dot
      ctx.beginPath();
      ctx.arc(cx, cy, 2 * z, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255,210,140,0.7)';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(cx, cy, 3.5 * z, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,200,110,0.22)';
      ctx.lineWidth = 0.7 * z;
      ctx.stroke();
    }
  });
  return cityHitTargets;
}

export function checkCityHover(
  mx: number,
  my: number,
  state: CityHoverState,
  _projection: GeoProjection,
  cityHitTargets: CityHitTarget[],
  cityTooltipEl: HTMLElement,
  showCities: boolean,
): void {
  if (!showCities) {
    if (state.hoveredCity) {
      state.hoveredCity = null;
      cityTooltipEl.classList.remove('visible');
    }
    return;
  }
  const vs = state.viewScale ?? 1;
  const wx = (mx / vs - state.W / (2 * vs) - state.panX / vs) / state.zoomK + state.W / (2 * vs);
  const wy = (my / vs - state.H / (2 * vs) - state.panY / vs) / state.zoomK + state.H / (2 * vs);
  let found: CityHitTarget | null = null;
  for (const t of cityHitTargets) {
    if (Math.hypot(t.px - wx, t.py - wy) < 10) { found = t; break; }
  }
  if (found !== state.hoveredCity) {
    state.hoveredCity = found;
    if (found) {
      cityTooltipEl.textContent = `${found.city.name} \u00B7 ${found.city.lat.toFixed(2)}\u00B0, ${found.city.lon.toFixed(2)}\u00B0`;
      cityTooltipEl.classList.add('visible');
    } else {
      cityTooltipEl.classList.remove('visible');
    }
    state.needsRedraw = true;
  }
  if (found) {
    const tipW = cityTooltipEl.offsetWidth || 200;
    const tipH = cityTooltipEl.offsetHeight || 24;
    const pos = calcTooltipPos({ tipW, tipH, viewportW: state.W, viewportH: state.H, mouseX: mx, mouseY: my });
    applyTooltipPosition(cityTooltipEl, pos);
  }
}
