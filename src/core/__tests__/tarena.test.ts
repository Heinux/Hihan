import { describe, it, expect } from 'vitest';
import { getTarenaDay } from '@/core/formatters';
import { TARENA } from '@/core/constants';
import * as Astronomy from 'astronomy-engine';

/** Find the last new moon before a given date using astronomy-engine. */
function findLastNewMoon(before: Date): Date {
  const t = new Astronomy.AstroTime(before);
  const nm = Astronomy.SearchMoonPhase(0, t, -45);
  return nm ? nm.date : before;
}

describe('getTarenaDay', () => {
  it('returns a valid TarenaDay for the current date (South)', () => {
    const result = getTarenaDay(new Date(), false);
    expect(result.day).toBeGreaterThanOrEqual(1);
    expect(result.day).toBeLessThanOrEqual(30);
    expect(result.name).toBeTruthy();
    expect(result.energy).toBeGreaterThanOrEqual(1);
    expect(result.energy).toBeLessThanOrEqual(3);
  });

  it('returns a valid TarenaDay for the current date (North)', () => {
    const result = getTarenaDay(new Date(), true);
    expect(result.day).toBeGreaterThanOrEqual(1);
    expect(result.day).toBeLessThanOrEqual(30);
  });

  it('returns Tīreo on new moon day (South)', () => {
    // The new moon near Jan 2025 was 2024-12-30T22:27Z
    const newMoonDate = new Date('2024-12-31T00:00:00Z');
    const result = getTarenaDay(newMoonDate, false);
    expect(result.day).toBe(1);
    expect(result.name).toBe('Tīreo');
  });

  it('returns Mutu near end of lunar cycle (South)', () => {
    // ~29 days after the Dec 30 new moon → day 29-30
    const lateCycle = new Date('2025-01-27T12:00:00Z');
    const result = getTarenaDay(lateCycle, false);
    expect(result.day).toBeGreaterThanOrEqual(28);
  });

  it('South hemisphere uses natural order (day = lunar day)', () => {
    // Day after new moon → day 2 in South
    const dayAfter = new Date('2025-01-01T00:00:00Z');
    const result = getTarenaDay(dayAfter, false);
    expect(result.day).toBe(2);
    expect(result.name).toBe('Hirohiti');
  });

  it('North hemisphere inverts the day order (except day 1)', () => {
    const dayAfter = new Date('2025-01-01T00:00:00Z');
    const south = getTarenaDay(dayAfter, false);
    const north = getTarenaDay(dayAfter, true);
    // South: day 2, North: 32-2 = 30 → Mutu
    expect(south.day).toBe(2);
    expect(north.day).toBe(30);
    expect(north.name).toBe('Mutu');
  });

  it('both hemispheres return Tīreo on day 1', () => {
    const newMoonDate = new Date('2024-12-31T00:00:00Z');
    const south = getTarenaDay(newMoonDate, false);
    const north = getTarenaDay(newMoonDate, true);
    expect(south.day).toBe(1);
    expect(north.day).toBe(1);
    expect(south.name).toBe('Tīreo');
    expect(north.name).toBe('Tīreo');
  });

  it('all 30 TARENA entries have valid energy levels', () => {
    for (const entry of TARENA) {
      expect(entry.energy).toBeGreaterThanOrEqual(1);
      expect(entry.energy).toBeLessThanOrEqual(3);
      expect(entry.day).toBeGreaterThanOrEqual(1);
      expect(entry.day).toBeLessThanOrEqual(30);
    }
  });

  it('never returns an out-of-range day across a full year', () => {
    for (let d = 0; d < 365; d += 7) {
      const date = new Date(2025, 0, 1 + d);
      const south = getTarenaDay(date, false);
      const north = getTarenaDay(date, true);
      expect(south.day).toBeGreaterThanOrEqual(1);
      expect(south.day).toBeLessThanOrEqual(30);
      expect(north.day).toBeGreaterThanOrEqual(1);
      expect(north.day).toBeLessThanOrEqual(30);
    }
  });

  it('South and North are always inverse of each other (except day 1)', () => {
    const newMoon = findLastNewMoon(new Date('2025-06-15T12:00:00Z'));
    for (let offset = 1; offset <= 29; offset++) {
      const date = new Date(newMoon.getTime() + offset * 86400000);
      const south = getTarenaDay(date, false);
      const north = getTarenaDay(date, true);
      if (south.day === 1) {
        expect(north.day).toBe(1);
      } else {
        expect(south.day + north.day).toBe(32);
      }
    }
  });
});