import { findAspects, type Aspect } from './aspects.js';
import type { BodyName, EphemerisEngine, HouseSystem } from './types.js';
import { houseOf, signOf, type SignName } from './zodiac.js';

export interface PlanetOut {
  name: BodyName;
  longitude: number;
  latitude: number;
  speed: number;
  sign: SignName;
  degreeInSign: number;
  house: number;
  retrograde: boolean;
}

export interface HouseOut {
  number: number;
  cusp: number;
  sign: SignName;
  degreeInSign: number;
}

export interface AngleOut {
  longitude: number;
  sign: SignName;
  degreeInSign: number;
}

export interface ChartData {
  planets: PlanetOut[];
  houses: HouseOut[];
  angles: { asc: AngleOut; mc: AngleOut };
  aspects: Aspect[];
  houseSystem: HouseSystem;
  ephemeris: string;
  warnings: string[];
}

const angle = (longitude: number): AngleOut => ({ longitude, ...signOf(longitude) });

export function buildChart(
  engine: EphemerisEngine,
  input: { utc: Date; lat: number; lon: number; houseSystem: HouseSystem },
): ChartData {
  const raw = engine.compute(input);
  const cusps = raw.houses.cusps;

  const planets: PlanetOut[] = raw.bodies.map((b) => ({
    name: b.name,
    longitude: b.longitude,
    latitude: b.latitude,
    speed: b.speed,
    ...signOf(b.longitude),
    house: houseOf(b.longitude, cusps),
    // The mean/true node is almost always "retrograde"; that is reported as-is.
    retrograde: b.speed < 0,
  }));

  return {
    planets,
    houses: cusps.map((cusp, i) => ({ number: i + 1, cusp, ...signOf(cusp) })),
    angles: { asc: angle(raw.houses.asc), mc: angle(raw.houses.mc) },
    aspects: findAspects(planets),
    houseSystem: input.houseSystem,
    ephemeris: raw.ephemeris,
    warnings: raw.warnings,
  };
}
