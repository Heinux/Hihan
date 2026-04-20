import { describe, it, expect } from 'vitest';
import {
  formatRA,
  formatDec,
  getMoonPhaseName,
  formatCountdown,
} from '@/core/formatters';
import { MS_PER_DAY, MS_PER_HOUR, MS_PER_MINUTE } from '@/core/constants';

describe('formatRA', () => {
  it('formats 0h 0m 0s correctly', () => {
    expect(formatRA(0)).toBe('00h 00m 00s');
  });

  it('formats full hours and minutes', () => {
    expect(formatRA(6)).toBe('06h 00m 00s');
    expect(formatRA(12.5)).toBe('12h 30m 00s');
  });

  it('formats fractional hours with seconds', () => {
    const result = formatRA(6.5);
    expect(result).toContain('06h');
    expect(result).toContain('30m');
  });

  it('handles near-24 hours correctly', () => {
    const result = formatRA(23.999);
    expect(result).toContain('23h');
    expect(result).toContain('59m');
  });

  it('does not produce 60s (carry behavior)', () => {
    const ra = 0.999 * (60/3600) + 0.999; // some edge case
    const result = formatRA(ra);
    expect(result).not.toMatch(/60s/);
  });
});

describe('formatDec', () => {
  it('formats positive declination with + sign', () => {
    expect(formatDec(0)).toBe('+00° 00\'');
    expect(formatDec(23.5)).toBe('+23° 30\'');
  });

  it('formats negative declination with minus sign', () => {
    const result = formatDec(-23.5);
    expect(result).toContain('\u2212');
    expect(result).toMatch(/\u2212\d+/);
  });

  it('formats 90 degrees (celestial pole)', () => {
    expect(formatDec(90)).toBe('+90° 00\'');
    expect(formatDec(-90)).toMatch(/\u221290/);
  });
});

describe('getMoonPhaseName', () => {
  it('returns Nouvelle Lune for 0-4 degrees', () => {
    expect(getMoonPhaseName(0)).toBe('Nouvelle Lune');
    expect(getMoonPhaseName(2)).toBe('Nouvelle Lune');
  });

  it('returns Nouvelle Lune for 356-360 degrees', () => {
    expect(getMoonPhaseName(357)).toBe('Nouvelle Lune');
    expect(getMoonPhaseName(359)).toBe('Nouvelle Lune');
  });

  it('returns a valid name for mid-range degrees', () => {
    const name = getMoonPhaseName(180);
    expect(typeof name).toBe('string');
    expect(name.length).toBeGreaterThan(0);
  });
});

describe('formatCountdown', () => {
  it('formats days correctly', () => {
    const ms = 3 * MS_PER_DAY;
    expect(formatCountdown(ms)).toMatch(/3j/);
  });

  it('formats hours correctly when days are 0', () => {
    const ms = 5 * MS_PER_HOUR;
    expect(formatCountdown(ms)).toMatch(/5h/);
  });

  it('formats minutes when days and hours are 0', () => {
    const ms = 30 * MS_PER_MINUTE;
    expect(formatCountdown(ms)).toMatch(/30m/);
  });

  it('adds "Il y a" prefix for past times', () => {
    const ms = -1 * MS_PER_DAY;
    expect(formatCountdown(ms)).toBe('Il y a 1j 0h');
  });

  it('adds "Dans" prefix for future times', () => {
    const ms = 1 * MS_PER_DAY;
    expect(formatCountdown(ms)).toBe('Dans 1j 0h');
  });

  it('handles exactly zero', () => {
    const result = formatCountdown(0);
    expect(result).toMatch(/0h|0m/);
  });
});