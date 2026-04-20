import {
  ENOCH_OUT_OF_TIME_START,
  MINUTES_PER_DAY,
  JULIAN_UNIX_EPOCH,
  MS_PER_DAY,
  JS_DATE_MAX_MS,
  MONTH_NAMES_FR,
} from '@/core/constants';
import {
  jdToCalendar,
  jdToJulianDisplayString,
  getTzOffsetMinutes,
  getMonthInTz,
  formatAstroYear,
} from '@/core/time';
import { computeEnochState } from '@/features/enoch';
import { computeHebrewFromJD } from '@/features/hebrew';
import type { EnochDeps } from '@/core/types';
import {
  computeLST,
  computeSunHA,
  computeLAST,
  computeEOT,
  formatSolarTime,
  formatEOT,
  getCachedSolarNoon,
  formatCivilTimeInTz,
  computeMoonHA,
  computeLunarTime,
  computeLunarShift,
  getCachedLunarTransit,
} from '@/core/solar-time';
import { gmstFromJD } from '@/core/astronomy';
import type { CalendarSnapshot, GregorianDate } from '@/core/types';
export type { CalendarSnapshot } from '@/core/types';
export type { GregorianDate } from '@/core/types';

// Cached Intl.DateTimeFormat for local date string — avoids 1-5ms ICU lookup per call
let _localDateFmt: Intl.DateTimeFormat | null = null;
let _localDateFmtKey = '';

function getLocalDateFmt(tz: string): Intl.DateTimeFormat {
  if (tz !== _localDateFmtKey || !_localDateFmt) {
    _localDateFmt = new Intl.DateTimeFormat('fr-FR', {
      timeZone: tz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      era: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    _localDateFmtKey = tz;
  }
  return _localDateFmt;
}

interface CacheEntry {
  jd: number;
  tz: string;
  hem: 'N' | 'S';
  snapshot: CalendarSnapshot;
}

/**
 * Service for computing calendar snapshots with caching.
 * Handles Gregorian, Julian, Enoch, and Hebrew calendars.
 */
export class TimeService {
  private _cache: CacheEntry | null = null;
  private _prevLocalDay: number = NaN;

  // Separate cache for the expensive Intl.DateTimeFormat local date string.
  // This is the slowest per-frame call on mobile (1-5ms). The displayed time
  // only changes once per minute (format is HH:MM, no seconds), so we cache
  // by minute. The main snapshot cache stays at exact-jd granularity.
  private _localDateStrKey = -1;
  private _localDateStrCache = '';

  /**
   * Returns a cached calendar snapshot for the given parameters.
   *
   * @param jd - Julian Date
   * @param userTz - User's IANA timezone
   * @param enochHem - Enoch hemisphere ('N' or 'S')
   * @param sunEclLon - Sun's ecliptic longitude
   * @param sunRA - Sun's right ascension in hours (for solar time computation)
   * @param longitudeDeg - Observer longitude in degrees East
   * @param longitudeApprox - Whether the longitude is approximate (derived from offset)
   * @param latitudeDeg - Observer latitude in degrees
   * @param moonRA - Moon's right ascension in hours (for lunar time computation)
   * @returns Calendar snapshot with all calendars
   */
  getSnapshot(
    jd: number,
    userTz: string,
    enochHem: 'N' | 'S',
    sunEclLon: number,
    sunRA?: number,
    longitudeDeg?: number,
    longitudeApprox?: boolean,
    latitudeDeg?: number,
    moonRA?: number,
  ): CalendarSnapshot {
    // Round jd to minute precision for cache key — display only changes per minute
    const jdKey = Math.floor(jd * 1440) / 1440;
    const cachedHasSolar = this._cache?.snapshot.solar.lastHours === this._cache?.snapshot.solar.lastHours; // NaN check
    const cacheHit = this._cache
      && this._cache.jd === jdKey
      && this._cache.tz === userTz
      && this._cache.hem === enochHem
      && (sunRA === undefined || cachedHasSolar);
    if (cacheHit && this._cache) {
      return this._cache.snapshot;
    }

    const snap = this._computeSnapshot(jd, userTz, enochHem, sunEclLon, sunRA, longitudeDeg, longitudeApprox, latitudeDeg, moonRA);
    this._cache = { jd: jdKey, tz: userTz, hem: enochHem, snapshot: snap };
    return snap;
  }

  private _computeSnapshot(
    jd: number,
    userTz: string,
    enochHem: 'N' | 'S',
    sunEclLon: number,
    sunRA?: number,
    longitudeDeg?: number,
    longitudeApprox?: boolean,
    latitudeDeg?: number,
    moonRA?: number,
  ): CalendarSnapshot {
    // ── Timezone offset ─────────────────────────────────────────────
    const ms = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
    const inRange = ms > -JS_DATE_MAX_MS && ms < JS_DATE_MAX_MS;
    let tzOffsetMinutes = 0;
    if (inRange) {
      tzOffsetMinutes = getTzOffsetMinutes(new Date(ms), userTz);
    }

    const offsetDays = tzOffsetMinutes / MINUTES_PER_DAY;
    const jdLocal = jd - offsetDays;

    // ── Gregorian UTC ───────────────────────────────────────────────
    const gregorianUTC = jdToCalendar(jd);

    // ── Gregorian local ─────────────────────────────────────────────
    // Use jdLocal directly to get correct local date AND time (hours/mins).
    // jdToCalendar extracts year/month/day/hours/mins from the JD.
    let gregorian: GregorianDate;
    if (inRange) {
      gregorian = jdToCalendar(jdLocal);
    } else {
      gregorian = gregorianUTC;
    }

    // ── Local date string ───────────────────────────────────────────
    // Intl.DateTimeFormat.formatToParts() is the slowest per-frame call on mobile.
    // Cache by minute — the displayed format (HH:MM) only changes once per minute.
    let localDateString: string;
    const minuteKey = inRange ? Math.floor(jd * 1440) : -1;
    if (inRange && minuteKey === this._localDateStrKey) {
      localDateString = this._localDateStrCache;
    } else if (inRange) {
      try {
        const d = new Date(ms);
        const parts = getLocalDateFmt(userTz).formatToParts(d);
        const p: Record<string, string> = {};
        parts.forEach(({ type, value }) => { p[type] = value; });
        const localMonth = getMonthInTz(d, userTz);
        const isBCE = p.era === 'av. J.-C.';
        const localYear = isBCE ? 1 - parseInt(p.year ?? '0') : parseInt(p.year ?? '0');
        const localDay = parseInt(p.day ?? '0');
        const localHour = (p.hour ?? '00').replace(':', '').padStart(2, '0').slice(0, 2);
        const localMin = (p.minute ?? '00').replace(':', '').padStart(2, '0').slice(0, 2);
        const yearStr = formatAstroYear(localYear);
        localDateString = `${String(localDay).padStart(2, '0')} ${MONTH_NAMES_FR[localMonth]} ${yearStr} ${localHour}:${localMin}`;
      } catch {
        const yearStr = formatAstroYear(gregorian.year);
        localDateString = `${String(gregorian.day).padStart(2, '0')} ${MONTH_NAMES_FR[gregorian.month]} ${yearStr} ${String(gregorian.hours).padStart(2, '0')}:${String(gregorian.mins).padStart(2, '0')}`;
      }
      this._localDateStrKey = minuteKey;
      this._localDateStrCache = localDateString;
    } else {
      const yearStr = formatAstroYear(gregorianUTC.year);
      localDateString = `${String(gregorianUTC.day).padStart(2, '0')} ${MONTH_NAMES_FR[gregorianUTC.month]} ${yearStr} ${String(gregorianUTC.hours).padStart(2, '0')}:${String(gregorianUTC.mins).padStart(2, '0')}`;
    }

    // ── Julian display string ───────────────────────────────────────
    // Use jdLocal so the Julian calendar display matches the local date
    const julianDisplayString = jdToJulianDisplayString(jdLocal);

    // ── Enoch calendar ──────────────────────────────────────────────
    const enochInput: EnochDeps = {
      currentJD: jd,
      currentTime: new Date(),
      currentSunEclLon: sunEclLon,
      enochHem,
      userTimezone: userTz,
      getAstroJD: () => jd,
      panX: 0, panY: 0, zoomK: 1,
      needsRedraw: false,
    };
    const enochData = computeEnochState(enochInput);
    const isOutOfTime = enochData.curDay >= ENOCH_OUT_OF_TIME_START;
    const outOfTimeDay = isOutOfTime ? enochData.curDay - ENOCH_OUT_OF_TIME_START + 1 : null;
    const enochLabelText = isOutOfTime
      ? `Jour ${outOfTimeDay} hors du temps`
      : `Jour ${enochData.dayInMonth} · Mois ${enochData.currentMonthIdx + 1} (Hénoch)`;

    // ── Hebrew calendar ─────────────────────────────────────────────
    const hb = computeHebrewFromJD(jd, 0, undefined, undefined, userTz);
    const hebrewLabelText = `Jour ${hb.day} · Mois ${hb.month}`;

    // ── Midnight transition detection ───────────────────────────────
    const currLocalDay = Math.floor(jdLocal + 0.5);
    const isMidnightTransition = !isNaN(this._prevLocalDay) && currLocalDay !== this._prevLocalDay;
    this._prevLocalDay = currLocalDay;

    // ── Solar time ──────────────────────────────────────────────────
    let solar: CalendarSnapshot['solar'];
    const lng = longitudeDeg ?? 0;
    const lat = latitudeDeg ?? 0;
    const approx = longitudeApprox ?? true;

    if (sunRA !== undefined) {
      const gmst = gmstFromJD(jd);
      const lst = computeLST(gmst, lng);
      const sunHA = computeSunHA(lst, sunRA);
      const lastHours = computeLAST(sunHA);
      const utcFracDay = (jd % 1 + 1) % 1;
      // JD epoch starts at noon: fraction 0 = 12:00 UTC, 0.5 = 00:00 UTC.
      // Convert to hours since midnight UTC.
      const utcHours = ((utcFracDay + 0.5) % 1) * 24;
      const eotMinutes = computeEOT(lastHours, utcHours, lng);
      const lastFormatted = formatSolarTime(lastHours);
      const eotFormatted = formatEOT(eotMinutes);

      let solarNoonLocalTime = '--h --';
      if (inRange) {
        const noonDate = getCachedSolarNoon(jd, tzOffsetMinutes, lng, lat);
        if (noonDate) {
          solarNoonLocalTime = formatCivilTimeInTz(noonDate, userTz);
        }
      }

      solar = {
        lastHours,
        lastFormatted,
        eotMinutes,
        eotFormatted,
        solarNoonLocalTime,
        longitude: lng,
        longitudeApprox: approx,
      };
    } else {
      solar = {
        lastHours: NaN,
        lastFormatted: '--h --',
        eotMinutes: NaN,
        eotFormatted: '--',
        solarNoonLocalTime: '--h --',
        longitude: lng,
        longitudeApprox: approx,
      };
    }

    // ── Lunar time ─────────────────────────────────────────────────
    let lunar: CalendarSnapshot['lunar'];

    if (moonRA !== undefined) {
      const gmst = gmstFromJD(jd);
      const lst = computeLST(gmst, lng);
      const moonHA = computeMoonHA(lst, moonRA);
      const lunarTimeHours = computeLunarTime(moonHA);
      const lunarTimeFormatted = formatSolarTime(lunarTimeHours);

      let lunarTransitLocalTime = '--h --';
      let lunarShiftMinutes = NaN;
      if (inRange) {
        const { transit, prevTransit } = getCachedLunarTransit(jd, tzOffsetMinutes, lng, lat);
        if (transit) {
          lunarTransitLocalTime = formatCivilTimeInTz(transit, userTz);
        }
        if (transit && prevTransit) {
          const todayH = transit.getHours() + transit.getMinutes() / 60;
          const yesterdayH = prevTransit.getHours() + prevTransit.getMinutes() / 60;
          lunarShiftMinutes = computeLunarShift(todayH, yesterdayH);
        }
      }

      lunar = {
        lunarTimeHours,
        lunarTimeFormatted,
        lunarTransitLocalTime,
        lunarShiftMinutes: isNaN(lunarShiftMinutes) ? 0 : lunarShiftMinutes,
      };
    } else {
      lunar = {
        lunarTimeHours: NaN,
        lunarTimeFormatted: '--h --',
        lunarTransitLocalTime: '--h --',
        lunarShiftMinutes: 0,
      };
    }

    return {
      canonicalJD: enochData.jdForLabel,
      gregorian,
      gregorianUTC,
      localDateString,
      julianDisplayString,
      enoch: {
        preciseDay: enochData.preciseDay,
        curDay: enochData.curDay,
        currentMonthIdx: enochData.currentMonthIdx,
        dayInMonth: enochData.dayInMonth,
        isOutOfTime,
        outOfTimeDay,
        labelText: enochLabelText,
        monthOffsets: enochData.offs,
      },
      hebrew: {
        day: hb.day,
        month: hb.month,
        monthName: hb.monthName,
        hebrewYear: hb.hebrewYear,
        labelText: hebrewLabelText,
      },
      tzOffsetMinutes,
      userTimezone: userTz,
      isMidnightTransition,
      solar,
      lunar,
    };
  }

  /**
   * Detects if a midnight transition occurred between two Julian Dates.
   *
   * @param prevJD - Previous Julian Date
   * @param currJD - Current Julian Date
   * @param userTz - User's timezone
   * @returns True if local midnight was crossed
   */
  detectMidnightTransition(prevJD: number, currJD: number, userTz: string): boolean {
    const jdToLocal = (jd: number): number => {
      const ms = (jd - JULIAN_UNIX_EPOCH) * MS_PER_DAY;
      if (ms > -JS_DATE_MAX_MS && ms < JS_DATE_MAX_MS) {
        const tzOff = getTzOffsetMinutes(new Date(ms), userTz);
        return jd - tzOff / MINUTES_PER_DAY;
      }
      return jd;
    };
    const prevLocal = jdToLocal(prevJD);
    const currLocal = jdToLocal(currJD);
    return Math.floor(prevLocal + 0.5) !== Math.floor(currLocal + 0.5);
  }

  /**
   * Invalidates the cache.
   */
  invalidate(): void {
    this._cache = null;
    this._prevLocalDay = NaN;
    this._localDateStrKey = -1;
  }
}
