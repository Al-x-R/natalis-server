import { find as findTimezones } from 'geo-tz/all';
import { isKnownZone, offsetAt } from './tzHistory.js';

export type Disambiguation = 'earlier' | 'later';

export class TimeError extends Error {
  constructor(
    readonly code:
      | 'INVALID_DATE'
      | 'DATE_OUT_OF_RANGE'
      | 'TIMEZONE_NOT_FOUND'
      | 'NONEXISTENT_LOCAL_TIME'
      | 'AMBIGUOUS_LOCAL_TIME',
    message: string,
    readonly details?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export interface ResolvedTime {
  timezone: string;
  utc: Date;
  /** UTC offset in minutes at the birth moment, e.g. 180 for UTC+3. Fractional for mean times. */
  offsetMinutes: number;
  /** Local time with offset (rounded to the minute), e.g. 1985-04-12T14:30:00.000+04:00 */
  local: string;
  /** True when the date predates standard time and true local mean time (from longitude) was used. */
  lmt: boolean;
}

/**
 * `geo-tz/all` keeps zones that were merged after 1970 (Europe/Amsterdam,
 * Atlantic/Reykjavik, …); their pre-1970 offsets come from `tzHistory`.
 */
export function timezoneAt(lat: number, lon: number): string {
  const zones = findTimezones(lat, lon);
  const tz = zones[0];
  if (!tz) throw new TimeError('TIMEZONE_NOT_FOUND', `No timezone found for ${lat}, ${lon}`);
  return tz;
}

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const DAY = 86_400_000;

/** Wall clock read as if it were UTC, in ms. The real instant is `naive - offset`. */
function parseWallClock(date: string, time: string): number {
  const dm = DATE_RE.exec(date);
  const tm = TIME_RE.exec(time);
  if (!dm || !tm) throw new TimeError('INVALID_DATE', 'Expected date "YYYY-MM-DD" and time "HH:mm"');
  const [y, mo, d] = [Number(dm[1]), Number(dm[2]), Number(dm[3])];
  const [h, mi] = [Number(tm[1]), Number(tm[2])];

  const naive = new Date(0);
  naive.setUTCFullYear(y, mo - 1, d); // unlike Date.UTC, doesn't map years 0..99 to 19xx
  naive.setUTCHours(h, mi, 0, 0);
  // Reject impossible dates (2023-02-30) and times (24:00) instead of rolling them over.
  const ok =
    h <= 23 &&
    mi <= 59 &&
    naive.getUTCFullYear() === y &&
    naive.getUTCMonth() === mo - 1 &&
    naive.getUTCDate() === d;
  if (!ok) throw new TimeError('INVALID_DATE', `Invalid date/time: ${date} ${time}`);
  return naive.getTime();
}

/** Convert a wall-clock time at a known, fixed UTC offset (user override). */
export function fixedOffsetToUtc(date: string, time: string, offsetMinutes: number): ResolvedTime {
  const naive = parseWallClock(date, time);
  return {
    timezone: `UTC${fmtOffset(offsetMinutes)}`,
    utc: new Date(Math.round(naive - offsetMinutes * 60_000)),
    offsetMinutes,
    local: `${date}T${time}:00.000${fmtOffset(offsetMinutes)}`,
    lmt: false,
  };
}

/**
 * Convert a wall-clock time in `timezone` to UTC, rejecting times that never
 * happened (spring-forward gap) and asking for disambiguation of times that
 * happened twice (fall-back overlap).
 *
 * With `lon`, dates before the place adopted a common civil time use the
 * birthplace's own local mean time.
 */
export function localToUtc(
  date: string,
  time: string,
  timezone: string,
  disambiguation?: Disambiguation,
  lon?: number,
): ResolvedTime {
  const naive = parseWallClock(date, time);
  if (!isKnownZone(timezone)) throw new TimeError('TIMEZONE_NOT_FOUND', `Unknown timezone: ${timezone}`);
  const offset = (ms: number) => offsetAt(timezone, ms).offsetMinutes;

  if (lon !== undefined) {
    const lmtOffset = localMeanOffset(timezone, naive, lon);
    if (lmtOffset !== undefined) {
      return {
        timezone,
        utc: new Date(Math.round(naive - lmtOffset * 60_000)),
        offsetMinutes: lmtOffset,
        local: `${date}T${time}:00.000${fmtOffset(lmtOffset)}`,
        lmt: true,
      };
    }
  }

  const before = offset(naive - DAY);
  const after = offset(naive + DAY);
  const valid = [...new Set([before, offset(naive), after])]
    .map((o) => ({ offset: o, utc: Math.round(naive - o * 60_000) }))
    .filter((c) => offset(c.utc) === c.offset)
    .sort((a, b) => a.utc - b.utc);

  if (valid.length === 0) {
    throw new TimeError(
      'NONEXISTENT_LOCAL_TIME',
      `${date} ${time} does not exist in ${timezone}: clocks were moved forward (UTC${fmtOffset(before)} → UTC${fmtOffset(after)}).`,
      { timezone, offsetBefore: before, offsetAfter: after },
    );
  }

  let chosen = valid[0]!;
  if (valid.length > 1) {
    if (!disambiguation) {
      throw new TimeError(
        'AMBIGUOUS_LOCAL_TIME',
        `${date} ${time} occurred twice in ${timezone} (clocks were moved back). ` +
          `Pass "disambiguation": "earlier" (UTC${fmtOffset(valid[0]!.offset)}) or "later" (UTC${fmtOffset(valid[valid.length - 1]!.offset)}).`,
        {
          timezone,
          options: valid.map((v, i) => ({
            disambiguation: i === 0 ? 'earlier' : 'later',
            utc: new Date(v.utc).toISOString(),
            offsetMinutes: v.offset,
          })),
        },
      );
    }
    chosen = disambiguation === 'earlier' ? valid[0]! : valid[valid.length - 1]!;
  }

  return {
    timezone,
    utc: new Date(chosen.utc),
    offsetMinutes: chosen.offset,
    local: `${date}T${time}:00.000${fmtOffset(chosen.offset)}`,
    lmt: false,
  };
}

/**
 * Zones whose tzdata history starts with a *city* mean time that was never a
 * common civil time for the whole zone: in the Russian Empire each town kept
 * its own local time (railways ran on St. Petersburg time), so e.g. Kharkiv in
 * 1910 was not on "Kyiv Mean Time". Those periods are treated like LMT.
 *
 * Everywhere else a named mean time is taken at face value: Paris Mean Time
 * was legal time in all of France 1891–1911, Dublin Mean Time in all of
 * Ireland 1880–1916, and so on.
 */
const CITY_MEAN_TIME: Record<string, string> = {
  'Europe/Kyiv': 'KMT',
  'Europe/Kiev': 'KMT',
  'Europe/Moscow': 'MMT',
  'Europe/Simferopol': 'SMT',
  'Europe/Minsk': 'MMT',
  'Europe/Chisinau': 'CMT',
  'Europe/Riga': 'RMT',
  'Europe/Tallinn': 'TMT',
  'Europe/Vilnius': 'WMT',
  'Asia/Tbilisi': 'TBMT',
};

/**
 * The birthplace's own mean-time offset (longitude × 4 min) if `naive` falls
 * before the zone had a common civil time, else undefined.
 *
 * tzdata's "LMT" is the mean time of the zone's reference city only
 * (Europe/Berlin = +0:53:28 even for Ulm), hence the longitude.
 */
function localMeanOffset(timezone: string, naive: number, lon: number): number | undefined {
  let own = lon * 4; // minutes; 15° per hour
  const at = offsetAt(timezone, Math.round(naive - own * 60_000));
  const isLocal = at.abbreviation === 'LMT' || (at.abbreviation !== undefined && at.abbreviation === CITY_MEAN_TIME[timezone]);
  if (!isLocal) return undefined;
  // Places that used to be on the other side of the date line (Alaska before
  // 1867, the Philippines before 1845) kept a calendar one day off.
  own += Math.round((at.offsetMinutes - own) / 1440) * 1440;
  return own;
}

function fmtOffset(m: number): string {
  const abs = Math.round(Math.abs(m));
  return `${m < 0 ? '-' : '+'}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}
