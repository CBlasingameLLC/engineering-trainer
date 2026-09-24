import { describe, expect, it } from 'vitest';
import {
  alphaOf, criticalResistance, dampedFrequency, omega0Of, realRoots, regimeOf,
  type RlcParams,
} from '../src/ee3300/secondorder.js';

/**
 * Second-order circuit parameters, checked against published worked examples.
 *
 * Everything else in the gate proves an item agrees with itself: the answer is
 * computed from the parameters, the explanation quotes that answer, and
 * regeneration reproduces both. None of that can catch a formula that is wrong
 * in the same way twice. These cases come from Nilsson and Riedel chapter 8,
 * whose numbers are deliberately round, so a sign error or a misplaced factor
 * of two shows up immediately rather than hiding inside a plausible decimal.
 */
describe('parallel RLC against the textbook example', () => {
  // R = 200 ohm, L = 50 mH, C = 0.2 uF.
  const p: RlcParams = { r: 200, l: 50e-3, c: 0.2e-6, topology: 'parallel' };

  it('gives alpha = 12500 and omega-0 = 10000 rad/s', () => {
    expect(alphaOf(p)).toBeCloseTo(12500, 6);
    expect(omega0Of(p)).toBeCloseTo(10000, 6);
  });

  it('is overdamped, with roots at -5000 and -20000 rad/s', () => {
    expect(regimeOf(p)).toBe('overdamped');
    const [s1, s2] = realRoots(p);
    expect(s1).toBeCloseTo(-5000, 6);
    expect(s2).toBeCloseTo(-20000, 6);
    // s1 is the root nearer the origin, which is the term that survives
    // longest — the generators promise that ordering in their stems.
    expect(s1).toBeGreaterThan(s2);
  });

  it('reproduces the published coefficients -14 V and 26 V', () => {
    // v(0) = 12 V on the capacitor, i(0) = 30 mA in the inductor.
    const v0 = 12;
    const i0 = 0.03;
    const dv0 = -(v0 / p.r + i0) / p.c;
    expect(dv0).toBeCloseTo(-450000, 6);

    const [s1, s2] = realRoots(p);
    const a1 = (dv0 - s2 * v0) / (s1 - s2);
    const a2 = v0 - a1;
    expect(a1).toBeCloseTo(-14, 6);
    expect(a2).toBeCloseTo(26, 6);
  });
});

describe('series RLC against the textbook example', () => {
  // R = 560 ohm, L = 100 mH, C = 0.1 uF.
  const p: RlcParams = { r: 560, l: 100e-3, c: 0.1e-6, topology: 'series' };

  it('gives alpha = 2800 rad/s from R/2L, not from 1/2RC', () => {
    expect(alphaOf(p)).toBeCloseTo(2800, 6);
    // The parallel formula on the same components gives a wildly different
    // number, which is exactly why it is the trap the generators carry.
    expect(1 / (2 * p.r * p.c)).not.toBeCloseTo(2800, 0);
  });

  it('is underdamped, with a damped frequency of 9600 rad/s', () => {
    expect(regimeOf(p)).toBe('underdamped');
    expect(dampedFrequency(p)).toBeCloseTo(9600, 6);
    // Damping always slows the oscillation.
    expect(dampedFrequency(p)).toBeLessThan(omega0Of(p));
  });
});

describe('the critical resistance is the one that makes alpha equal omega-0', () => {
  const l = 50e-3;
  const c = 0.2e-6;

  it('is 250 ohm in parallel and 1000 ohm in series for the same L and C', () => {
    const rp = criticalResistance(l, c, 'parallel');
    const rs = criticalResistance(l, c, 'series');
    // sqrt(L/C) = 500 ohm here, so parallel takes half of it and series twice.
    expect(rp).toBeCloseTo(250, 6);
    expect(rs).toBeCloseTo(1000, 6);
    // A factor of four apart, which is what makes swapping them detectable.
    expect(rs / rp).toBeCloseTo(4, 10);
  });

  it('actually lands on critical damping when substituted back', () => {
    for (const topology of ['parallel', 'series'] as const) {
      const r = criticalResistance(l, c, topology);
      const p: RlcParams = { r, l, c, topology };
      expect(alphaOf(p)).toBeCloseTo(omega0Of(p), 6);
      expect(regimeOf(p)).toBe('critically damped');
    }
  });

  it('moves the regime in opposite directions for the two topologies', () => {
    // Parallel damps harder as R falls; series damps harder as R rises. The
    // draw helper in the generators depends on this and would silently produce
    // the wrong regime if it were ever reversed.
    const rp = criticalResistance(l, c, 'parallel');
    const rs = criticalResistance(l, c, 'series');
    expect(regimeOf({ r: rp / 2, l, c, topology: 'parallel' })).toBe('overdamped');
    expect(regimeOf({ r: rp * 2, l, c, topology: 'parallel' })).toBe('underdamped');
    expect(regimeOf({ r: rs * 2, l, c, topology: 'series' })).toBe('overdamped');
    expect(regimeOf({ r: rs / 2, l, c, topology: 'series' })).toBe('underdamped');
  });
});
