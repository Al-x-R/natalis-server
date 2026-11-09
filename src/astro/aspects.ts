import type { BodyName } from './types.js';
import { separation } from './zodiac.js';

export type AspectType = 'conjunction' | 'opposition' | 'trine' | 'square' | 'sextile';

export interface Aspect {
  planet1: BodyName;
  planet2: BodyName;
  type: AspectType;
  /** Absolute deviation from the exact angle, degrees. */
  orb: number;
}

export const ASPECT_ANGLES: Record<AspectType, number> = {
  conjunction: 0,
  opposition: 180,
  trine: 120,
  square: 90,
  sextile: 60,
};

/** Commonly used default orbs (degrees). Sun/Moon get an extra allowance. */
export const DEFAULT_ORBS: Record<AspectType, number> = {
  conjunction: 8,
  opposition: 8,
  trine: 7,
  square: 7,
  sextile: 5,
};
export const LUMINARY_BONUS = 2;

const LUMINARIES: ReadonlySet<BodyName> = new Set(['Sun', 'Moon']);

export function findAspects(
  bodies: { name: BodyName; longitude: number }[],
  orbs: Record<AspectType, number> = DEFAULT_ORBS,
): Aspect[] {
  const result: Aspect[] = [];
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i]!;
      const b = bodies[j]!;
      const sep = separation(a.longitude, b.longitude);
      const bonus = LUMINARIES.has(a.name) || LUMINARIES.has(b.name) ? LUMINARY_BONUS : 0;

      let best: Aspect | undefined;
      for (const type of Object.keys(ASPECT_ANGLES) as AspectType[]) {
        const orb = Math.abs(sep - ASPECT_ANGLES[type]);
        if (orb <= orbs[type] + bonus && (!best || orb < best.orb)) {
          best = { planet1: a.name, planet2: b.name, type, orb };
        }
      }
      if (best) result.push(best);
    }
  }
  return result.sort((x, y) => x.orb - y.orb);
}
