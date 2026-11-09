export const SIGNS = [
  'Aries',
  'Taurus',
  'Gemini',
  'Cancer',
  'Leo',
  'Virgo',
  'Libra',
  'Scorpio',
  'Sagittarius',
  'Capricorn',
  'Aquarius',
  'Pisces',
] as const;

export type SignName = (typeof SIGNS)[number];

export function normalize(deg: number): number {
  const d = deg % 360;
  return d < 0 ? d + 360 : d;
}

export function signOf(longitude: number): { sign: SignName; degreeInSign: number } {
  const lon = normalize(longitude);
  const index = Math.floor(lon / 30);
  return { sign: SIGNS[index]!, degreeInSign: lon - index * 30 };
}

/** Shortest angular distance between two longitudes, [0, 180]. */
export function separation(a: number, b: number): number {
  const d = Math.abs(normalize(a) - normalize(b));
  return d > 180 ? 360 - d : d;
}

/**
 * House (1..12) containing `longitude`, given 12 cusps in zodiacal order.
 * A cusp belongs to the house it opens.
 */
export function houseOf(longitude: number, cusps: number[]): number {
  const lon = normalize(longitude);
  for (let i = 0; i < 12; i++) {
    const start = normalize(cusps[i]!);
    const end = normalize(cusps[(i + 1) % 12]!);
    const span = normalize(end - start);
    if (normalize(lon - start) < span) return i + 1;
  }
  return 12;
}
