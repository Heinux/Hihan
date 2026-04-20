export const STEP_UNITS = ['sec', 'min', 'hour', 'day', 'month', 'year'] as const;
export type StepUnit = typeof STEP_UNITS[number];

export const STEP_LABELS: Record<StepUnit, string> = {
  sec: '1s', min: '1min', hour: '1h', day: '1j', month: '1M', year: '1an',
} as const;

export const AVG_MONTH_DAYS: number = 30.436875;