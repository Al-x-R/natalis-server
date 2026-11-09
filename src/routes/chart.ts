import type { FastifyInstance } from 'fastify';
import { buildChart } from '../astro/chart.js';
import type { EphemerisEngine, HouseSystem } from '../astro/types.js';
import { fixedOffsetToUtc, localToUtc, timezoneAt, TimeError, type Disambiguation } from '../time/localToUtc.js';

interface ChartBody {
  date: string;
  time: string;
  lat: number;
  lon: number;
  houseSystem?: HouseSystem;
  /** Override geo-tz lookup, e.g. for births at sea or disputed areas. */
  timezone?: string;
  /**
   * Skip the zone lookup entirely and use this UTC offset (minutes east).
   * For places where tzdata is known to be wrong for the birth date.
   */
  utcOffsetMinutes?: number;
  disambiguation?: Disambiguation;
}

/** Range of the bundled Swiss Ephemeris files (sepl_18 / semo_18 / seas_18). */
const MIN_YEAR = 1800;
const MAX_YEAR = 2399;

const bodySchema = {
  type: 'object',
  required: ['date', 'time', 'lat', 'lon'],
  additionalProperties: false,
  properties: {
    date: { type: 'string', pattern: '^\\d{4}-\\d{2}-\\d{2}$' },
    time: { type: 'string', pattern: '^\\d{2}:\\d{2}$' },
    lat: { type: 'number', minimum: -90, maximum: 90 },
    lon: { type: 'number', minimum: -180, maximum: 180 },
    houseSystem: { type: 'string', enum: ['P', 'K', 'O', 'R', 'C', 'E', 'W', 'B', 'M', 'A'], default: 'P' },
    timezone: { type: 'string' },
    utcOffsetMinutes: { type: 'number', minimum: -960, maximum: 960 },
    disambiguation: { type: 'string', enum: ['earlier', 'later'] },
  },
} as const;

export function chartRoutes(app: FastifyInstance, engine: EphemerisEngine) {
  app.post<{ Body: ChartBody }>('/chart', { schema: { body: bodySchema } }, async (req, reply) => {
    const { date, time, lat, lon, houseSystem = 'P', disambiguation, utcOffsetMinutes } = req.body;
    try {
      const year = Number(date.slice(0, 4));
      if (year < MIN_YEAR || year > MAX_YEAR) {
        throw new TimeError('DATE_OUT_OF_RANGE', `Supported years: ${MIN_YEAR}–${MAX_YEAR}`, { minYear: MIN_YEAR, maxYear: MAX_YEAR });
      }
      const resolved =
        utcOffsetMinutes !== undefined
          ? fixedOffsetToUtc(date, time, utcOffsetMinutes)
          : localToUtc(date, time, req.body.timezone ?? timezoneAt(lat, lon), disambiguation, lon);
      const chart = buildChart(engine, { utc: resolved.utc, lat, lon, houseSystem });
      return {
        input: { date, time, lat, lon, houseSystem },
        timezone: resolved.timezone,
        utcOffsetMinutes: resolved.offsetMinutes,
        localTime: resolved.local,
        utc: resolved.utc.toISOString(),
        localMeanTime: resolved.lmt,
        manualOffset: utcOffsetMinutes !== undefined,
        ...chart,
      };
    } catch (err) {
      if (err instanceof TimeError) {
        return reply.code(422).send({ error: err.code, message: err.message, details: err.details });
      }
      if (err instanceof Error && err.message.startsWith('House calculation failed')) {
        return reply.code(422).send({ error: 'HOUSES_UNDEFINED', message: err.message });
      }
      throw err;
    }
  });
}
