import { describe, it, expect } from 'vitest';
import { findHuriama, buildTahitianYear, computeTahitianState } from '@/features/tahitian';
import { calendarToJD } from '@/core/time';

describe('findHuriama', () => {
  it('returns a JD for the northern hemisphere', () => {
    const jd = findHuriama(2024, 'N');
    expect(jd).toBeGreaterThan(2400000);
  });

  it('returns a JD for the southern hemisphere', () => {
    const jd = findHuriama(2024, 'S');
    expect(jd).toBeGreaterThan(2400000);
  });

  it('northern Huriama is near vernal equinox (March)', () => {
    const jd = findHuriama(2024, 'N');
    // Vernal equinox 2024 is ~March 20 → JD ~2460389
    // Huriama should be the new moon closest to that
    const marchEquinoxJD = calendarToJD(2024, 3, 20, 12, 0);
    // Should be within ~30 days of the equinox
    expect(Math.abs(jd - marchEquinoxJD)).toBeLessThan(30);
  });

  it('southern Huriama is near autumnal equinox (September)', () => {
    const jd = findHuriama(2024, 'S');
    const septEquinoxJD = calendarToJD(2024, 9, 22, 12, 0);
    expect(Math.abs(jd - septEquinoxJD)).toBeLessThan(30);
  });
});

describe('buildTahitianYear', () => {
  it('returns an array of months', () => {
    const huriamaJD = findHuriama(2024, 'N');
    const months = buildTahitianYear(huriamaJD, 'N');
    expect(months.length).toBeGreaterThanOrEqual(10);
  });

  it('months have valid start and end JDs', () => {
    const huriamaJD = findHuriama(2024, 'N');
    const months = buildTahitianYear(huriamaJD, 'N');
    for (const m of months) {
      expect(m.startJD).toBeGreaterThan(2400000);
      expect(m.endJD).toBeGreaterThan(m.startJD);
      expect(m.name).toBeTruthy();
    }
  });

  it('months are consecutive (no gaps)', () => {
    const huriamaJD = findHuriama(2024, 'N');
    const months = buildTahitianYear(huriamaJD, 'N');
    for (let i = 1; i < months.length; i++) {
      expect(months[i].startJD).toBeCloseTo(months[i - 1].endJD, 1);
    }
  });
});

describe('computeTahitianState', () => {
  it('returns months and current info for a valid JD', () => {
    const jd = calendarToJD(2024, 6, 15, 12, 0);
    const state = computeTahitianState(jd, 'S');
    expect(state.months.length).toBeGreaterThan(0);
    if (state.current) {
      expect(state.current.month.name).toBeTruthy();
      expect(state.current.dayInMonth).toBeGreaterThanOrEqual(1);
    }
  });

  it('handles both hemispheres', () => {
    const jd = calendarToJD(2024, 6, 15, 12, 0);
    const stateN = computeTahitianState(jd, 'N');
    const stateS = computeTahitianState(jd, 'S');
    expect(stateN.months.length).toBeGreaterThan(0);
    expect(stateS.months.length).toBeGreaterThan(0);
  });
});
