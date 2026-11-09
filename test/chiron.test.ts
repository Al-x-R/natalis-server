import { describe, expect, it } from 'vitest';
import { SwephEngine } from '../src/astro/swephEngine.js';
import { separation } from '../src/astro/zodiac.js';

/**
 * Chiron needs seas_18.se1 (`npm run ephe:download`, also run on `npm install`).
 * Expected values are independent of Swiss Ephemeris: NASA JPL Horizons, target
 * 2060 Chiron, geocentric, quantity 31 (observer ecliptic longitude of date).
 */
const JPL_CHIRON: { utc: string; longitude: number }[] = [
  { utc: '1975-01-10T06:00:00Z', longitude: 19.9951608 },
  { utc: '1990-05-15T10:30:00Z', longitude: 103.2074179 },
  { utc: '2005-08-20T18:45:00Z', longitude: 298.9654352 },
];
const TOLERANCE_ARCMIN = 1;

describe('Chiron (ephemeris files)', () => {
  const engine = new SwephEngine();

  for (const { utc, longitude } of JPL_CHIRON) {
    it(`matches JPL Horizons at ${utc}`, () => {
      const r = engine.compute({ utc: new Date(utc), lat: 50, lon: 30, houseSystem: 'P' });
      expect(r.ephemeris, r.warnings.join('; ')).toBe('swiss');
      const chiron = r.bodies.find((b) => b.name === 'Chiron');
      expect(chiron, `Chiron missing: ${r.warnings.join('; ')}`).toBeDefined();
      const diff = separation(chiron!.longitude, longitude) * 60;
      expect(diff, `off by ${diff.toFixed(2)}'`).toBeLessThanOrEqual(TOLERANCE_ARCMIN);
    });
  }
});
