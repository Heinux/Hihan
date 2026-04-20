export const WIND_PARTICLE_COUNT = typeof window !== 'undefined' && window.innerWidth < 768 ? 4000 : 8000;
export const WIND_SPEED_FACTOR = 0.18;
export const WIND_MAX_AGE_MIN = 30;
export const WIND_MAX_AGE_MAX = 80;
export const WIND_FADE_ALPHA = 0.14;
export const WIND_DATA_URL = '/wind/gfs-current.bin';