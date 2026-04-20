import type { TideCurvePoint } from '@/core/tide';

interface TideCurveParams {
  ctx: CanvasRenderingContext2D;
  W: number;
  H: number;
  dpr: number;
  curve: TideCurvePoint[];
  isRising: boolean;
  springNeapLabel: string;
  lastExtremumTimeStr: string;
  lastExtremumLabel: string;
  nextExtremumTimeStr: string;
  nextExtremumLabel: string;
}

const MARGIN_L = 44;
const MARGIN_R = 16;
const MARGIN_T = 20;
const MARGIN_B = 36;

/** Linearly interpolate tide curve height at a given hoursOffset. */
function interpolateCurveHeight(curve: TideCurvePoint[], target: number): number {
  if (curve.length < 2) return 0;
  // Find bracketing points
  for (let i = 0; i < curve.length - 1; i++) {
    if (curve[i].hoursOffset <= target && curve[i + 1].hoursOffset >= target) {
      const t = (target - curve[i].hoursOffset) / (curve[i + 1].hoursOffset - curve[i].hoursOffset);
      return curve[i].heightMeters + t * (curve[i + 1].heightMeters - curve[i].heightMeters);
    }
  }
  // Fallback: closest point
  let closest = curve[0];
  for (const p of curve) {
    if (Math.abs(p.hoursOffset - target) < Math.abs(closest.hoursOffset - target)) closest = p;
  }
  return closest.heightMeters;
}

export function drawTideCurve(params: TideCurveParams): void {
  const { ctx, W, H, dpr, curve, isRising, springNeapLabel, lastExtremumTimeStr, lastExtremumLabel, nextExtremumTimeStr, nextExtremumLabel } = params;
  if (curve.length < 2) return;

  const ml = MARGIN_L * dpr;
  const mr = MARGIN_R * dpr;
  const mt = MARGIN_T * dpr;
  const mb = MARGIN_B * dpr;
  const plotW = W * dpr - ml - mr;
  const plotH = H * dpr - mt - mb;

  ctx.save();
  ctx.clearRect(0, 0, W * dpr, H * dpr);

  // Interpolate curve height at hoursOffset=0 (ensures dot sits exactly on curve)
  const currentHeight = interpolateCurveHeight(curve, 0);

  // Height value (top-left)
  const arrow = isRising ? '↑' : '↓';
  const hStr = `${arrow} ${currentHeight >= 0 ? '+' : ''}${currentHeight.toFixed(2)} m`;
  const valueFs = 10 * dpr;
  ctx.font = `400 ${valueFs}px "DM Mono",monospace`;
  ctx.textBaseline = 'top';
  ctx.fillStyle = isRising ? 'rgba(100,200,255,0.9)' : 'rgba(180,160,220,0.9)';
  ctx.textAlign = 'left';
  ctx.fillText(hStr, ml, 6 * dpr);

  // Find height range
  let hMin = Infinity, hMax = -Infinity;
  for (const p of curve) {
    if (p.heightMeters < hMin) hMin = p.heightMeters;
    if (p.heightMeters > hMax) hMax = p.heightMeters;
  }
  const hPad = Math.max(0.05, (hMax - hMin) * 0.15);
  hMin -= hPad;
  hMax += hPad;
  if (hMax - hMin < 0.01) { hMax = hMin + 0.1; }

  const hoursRange = curve[curve.length - 1].hoursOffset - curve[0].hoursOffset;
  const h0 = curve[0].hoursOffset;

  function toX(hOff: number): number { return ml + (hOff - h0) / hoursRange * plotW; }
  function toY(h: number): number { return mt + (1 - (h - hMin) / (hMax - hMin)) * plotH; }

  // Zero line
  const zeroY = toY(0);
  if (zeroY > mt && zeroY < mt + plotH) {
    ctx.strokeStyle = 'rgba(100,140,200,0.18)';
    ctx.lineWidth = 0.5 * dpr;
    ctx.setLineDash([4 * dpr, 4 * dpr]);
    ctx.beginPath();
    ctx.moveTo(ml, zeroY);
    ctx.lineTo(ml + plotW, zeroY);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  // Fill under curve
  ctx.beginPath();
  ctx.moveTo(toX(curve[0].hoursOffset), toY(0));
  for (const p of curve) ctx.lineTo(toX(p.hoursOffset), toY(p.heightMeters));
  ctx.lineTo(toX(curve[curve.length - 1].hoursOffset), toY(0));
  ctx.closePath();
  const fillGrad = ctx.createLinearGradient(0, mt, 0, mt + plotH);
  fillGrad.addColorStop(0, 'rgba(80,160,240,0.18)');
  fillGrad.addColorStop(1, 'rgba(80,160,240,0.02)');
  ctx.fillStyle = fillGrad;
  ctx.fill();

  // Curve line
  ctx.beginPath();
  for (let i = 0; i < curve.length; i++) {
    const x = toX(curve[i].hoursOffset);
    const y = toY(curve[i].heightMeters);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.strokeStyle = 'rgba(100,180,255,0.7)';
  ctx.lineWidth = 1.5 * dpr;
  ctx.stroke();

  // Now marker (hoursOffset = 0)
  const nowX = toX(0);
  if (nowX >= ml && nowX <= ml + plotW) {
    ctx.strokeStyle = 'rgba(255,220,100,0.6)';
    ctx.lineWidth = 1 * dpr;
    ctx.setLineDash([3 * dpr, 3 * dpr]);
    ctx.beginPath();
    ctx.moveTo(nowX, mt);
    ctx.lineTo(nowX, mt + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    // Current height dot
    const nowY = toY(currentHeight);
    ctx.beginPath();
    ctx.arc(nowX, nowY, 3 * dpr, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,220,100,0.9)';
    ctx.fill();
  }

  // Time axis (first row below plot)
  const axisFs = 9 * dpr;
  ctx.font = `400 ${axisFs}px "DM Mono",monospace`;
  ctx.fillStyle = 'rgba(130,165,210,0.5)';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'center';
  ctx.fillText('-12h', toX(-12), mt + plotH + 6 * dpr);
  ctx.fillText('maint.', toX(0), mt + plotH + 6 * dpr);
  ctx.fillText('+12h', toX(12), mt + plotH + 6 * dpr);

  // Spring/neap + PM/BM (second row below plot, below time axis)
  const infoFs = 9 * dpr;
  ctx.font = `400 ${infoFs}px "DM Mono",monospace`;
  ctx.fillStyle = 'rgba(150,180,220,0.6)';
  ctx.textAlign = 'left';
  ctx.fillText(springNeapLabel, ml, mt + plotH + 18 * dpr);
  ctx.textAlign = 'right';
  ctx.fillText(`${lastExtremumLabel} ${lastExtremumTimeStr} · ${nextExtremumLabel} ${nextExtremumTimeStr}`, W * dpr - mr, mt + plotH + 18 * dpr);

  // Y-axis labels
  const yFs = 8 * dpr;
  ctx.font = `400 ${yFs}px "DM Mono",monospace`;
  ctx.fillStyle = 'rgba(130,165,210,0.45)';
  ctx.textAlign = 'right';
  ctx.textBaseline = 'middle';
  const yTop = toY(hMax - hPad);
  const yBot = toY(hMin + hPad);
  ctx.fillText(`+${(hMax - hPad).toFixed(1)}`, ml - 4 * dpr, yTop);
  ctx.fillText(`${(hMin + hPad).toFixed(1)}`, ml - 4 * dpr, yBot);

  ctx.restore();
}