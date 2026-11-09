import cors from '@fastify/cors';
import Fastify from 'fastify';
import { SwephEngine } from './astro/swephEngine.js';
import type { EphemerisEngine } from './astro/types.js';
import { chartRoutes } from './routes/chart.js';
import { geocodeRoutes } from './routes/geocode.js';

/**
 * AGPL-3.0 §13: everyone who uses this server over a network must be offered
 * its source. If you run a modified copy, point SOURCE_URL at *your* code.
 */
const SOURCE_URL = process.env.SOURCE_URL ?? 'https://github.com/Al-x-R/natalis-server';

export async function buildApp(opts: { engine?: EphemerisEngine; logger?: boolean } = {}) {
  const app = Fastify({ logger: opts.logger ?? false });
  const engine = opts.engine ?? new SwephEngine();

  await app.register(cors, { origin: true });
  app.get('/health', async () => ({ ok: true, engine: engine.name }));
  app.get('/source', async () => ({ license: 'AGPL-3.0-or-later', source: SOURCE_URL }));
  chartRoutes(app, engine);
  geocodeRoutes(app);
  return app;
}
