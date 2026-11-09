import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { IANAZone } from 'luxon';

/**
 * UTC offsets with full pre-1970 history.
 *
 * Node's ICU merges zones that agree since 1970 (Europe/Amsterdam is served
 * Europe/Brussels data, Atlantic/Reykjavik gets Africa/Abidjan), so before 1970
 * it is wrong for them. `tzdata/pre1970.json` is compiled from the IANA source
 * including `backzone` (`npm run tzdata:build`) and is used for every instant
 * before 1970; ICU answers from 1970 on, where the merged zones are identical.
 */

/** [start, UTC seconds (null = since forever), offset seconds, abbreviation] */
type Period = [number | null, number, string];

interface TzFile {
  version: string;
  /** A string value is an alias for another key. */
  zones: Record<string, Period[] | string>;
}

let cache: TzFile | undefined;

function data(): TzFile {
  if (!cache) {
    const here = dirname(fileURLToPath(import.meta.url));
    cache = JSON.parse(readFileSync(resolve(here, '../../tzdata/pre1970.json'), 'utf8')) as TzFile;
  }
  return cache;
}

function periodsOf(timezone: string): Period[] | undefined {
  const zones = data().zones;
  let entry = zones[timezone];
  if (typeof entry === 'string') entry = zones[entry];
  return typeof entry === 'string' ? undefined : entry;
}

export interface OffsetInfo {
  /** Minutes east of UTC; fractional for mean-time offsets such as +0:09:21. */
  offsetMinutes: number;
  /** tzdata abbreviation ("LMT", "PMT", "CET", …). Only known before 1970. */
  abbreviation?: string;
}

export function tzdataVersion(): string {
  return data().version;
}

export function isKnownZone(timezone: string): boolean {
  return IANAZone.isValidZone(timezone);
}

export function offsetAt(timezone: string, utcMs: number): OffsetInfo {
  if (utcMs < 0) {
    const periods = periodsOf(timezone);
    if (periods) {
      const sec = Math.floor(utcMs / 1000);
      let lo = 0;
      let hi = periods.length - 1;
      while (lo < hi) {
        const mid = (lo + hi + 1) >> 1;
        if ((periods[mid]![0] ?? -Infinity) <= sec) lo = mid;
        else hi = mid - 1;
      }
      const [, offset, abbreviation] = periods[lo]!;
      return { offsetMinutes: offset / 60, abbreviation };
    }
  }
  return { offsetMinutes: IANAZone.create(timezone).offset(utcMs) };
}
