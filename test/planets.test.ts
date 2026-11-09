import { describe, expect, it } from 'vitest';
import { SwephEngine } from '../src/astro/swephEngine.js';
import { separation } from '../src/astro/zodiac.js';

/**
 * Expected values are independent of Swiss Ephemeris: NASA JPL Horizons,
 * geocentric (500@399), quantity 31 (observer ecliptic longitude of date),
 * fetched 2026-11-09. The first instant is Einstein's birth (Ulm, 11:30 LMT).
 */
const JPL: Record<string, Record<string, number>> = {
  '1879-03-14T10:50:00Z': { Sun: 353.5076637, Moon: 254.5258305, Mercury: 3.1438013, Venus: 16.9849259, Mars: 296.9141384, Jupiter: 327.4840206, Saturn: 4.1897343, Uranus: 151.2883841, Neptune: 37.8719007, Pluto: 54.7254747 },
  '1975-01-10T06:00:00Z': { Sun: 289.3625114, Moon: 264.8556369, Mercury: 302.1813434, Venus: 304.9806721, Mars: 261.6186253, Jupiter: 344.9483772, Saturn: 105.1110789, Uranus: 212.1419121, Neptune: 250.7341439, Pluto: 189.2558679 },
  '1990-05-15T10:30:00Z': { Sun: 54.3358312, Moon: 296.3903225, Mercury: 38.0201161, Venus: 12.747014, Mars: 348.2874178, Jupiter: 99.5299087, Saturn: 295.250455, Uranus: 279.1853981, Neptune: 284.3537882, Pluto: 226.1691189 },
  '2005-08-20T18:45:00Z': { Sun: 147.8331185, Moon: 342.530935, Mercury: 130.0671696, Venus: 184.3285065, Mars: 42.4237739, Jupiter: 196.4673478, Saturn: 124.4923681, Uranus: 339.2322345, Neptune: 315.8767047, Pluto: 261.866645 },
};
const TOLERANCE_ARCSEC = 5;

describe('planets vs JPL Horizons', () => {
  const engine = new SwephEngine();

  for (const [utc, expected] of Object.entries(JPL)) {
    it(`matches at ${utc}`, () => {
      const r = engine.compute({ utc: new Date(utc), lat: 50, lon: 30, houseSystem: 'P' });
      expect(r.ephemeris, r.warnings.join('; ')).toBe('swiss');
      for (const [name, longitude] of Object.entries(expected)) {
        const body = r.bodies.find((b) => b.name === name);
        expect(body, `${name} missing`).toBeDefined();
        const diff = separation(body!.longitude, longitude) * 3600;
        expect(diff, `${name}: off by ${diff.toFixed(2)}"`).toBeLessThanOrEqual(TOLERANCE_ARCSEC);
      }
    });
  }
});
