/**
 * Data-source-agnostic types. Anything that can produce raw ecliptic positions
 * and house cusps (Swiss Ephemeris, a remote API, another library) implements
 * `EphemerisEngine`; everything above it (signs, houses, aspects) is shared.
 */

export const BODIES = [
  'Sun',
  'Moon',
  'Mercury',
  'Venus',
  'Mars',
  'Jupiter',
  'Saturn',
  'Uranus',
  'Neptune',
  'Pluto',
  'TrueNode',
  'Chiron',
] as const;

export type BodyName = (typeof BODIES)[number];

/** Only Placidus is required today; the engine interface accepts any single-letter Swiss code. */
export type HouseSystem = 'P' | 'K' | 'O' | 'R' | 'C' | 'E' | 'W' | 'B' | 'M' | 'A';

export interface RawBodyPosition {
  name: BodyName;
  /** Ecliptic longitude, tropical, degrees [0, 360). */
  longitude: number;
  latitude: number;
  /** Longitude speed, degrees/day. Negative means retrograde. */
  speed: number;
}

export interface RawHouses {
  /** 12 cusps, index 0 = house 1. */
  cusps: number[];
  asc: number;
  mc: number;
}

export interface EngineResult {
  bodies: RawBodyPosition[];
  houses: RawHouses;
  /** Which ephemeris actually produced the numbers, e.g. "swiss" or "moshier". */
  ephemeris: string;
  warnings: string[];
}

export interface EphemerisEngine {
  readonly name: string;
  compute(input: { utc: Date; lat: number; lon: number; houseSystem: HouseSystem }): EngineResult;
}
