import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { separation, SIGNS } from '../src/astro/zodiac.js';

interface Reference {
  todo?: boolean;
  label: string;
  /** Overrides the file-wide tolerance, e.g. for values given to the arcsecond. */
  toleranceArcmin?: number;
  input: Record<string, unknown>;
  expected: {
    utc?: string;
    planets: Record<string, string>;
    asc?: string;
    mc?: string;
    houses?: string[];
  };
}

const fixtures = JSON.parse(readFileSync(new URL('./fixtures/reference-charts.json', import.meta.url), 'utf8')) as {
  toleranceArcmin: number;
  charts: Reference[];
};

/** "23°30' Pisces" / "23°30'12\" Pis" → absolute longitude. */
function parsePosition(s: string): number {
  const m = /^\s*(\d+)°\s*(\d+)'?\s*(?:(\d+(?:\.\d+)?)")?\s*([A-Za-z]+)\s*$/.exec(s);
  if (!m) throw new Error(`Cannot parse position "${s}"`);
  const sign = SIGNS.findIndex((x) => x.toLowerCase().startsWith(m[4]!.toLowerCase().slice(0, 3)));
  if (sign < 0) throw new Error(`Unknown sign in "${s}"`);
  return sign * 30 + Number(m[1]) + Number(m[2]) / 60 + Number(m[3] ?? 0) / 3600;
}

let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  app = await buildApp();
});
afterAll(() => app.close());

const post = async (payload: Record<string, unknown>) => {
  const res = await app.inject({ method: 'POST', url: '/chart', payload });
  return { status: res.statusCode, body: res.json() };
};

describe('GET /source', () => {
  it('offers the server source (AGPL §13)', async () => {
    const body = (await app.inject({ method: 'GET', url: '/source' })).json();
    expect(body.license).toBe('AGPL-3.0-or-later');
    expect(body.source).toMatch(/^https:\/\//);
  });
});

describe('POST /chart (smoke)', () => {
  it('returns a full chart', async () => {
    const { status, body } = await post({ date: '1990-05-15', time: '14:30', lat: 49.98, lon: 36.25 });
    expect(status).toBe(200);
    expect(body.timezone).toBe('Europe/Kyiv');
    expect(body.utc).toBe('1990-05-15T10:30:00.000Z');
    expect(body.houses).toHaveLength(12);
    expect(body.ephemeris).toBe('swiss');
    expect(body.planets.map((p: { name: string }) => p.name)).toContain('Chiron');
    expect(body.planets.find((p: { name: string }) => p.name === 'TrueNode').retrograde).toBe(true);
    for (const p of body.planets) {
      expect(p.house).toBeGreaterThanOrEqual(1);
      expect(p.house).toBeLessThanOrEqual(12);
    }
    expect(body.angles.asc.longitude).toBeCloseTo(body.houses[0].cusp, 6);
  });

  it('returns 422 for DST gaps and overlaps', async () => {
    expect((await post({ date: '2021-03-28', time: '03:30', lat: 50.45, lon: 30.52 })).body.error).toBe('NONEXISTENT_LOCAL_TIME');
    expect((await post({ date: '2021-10-31', time: '03:30', lat: 50.45, lon: 30.52 })).body.error).toBe('AMBIGUOUS_LOCAL_TIME');
  });

  it('accepts a manual UTC offset instead of the zone lookup', async () => {
    // Lviv 1930 was on Polish time (CET); tzdata only knows Kyiv's history.
    const { status, body } = await post({ date: '1930-01-15', time: '12:00', lat: 49.84, lon: 24.03, utcOffsetMinutes: 60 });
    expect(status).toBe(200);
    expect(body.utc).toBe('1930-01-15T11:00:00.000Z');
    expect(body.manualOffset).toBe(true);
    expect(body.timezone).toBe('UTC+01:00');
  });

  it('rejects years outside the ephemeris files', async () => {
    expect((await post({ date: '1750-06-01', time: '12:00', lat: 51.5, lon: -0.12 })).body.error).toBe('DATE_OUT_OF_RANGE');
    expect((await post({ date: '2450-06-01', time: '12:00', lat: 51.5, lon: -0.12 })).body.error).toBe('DATE_OUT_OF_RANGE');
  });

  it('returns 400 for malformed input', async () => {
    expect((await post({ date: '15.05.1990', time: '14:30', lat: 49.98, lon: 36.25 })).status).toBe(400);
  });
});

describe('reference charts (astro.com)', () => {
  for (const ref of fixtures.charts) {
    it.skipIf(ref.todo)(ref.label, async () => {
      const { status, body } = await post(ref.input);
      expect(status, JSON.stringify(body)).toBe(200);
      if (ref.expected.utc) expect(body.utc).toBe(ref.expected.utc);
      const tolerance = ref.toleranceArcmin ?? fixtures.toleranceArcmin;

      const check = (what: string, actual: number | undefined, expected: string) => {
        if (!expected) return;
        expect(actual, `${what} missing`).toBeTypeOf('number');
        const diff = separation(actual!, parsePosition(expected)) * 60;
        expect(diff, `${what}: off by ${diff.toFixed(2)}'`).toBeLessThanOrEqual(tolerance);
      };

      for (const [name, pos] of Object.entries(ref.expected.planets)) {
        check(name, body.planets.find((p: { name: string }) => p.name === name)?.longitude, pos);
      }
      check('ASC', body.angles.asc.longitude, ref.expected.asc ?? '');
      check('MC', body.angles.mc.longitude, ref.expected.mc ?? '');
      ref.expected.houses?.forEach((h, i) => check(`House ${i + 1}`, body.houses[i]?.cusp, h));
    });
  }
});
