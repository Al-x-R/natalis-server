import { describe, expect, it } from 'vitest';
import { fixedOffsetToUtc, localToUtc, timezoneAt, TimeError } from '../src/time/localToUtc.js';

const code = (fn: () => unknown) => {
  try {
    fn();
  } catch (e) {
    return e instanceof TimeError ? e.code : String(e);
  }
  return 'NO_ERROR';
};

describe('timezoneAt', () => {
  it('finds IANA zones', () => {
    expect(timezoneAt(49.98, 36.25)).toBe('Europe/Kyiv');
    expect(timezoneAt(40.71, -74.0)).toBe('America/New_York');
  });
});

describe('localToUtc', () => {
  it('uses historical offsets (Kharkiv on Moscow summer time in May 1990)', () => {
    const r = localToUtc('1990-05-15', '14:30', 'Europe/Kyiv');
    expect(r.utc.toISOString()).toBe('1990-05-15T10:30:00.000Z');
    expect(r.offsetMinutes).toBe(240);
  });

  it('uses EET after Ukraine left Moscow time (1991-07-01)', () => {
    expect(localToUtc('1991-07-01', '12:00', 'Europe/Kyiv').utc.toISOString()).toBe('1991-07-01T09:00:00.000Z');
  });

  it('rejects a time inside the spring-forward gap', () => {
    expect(code(() => localToUtc('2021-03-28', '03:30', 'Europe/Kyiv'))).toBe('NONEXISTENT_LOCAL_TIME');
    expect(code(() => localToUtc('2021-03-14', '02:15', 'America/New_York'))).toBe('NONEXISTENT_LOCAL_TIME');
  });

  it('rejects an ambiguous fall-back time unless disambiguated', () => {
    expect(code(() => localToUtc('2021-10-31', '03:30', 'Europe/Kyiv'))).toBe('AMBIGUOUS_LOCAL_TIME');
    expect(localToUtc('2021-10-31', '03:30', 'Europe/Kyiv', 'earlier').utc.toISOString()).toBe('2021-10-31T00:30:00.000Z');
    expect(localToUtc('2021-10-31', '03:30', 'Europe/Kyiv', 'later').utc.toISOString()).toBe('2021-10-31T01:30:00.000Z');
  });

  it('accepts times right next to a transition', () => {
    expect(localToUtc('2021-03-28', '02:59', 'Europe/Kyiv').offsetMinutes).toBe(120);
    expect(localToUtc('2021-03-28', '04:00', 'Europe/Kyiv').offsetMinutes).toBe(180);
  });

  it('uses true local mean time before standard time (Ulm 1879)', () => {
    const r = localToUtc('1879-03-14', '11:30', 'Europe/Berlin', undefined, 9.9833);
    expect(r.lmt).toBe(true);
    expect(r.utc.toISOString()).toBe('1879-03-14T10:50:04.008Z');
  });

  it('rejects impossible calendar dates', () => {
    expect(code(() => localToUtc('2023-02-30', '12:00', 'Europe/Kyiv'))).toBe('INVALID_DATE');
    expect(code(() => localToUtc('2023-01-01', '24:00', 'Europe/Kyiv'))).toBe('INVALID_DATE');
  });

  it('keeps the pre-1970 history of zones that ICU merges into a neighbour', () => {
    // Netherlands: Amsterdam Time +0:19:32 (ICU serves Brussels: UTC+0).
    const ams = localToUtc('1930-01-15', '12:00', timezoneAt(52.37, 4.9), undefined, 4.9);
    expect(ams.lmt).toBe(false);
    expect(ams.utc.toISOString()).toBe('1930-01-15T11:40:28.000Z');
    // Iceland: UTC-1 until 1968 (ICU serves Abidjan: UTC+0).
    expect(localToUtc('1950-01-15', '12:00', timezoneAt(64.15, -21.94), undefined, -21.94).offsetMinutes).toBe(-60);
    // Same zones from 1970 on are unchanged.
    expect(localToUtc('1990-01-15', '12:00', 'Europe/Amsterdam', undefined, 4.9).offsetMinutes).toBe(60);
  });

  it('uses a national mean time where one was legal, not the town\'s own', () => {
    // France 1891–1911: Paris Mean Time (+0:09:21) everywhere, including Nice.
    const nice = localToUtc('1900-06-01', '12:00', 'Europe/Paris', undefined, 7.27);
    expect(nice.lmt).toBe(false);
    expect(nice.utc.toISOString()).toBe('1900-06-01T11:50:39.000Z');
    // ...but before 1891 Nice was on its own mean time.
    expect(localToUtc('1885-06-01', '12:00', 'Europe/Paris', undefined, 7.27).lmt).toBe(true);
    // Ireland 1880–1916: Dublin Mean Time (-0:25:21), including Cork.
    expect(localToUtc('1900-06-01', '12:00', 'Europe/Dublin', undefined, -8.47).utc.toISOString()).toBe('1900-06-01T12:25:21.000Z');
  });

  it('uses the town\'s own mean time in the Russian Empire (Kharkiv 1910)', () => {
    const r = localToUtc('1910-06-01', '12:00', 'Europe/Kyiv', undefined, 36.25);
    expect(r.lmt).toBe(true);
    expect(r.offsetMinutes).toBe(145);
    expect(localToUtc('1925-06-01', '12:00', 'Europe/Kyiv', undefined, 36.25).offsetMinutes).toBe(120);
  });

  it('keeps the calendar day of places that were across the date line (Alaska before 1867)', () => {
    const r = localToUtc('1860-06-01', '12:00', 'America/Juneau', undefined, -134.42);
    expect(r.lmt).toBe(true);
    expect(r.offsetMinutes).toBeCloseTo(-134.42 * 4 + 1440, 6);
  });

  it('converts with a fixed, user-supplied offset', () => {
    const r = fixedOffsetToUtc('1930-01-15', '12:00', 60);
    expect(r.utc.toISOString()).toBe('1930-01-15T11:00:00.000Z');
    expect(r.timezone).toBe('UTC+01:00');
    expect(code(() => fixedOffsetToUtc('2023-02-30', '12:00', 60))).toBe('INVALID_DATE');
  });
});
