interface TooltipPosition {
  x: number;
  y: number;
}

interface TooltipOptions {
  pad?: number;
  gap?: number;
  tipW: number;
  tipH: number;
  viewportW: number;
  viewportH: number;
  mouseX: number;
  mouseY: number;
}

export function positionTooltip(opts: TooltipOptions): TooltipPosition {
  const pad = opts.pad ?? 14;
  const gap = opts.gap ?? 12;
  const { tipW, tipH, viewportW: vw, viewportH: vh, mouseX: mx, mouseY: my } = opts;

  let x = mx + gap;
  let y = my - tipH - gap;

  if (x + tipW + pad > vw) x = mx - tipW - gap;
  if (x < pad) x = pad;
  if (y < pad) y = my + gap;
  if (y + tipH + pad > vh) y = vh - tipH - pad;

  return { x, y };
}

export function applyTooltipPosition(el: HTMLElement, pos: TooltipPosition): void {
  el.style.left = pos.x + 'px';
  el.style.top = pos.y + 'px';
}