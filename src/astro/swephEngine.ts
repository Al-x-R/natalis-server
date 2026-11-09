import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import sweph from 'sweph';
import type { BodyName, EngineResult, EphemerisEngine, HouseSystem, RawBodyPosition } from './types.js';

const C = sweph.constants;

const BODY_IDS: Record<BodyName, number> = {
  Sun: C.SE_SUN,
  Moon: C.SE_MOON,
  Mercury: C.SE_MERCURY,
  Venus: C.SE_VENUS,
  Mars: C.SE_MARS,
  Jupiter: C.SE_JUPITER,
  Saturn: C.SE_SATURN,
  Uranus: C.SE_URANUS,
  Neptune: C.SE_NEPTUNE,
  Pluto: C.SE_PLUTO,
  TrueNode: C.SE_TRUE_NODE,
  Chiron: C.SE_CHIRON,
};

/** Data files needed for full precision: planets, Moon, and asteroids (Chiron). */
export const EPHE_FILES = ['sepl_18.se1', 'semo_18.se1', 'seas_18.se1'] as const;

/** EPHE_PATH env var, otherwise `<server>/ephe` (populated by `npm run ephe:download`). */
export function resolveEphePath(): string {
  if (process.env.EPHE_PATH) return process.env.EPHE_PATH;
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '../../ephe');
}

/**
 * Swiss Ephemeris engine. Uses .se1 files when present in the ephemeris path;
 * otherwise Swiss Ephemeris itself falls back to the built-in Moshier theory
 * (≈1" precision for planets, no Chiron/asteroids).
 */
export class SwephEngine implements EphemerisEngine {
  readonly name = 'sweph';
  readonly ephePath: string;

  constructor(ephePath = resolveEphePath()) {
    this.ephePath = ephePath;
    const missing = EPHE_FILES.filter((f) => !existsSync(join(ephePath, f)));
    if (missing.length) {
      // Still runs: Swiss Ephemeris falls back to Moshier, but Chiron is omitted.
      console.warn(
        `[sweph] missing ${missing.join(', ')} in ${ephePath}: Chiron will be omitted. Run \`npm run ephe:download\`.`,
      );
    }
    sweph.set_ephe_path(ephePath);
  }

  compute({ utc, lat, lon, houseSystem }: { utc: Date; lat: number; lon: number; houseSystem: HouseSystem }): EngineResult {
    const warnings: string[] = [];
    const seconds = utc.getUTCSeconds() + utc.getUTCMilliseconds() / 1000;
    const jd = sweph.utc_to_jd(
      utc.getUTCFullYear(),
      utc.getUTCMonth() + 1,
      utc.getUTCDate(),
      utc.getUTCHours(),
      utc.getUTCMinutes(),
      seconds,
      C.SE_GREG_CAL,
    );
    if (jd.flag !== C.OK) throw new Error(`utc_to_jd failed: ${jd.error}`);
    const jdUt = jd.data[1];

    const flags = C.SEFLG_SWIEPH | C.SEFLG_SPEED;
    let usedMoshier = false;
    const bodies: RawBodyPosition[] = [];

    for (const [name, id] of Object.entries(BODY_IDS) as [BodyName, number][]) {
      const r = sweph.calc_ut(jdUt, id, flags);
      if (r.flag < 0) {
        // Chiron needs seas_*.se1; Moshier cannot compute it.
        warnings.push(`${name} skipped: ${r.error.trim()}`);
        continue;
      }
      // The node is a computed point (no ephemeris flag of its own), so only real bodies count here.
      if (name !== 'TrueNode' && r.flag & C.SEFLG_MOSEPH) usedMoshier = true;
      bodies.push({ name, longitude: r.data[0], latitude: r.data[1], speed: r.data[3] });
    }
    if (usedMoshier) warnings.push(`Ephemeris files not found in ${this.ephePath}; used Moshier fallback`);

    const h = sweph.houses_ex2(jdUt, 0, lat, lon, houseSystem);
    if (h.flag !== C.OK) {
      // Placidus is undefined above the polar circles.
      throw new Error(`House calculation failed (${houseSystem}) at lat ${lat}: ${h.error || 'unknown error'}`);
    }

    return {
      bodies,
      houses: { cusps: [...h.data.houses], asc: h.data.points[0]!, mc: h.data.points[1]! },
      ephemeris: usedMoshier ? 'moshier' : 'swiss',
      warnings,
    };
  }
}
