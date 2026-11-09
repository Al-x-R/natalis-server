import type { FastifyInstance } from 'fastify';
import { geocode } from '../geocode/openMeteo.js';

interface GeocodeQuery {
  q: string;
  lang?: string;
  count?: number;
}

export function geocodeRoutes(app: FastifyInstance) {
  app.get<{ Querystring: GeocodeQuery }>(
    '/geocode',
    {
      schema: {
        querystring: {
          type: 'object',
          required: ['q'],
          properties: {
            q: { type: 'string', minLength: 2, maxLength: 100 },
            lang: { type: 'string', pattern: '^[a-z]{2}$', default: 'ru' },
            count: { type: 'integer', minimum: 1, maximum: 20, default: 10 },
          },
        },
      },
    },
    async (req, reply) => {
      try {
        return await geocode(req.query.q, { language: req.query.lang, count: req.query.count });
      } catch (err) {
        req.log.error(err);
        return reply.code(502).send({ error: 'GEOCODER_UNAVAILABLE', message: 'City search is temporarily unavailable' });
      }
    },
  );
}
