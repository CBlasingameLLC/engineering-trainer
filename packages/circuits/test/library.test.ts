import { describe, expect, it } from 'vitest';
import { CIRCUIT_TEMPLATES, hasGround, operatingPoint, solveAc, toNetlist } from '../src/index.js';

/**
 * Every template has to be a circuit, not a picture of one.
 *
 * A starting point that loads with an unconnected pin is worse than no starting
 * point: it looks finished, so the first thing it teaches is that the simulator
 * is broken. These are hand-drawn on a grid, which is exactly the kind of work
 * that is wrong in ways nobody sees until they press run.
 */
describe('circuit template library', () => {
  it('offers templates across more than one unit of the course', () => {
    expect(CIRCUIT_TEMPLATES.length).toBeGreaterThanOrEqual(12);
    expect(new Set(CIRCUIT_TEMPLATES.map((t) => t.unit)).size).toBeGreaterThanOrEqual(3);
    expect(new Set(CIRCUIT_TEMPLATES.map((t) => t.id)).size).toBe(CIRCUIT_TEMPLATES.length);
  });

  for (const template of CIRCUIT_TEMPLATES) {
    it(`${template.id} builds a complete netlist`, () => {
      const built = toNetlist(template.build());
      expect(
        built.issues.map((i) => `${i.componentId ?? '-'}: ${i.message}`),
        template.name,
      ).toEqual([]);
      expect(hasGround(built.netlist), `${template.name} has no reference node`).toBe(true);
    });

    it(`${template.id} solves, and names an output node`, () => {
      const { netlist, nets } = toNetlist(template.build());

      // Every template names `out` or a pair of bridge nodes, or the Lab has
      // nothing to plot and the person has to go hunting for a node number.
      const named = [...nets.byNet.keys()];
      expect(named.some((n) => n === 'out' || n === 'a' || n === 'b'), `${template.name} nets: ${named.join(',')}`).toBe(true);

      const dc = operatingPoint(netlist);
      for (const [node, value] of dc.voltages) {
        expect(Number.isFinite(value), `${template.name} node ${node} solved to ${value}`).toBe(true);
      }

      // And at a frequency, since most of these exist to be swept.
      const ac = solveAc(netlist, 2 * Math.PI * 1000);
      for (const [node, value] of ac.voltages) {
        expect(
          Number.isFinite(value.re) && Number.isFinite(value.im),
          `${template.name} node ${node} did not solve at 1 kHz`,
        ).toBe(true);
      }
    });
  }
});
