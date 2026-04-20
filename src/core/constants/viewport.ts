export interface ZoomConfig {
  readonly MIN: number;
  readonly MAX: number;
  readonly DEFAULT: number;
  readonly LABEL_THRESHOLD: number;
  readonly LABEL_EXPONENT: number;
}

export const ZOOM: ZoomConfig = { MIN: 0.5, MAX: 100, DEFAULT: 0.8, LABEL_THRESHOLD: 1.0, LABEL_EXPONENT: 0.6 } as const;

export function zoomLabelScale(zoomK: number): number {
  if (zoomK <= ZOOM.LABEL_THRESHOLD) return 1;
  return 1 / Math.pow(zoomK / ZOOM.LABEL_THRESHOLD, ZOOM.LABEL_EXPONENT);
}

export const PAN_CLAMP_FACTOR: number = 0.7;
export const WHEEL_SENSITIVITY: number = 0.009;
export const WHEEL_ZOOM_FACTOR: number = 1.2;
export const HOVER_MIN_RADIUS: number = 18;
export const HOVER_EXTRA_RADIUS: number = 8;
export const MOBILE_VIEWPORT_THRESHOLD = 550;