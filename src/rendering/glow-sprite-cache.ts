/**
 * Pre-rendered glow sprites to avoid per-frame createRadialGradient calls.
 * Each sprite is an offscreen canvas blitted via drawImage() — much cheaper
 * than creating a live gradient object on every frame, especially on mobile.
 */

const cache = new Map<string, HTMLCanvasElement>();

/** Create or retrieve a cached glow sprite. */
export function getGlowSprite(
  outerR: number,
  stops: readonly { offset: number; color: string }[],
  key: string,
): HTMLCanvasElement {
  // Round outer radius to 0.5px — sub-pixel differences are invisible
  const roundedR = Math.round(outerR * 2) / 2;
  const cacheKey = `${key}:${roundedR}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const size = Math.ceil(roundedR * 2) + 2; // +2 for anti-aliasing padding
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const cx = size / 2;
  const cy = size / 2;

  const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, roundedR);
  for (const s of stops) {
    grad.addColorStop(s.offset, s.color);
  }
  ctx.beginPath();
  ctx.arc(cx, cy, roundedR, 0, Math.PI * 2);
  ctx.fillStyle = grad;
  ctx.fill();

  cache.set(cacheKey, canvas);
  return canvas;
}

/** Blit a glow sprite centered at (sx, sy) on the target context. */
export function blitGlow(
  targetCtx: CanvasRenderingContext2D,
  sprite: HTMLCanvasElement,
  sx: number,
  sy: number,
): void {
  const halfW = sprite.width / 2;
  const halfH = sprite.height / 2;
  targetCtx.drawImage(sprite, sx - halfW, sy - halfH);
}

/** Clear the sprite cache (call on resize or projection change). */
export function clearGlowSpriteCache(): void {
  cache.clear();
}