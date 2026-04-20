export const J2000_EPOCH: number = 2451545.0;
export const JULIAN_UNIX_EPOCH: number = 2440587.5;

export const MINUTES_PER_DAY: number = 1440;
export const HOURS_PER_DAY: number = 24;
export const DAYS_PER_YEAR: number = 365.25;
export const MS_PER_DAY: number = 86400000;
export const MS_PER_HOUR: number = 3600000;
export const MS_PER_MINUTE: number = 60000;
export const SECONDS_PER_DAY: number = 86400;
export const JULIAN_CENTURY_DAYS: number = 36525.0;

export const JS_DATE_MAX_MS: number = 8640000000000000;
export const GREGORIAN_CUTOVER_JD: number = 2299161;

export const OBLIQUITY_COEFFS: readonly number[] = [84381.448, -4680.93, -1.55, 1999.25, -51.38, -249.67, -39.05, 7.12, 27.87, 5.79, 2.45] as const;
export const ARCSEC_TO_RAD: number = (1 / 3600) * (Math.PI / 180);