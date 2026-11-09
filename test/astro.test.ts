import { describe, expect, it } from 'vitest';
import { findAspects } from '../src/astro/aspects.js';
import { houseOf, separation, signOf } from '../src/astro/zodiac.js';

describe('zodiac helpers', () => {
  it('maps longitude to sign', () => {
    expect(signOf(0)).toEqual({ sign: 'Aries', degreeInSign: 0 });
    expect(signOf(359.5).sign).toBe('Pisces');
    expect(signOf(-10).sign).toBe('Pisces');
    expect(signOf(123.5)).toEqual({ sign: 'Leo', degreeInSign: 3.5 });
  });

  it('computes shortest separation across 0°', () => {
    expect(separation(355, 5)).toBe(10);
    expect(separation(10, 190)).toBe(180);
  });

  it('assigns houses, including the house that wraps through 0° Aries', () => {
    const cusps = [340, 10, 40, 70, 100, 130, 160, 190, 220, 250, 280, 310];
    expect(houseOf(350, cusps)).toBe(1);
    expect(houseOf(5, cusps)).toBe(1);
    expect(houseOf(10, cusps)).toBe(2); // on the cusp → the house it opens
    expect(houseOf(339.9, cusps)).toBe(12);
  });
});

describe('aspects', () => {
  it('detects aspects within orb and picks the tightest', () => {
    const aspects = findAspects([
      { name: 'Sun', longitude: 10 },
      { name: 'Moon', longitude: 189 }, // opposition, orb 1
      { name: 'Mars', longitude: 102 }, // square Sun (orb 2), square Moon (orb 3)
      { name: 'Venus', longitude: 250 }, // trine Sun (orb 0)
    ]);
    expect(aspects[0]).toMatchObject({ planet1: 'Sun', planet2: 'Venus', type: 'trine', orb: 0 });
    expect(aspects).toContainEqual(expect.objectContaining({ planet1: 'Sun', planet2: 'Moon', type: 'opposition' }));
    expect(aspects).toContainEqual(expect.objectContaining({ planet1: 'Sun', planet2: 'Mars', type: 'square' }));
  });

  it('gives luminaries a wider orb', () => {
    // Square with 8.5° orb: only allowed because the Sun is involved (7 + 2).
    expect(findAspects([{ name: 'Sun', longitude: 0 }, { name: 'Mars', longitude: 98.5 }])).toHaveLength(1);
    expect(findAspects([{ name: 'Venus', longitude: 0 }, { name: 'Mars', longitude: 98.5 }])).toHaveLength(0);
  });
});
