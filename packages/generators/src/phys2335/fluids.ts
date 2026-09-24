import type { Generator } from '../types.js';
import {
  adjustDifficulty, engineering, mantissaDifficulty, pick, ratioDifficulty, trimNumber, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';
import { ATM, G_EARTH, q, tidy } from './common.js';

/**
 * Fluid statics — the first unit of the course and the one this file was
 * missing entirely, because the graph was written from the course title rather
 * than from the syllabus. "Waves and Heat" opens with three weeks of fluids.
 *
 * Every result here is a single equation, which makes the unit unusually
 * generatable and also unusually easy to get wrong in a way that looks right.
 * The errors are never algebraic; they are about *which* quantity belongs in
 * the equation:
 *
 * - which pressure — gauge or absolute — the question is asking for;
 * - whose density — the fluid's or the object's — the buoyant force uses;
 * - which volume — the whole object's or the submerged part's — is displaced;
 * - and whether a ratio of radii has been squared into a ratio of areas.
 *
 * Each of those is a trap below, because each produces a plausible number that
 * survives a units check.
 */

/** Densities in kg/m^3, as the course's problems use them. */
const FLUIDS: readonly { name: string; rho: number }[] = [
  { name: 'fresh water', rho: 1000 },
  { name: 'sea water', rho: 1030 },
  { name: 'ethanol', rho: 789 },
  { name: 'glycerine', rho: 1260 },
  { name: 'mercury', rho: 13600 },
  { name: 'olive oil', rho: 920 },
];

const SOLIDS: readonly { name: string; rho: number }[] = [
  { name: 'oak', rho: 710 },
  { name: 'ice', rho: 917 },
  { name: 'pine', rho: 500 },
  { name: 'cork', rho: 240 },
  { name: 'polyethylene', rho: 940 },
];

/** Density, which is a compound unit and so takes no SI prefix. */
const density = (value: number): string => q(value, 'kg/m^3');

export const fluidPressureDepth: Generator = {
  id: 'phys2335.fluids.pressure-depth',
  title: 'Pressure at depth',
  kcRefs: [{ kc: 'phys2335.fluid-pressure-depth', weight: 1.0 }],
  difficultyB: -0.9,
  generate(rng: Rng) {
    const fluid = pick(rng, [...FLUIDS]);
    const depth = tidy(pick(rng, [1.5, 3, 8, 12, 25, 40, 120, 340]), 0.1);
    const absolute = rng() < 0.5;

    const gauge = fluid.rho * G_EARTH * depth;
    const value = absolute ? gauge + ATM : gauge;
    const other = absolute ? gauge : gauge + ATM;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        absolute ? 0.5 : -0.5,
        mantissaDifficulty(depth),
      ]),
      stem:
        `A tank is filled with ${fluid.name} of density $${density(fluid.rho)}$. ` +
        `Taking $g = ${q(G_EARTH, 'm/s^2')}$ and atmospheric pressure as $${engineering(ATM, 'Pa')}$, ` +
        `what is the **${absolute ? 'absolute' : 'gauge'}** pressure at a depth of $${q(depth, 'm')}$?`,
      answer: { kind: 'numeric' as const, value, unit: 'Pa', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        {
          misconception: 'fluids.gauge-absolute-confused',
          value: other,
          tolerance: { rel: 0.015 },
          feedback: absolute
            ? `That is the **gauge** pressure — the $\\rho g h$ term alone. Absolute pressure adds the ` +
              `atmosphere pressing down on the surface: $P = P_0 + \\rho g h$.`
            : `That is the **absolute** pressure. Gauge pressure is measured relative to the atmosphere, ` +
              `so it is the $\\rho g h$ term without $P_0$.`,
        },
        {
          misconception: 'fluids.gravity-omitted',
          value: fluid.rho * depth + (absolute ? ATM : 0),
          tolerance: { rel: 0.015 },
          feedback:
            `Check the dimensions: $\\rho h$ is a mass per unit area, not a pressure. The weight of that ` +
            `column is what presses, so $g$ belongs in the product.`,
        },
      ]),
      explanation: {
        steps: [
          `Pressure in a static fluid rises with depth as the weight of the column above: $\\rho g h$.`,
          `$\\rho g h = ${trimNumber(fluid.rho)} \\times ${trimNumber(G_EARTH)} \\times ${trimNumber(depth)} = ${engineering(gauge, 'Pa')}$.`,
          absolute
            ? `Absolute pressure includes the atmosphere resting on the surface: $P = P_0 + \\rho g h$.`
            : `Gauge pressure is measured against the atmosphere, so the $P_0$ term is not included.`,
          `$P = ${engineering(value, 'Pa')}$, which is ${trimNumber(value / ATM, 3)} atmospheres.`,
        ],
        principle:
          'Depth, density and gravity set the pressure; the shape and width of the container do not enter. Whether the atmosphere is included is a question about the measurement, not about the fluid.',
        hints: [
          'Which pressure does the question ask for — gauge or absolute?',
          'What are the units of rho times h, without g?',
        ],
      },
    };
  },
};

export const manometer: Generator = {
  id: 'phys2335.fluids.manometer',
  title: 'Immiscible columns in a U-tube',
  kcRefs: [{ kc: 'phys2335.manometer', weight: 1.0 }],
  difficultyB: -0.1,
  generate(rng: Rng) {
    // Two fluids that do not mix, balanced about the interface. The heights are
    // inversely proportional to the densities, which is the whole result.
    const heavy = pick(rng, FLUIDS.filter((f) => f.rho >= 1000));
    const light = pick(rng, FLUIDS.filter((f) => f.rho < heavy.rho));
    const heavyHeight = tidy(pick(rng, [0.04, 0.06, 0.08, 0.12, 0.15]), 0.005);

    // rho_h g h_h = rho_l g h_l  ->  h_l = h_h (rho_h / rho_l)
    const lightHeight = (heavyHeight * heavy.rho) / light.rho;
    const inverted = (heavyHeight * light.rho) / heavy.rho;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratioDifficulty(heavy.rho, light.rho),
        mantissaDifficulty(heavyHeight),
      ]),
      stem:
        `A U-tube open at both ends holds two immiscible liquids that meet at an interface in the ` +
        `left arm. The right arm holds ${heavy.name}, density $${density(heavy.rho)}$, standing ` +
        `$${q(heavyHeight, 'm')}$ above the interface. The left arm holds ${light.name}, density ` +
        `$${density(light.rho)}$. How tall is the ${light.name} column above the interface?`,
      answer: { kind: 'numeric' as const, value: lightHeight, unit: 'm', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(lightHeight, { rel: 0.02 }, [
        {
          misconception: 'fluids.manometer-ratio-inverted',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback:
            `The ratio is the wrong way up. The *lighter* fluid needs the *taller* column to press ` +
            `equally hard, so $h_{\\ell} = h_h\\,\\rho_h/\\rho_{\\ell}$ and the answer must exceed ` +
            `$${q(heavyHeight, 'm')}$.`,
        },
        {
          misconception: 'fluids.equal-heights-assumed',
          value: heavyHeight,
          tolerance: { rel: 0.015 },
          feedback:
            `Equal heights would only balance if the densities were equal. What must match at the ` +
            `interface is the **pressure**, and pressure depends on $\\rho h$, not on $h$ alone.`,
        },
      ]),
      explanation: {
        steps: [
          `At the interface, and at every point at that height in the connected fluid, the pressure must be equal — otherwise the fluid would move.`,
          `Each arm contributes $\\rho g h$ above that level, and both arms are open to the same atmosphere, so the $P_0$ terms cancel.`,
          `$\\rho_h g h_h = \\rho_{\\ell} g h_{\\ell}$, and $g$ cancels: $h_{\\ell} = h_h\\dfrac{\\rho_h}{\\rho_{\\ell}} = ${trimNumber(heavyHeight)} \\times \\dfrac{${trimNumber(heavy.rho)}}{${trimNumber(light.rho)}}$.`,
          `$h_{\\ell} = ${q(lightHeight, 'm')}$ — taller than the denser column, as it must be.`,
        ],
        principle:
          'Every manometer is the same sentence: pressure is equal at equal heights within one connected fluid. Choosing that height well is the entire method.',
        hints: [
          'What quantity must be equal at the interface?',
          'Which column should end up taller, the dense one or the light one?',
        ],
      },
    };
  },
};

export const pascalHydraulic: Generator = {
  id: 'phys2335.fluids.hydraulic',
  title: 'Hydraulic force multiplication',
  kcRefs: [{ kc: 'phys2335.pascal-principle', weight: 1.0 }],
  difficultyB: -0.5,
  generate(rng: Rng) {
    const smallRadius = tidy(pick(rng, [0.01, 0.015, 0.02, 0.025]), 0.001);
    const ratio = pick(rng, [2, 2.5, 3, 4, 5]);
    const largeRadius = tidy(smallRadius * ratio, 0.001);
    const inputForce = tidy(pick(rng, [50, 80, 120, 200, 350]), 1);

    const areaRatio = (largeRadius / smallRadius) ** 2;
    const outputForce = inputForce * areaRatio;
    // The characteristic error: scaling by the radius ratio rather than its square.
    const linearRatio = inputForce * (largeRadius / smallRadius);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mantissaDifficulty(ratio),
        ratio >= 4 ? -0.3 : 0.3,
      ]),
      stem:
        `A hydraulic lift has an input piston of radius $${q(smallRadius, 'm')}$ and an output piston ` +
        `of radius $${q(largeRadius, 'm')}$, connected by an incompressible fluid. ` +
        `A force of $${engineering(inputForce, 'N')}$ is applied to the input piston. ` +
        `What force does the output piston deliver?`,
      answer: { kind: 'numeric' as const, value: outputForce, unit: 'N', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(outputForce, { rel: 0.02 }, [
        {
          misconception: 'fluids.area-ratio-not-squared',
          value: linearRatio,
          tolerance: { rel: 0.015 },
          feedback:
            `You scaled by the ratio of the **radii**. Pressure is force per unit *area*, and area goes ` +
            `as $r^2$, so the force ratio is $\\left(${trimNumber(largeRadius / smallRadius)}\\right)^2 = ${trimNumber(areaRatio)}$.`,
        },
        {
          misconception: 'fluids.hydraulic-ratio-inverted',
          value: inputForce / areaRatio,
          tolerance: { rel: 0.015 },
          feedback:
            `That makes the large piston deliver *less* than was put in. The same pressure acting over ` +
            `a larger area gives a larger force — which is the point of the machine.`,
        },
      ]),
      explanation: {
        steps: [
          `Pascal's principle: pressure applied to an enclosed fluid is transmitted undiminished, so both pistons see the same pressure.`,
          `$\\dfrac{F_1}{A_1} = \\dfrac{F_2}{A_2}$, and with circular pistons $A = \\pi r^2$, so the $\\pi$ cancels and $\\dfrac{F_2}{F_1} = \\left(\\dfrac{r_2}{r_1}\\right)^2$.`,
          `$\\left(\\dfrac{${trimNumber(largeRadius)}}{${trimNumber(smallRadius)}}\\right)^2 = ${trimNumber(areaRatio)}$.`,
          `$F_2 = ${engineering(inputForce, 'N')} \\times ${trimNumber(areaRatio)} = ${engineering(outputForce, 'N')}$.`,
        ],
        principle:
          'The machine multiplies force and divides distance; energy is not created. A radius ratio becomes an area ratio, and forgetting to square it is the single commonest slip in the topic.',
        hints: [
          'What is equal on both sides — force, or pressure?',
          'How does the area of a circle depend on its radius?',
        ],
      },
    };
  },
};

export const buoyantForce: Generator = {
  id: 'phys2335.fluids.buoyant-force',
  title: 'Buoyant force and apparent weight',
  kcRefs: [{ kc: 'phys2335.buoyancy', weight: 1.0 }],
  difficultyB: -0.3,
  generate(rng: Rng) {
    const fluid = pick(rng, [...FLUIDS]);
    const objectDensity = tidy(fluid.rho * pick(rng, [1.8, 2.3, 3.0, 4.5]), 10);
    const edge = tidy(pick(rng, [0.05, 0.08, 0.1, 0.15, 0.2, 0.27]), 0.01);
    const volume = edge ** 3;

    const askApparent = rng() < 0.5;
    const buoyant = fluid.rho * volume * G_EARTH;
    const trueWeight = objectDensity * volume * G_EARTH;
    const apparent = trueWeight - buoyant;
    const value = askApparent ? apparent : buoyant;

    // Using the object's density for the buoyant force is the error the whole
    // principle exists to rule out.
    const wrongDensity = objectDensity * volume * G_EARTH;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        askApparent ? 0.5 : -0.5,
        mantissaDifficulty(edge),
      ]),
      stem:
        `A solid cube of edge length $${q(edge, 'm')}$ and density $${density(objectDensity)}$ is fully ` +
        `submerged in ${fluid.name}, density $${density(fluid.rho)}$. Taking $g = ${q(G_EARTH, 'm/s^2')}$, ` +
        (askApparent
          ? `what is its apparent weight while submerged?`
          : `what buoyant force does the fluid exert on it?`),
      answer: { kind: 'numeric' as const, value, unit: 'N', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        ...(askApparent
          ? [
            {
              misconception: 'fluids.buoyancy-not-subtracted',
              value: trueWeight,
              tolerance: { rel: 0.015 },
              feedback:
                `That is the true weight in air. Submerged, the fluid pushes up with ` +
                `$${engineering(buoyant, 'N')}$, and apparent weight is what is left.`,
            },
          ]
          : [
            {
              misconception: 'fluids.object-density-used-for-buoyancy',
              value: wrongDensity,
              tolerance: { rel: 0.015 },
              feedback:
                `You used the cube's density. The buoyant force is the weight of the *fluid displaced*, ` +
                `so it depends on the **fluid's** density — a lead cube and a wooden cube of the same ` +
                `volume feel the same buoyant force.`,
            },
          ]),
        {
          misconception: 'fluids.volume-from-edge-not-cubed',
          value: (askApparent ? objectDensity - fluid.rho : fluid.rho) * edge * edge * G_EARTH,
          tolerance: { rel: 0.015 },
          feedback:
            `Check the volume. A cube of edge $${q(edge, 'm')}$ has volume $${q(volume, 'm^3')}$, ` +
            `not $${q(edge * edge, 'm^2')}$ — the edge is cubed, not squared.`,
        },
      ]),
      explanation: {
        steps: [
          `The cube's volume is $${trimNumber(edge)}^3 = ${q(volume, 'm^3')}$, and fully submerged it displaces all of it.`,
          `Archimedes' principle: the buoyant force is the weight of the displaced fluid, ` +
            `$F_B = \\rho_{\\text{fluid}} V g = ${trimNumber(fluid.rho)} \\times ${trimNumber(volume, 4)} \\times ${trimNumber(G_EARTH)} = ${engineering(buoyant, 'N')}$.`,
          askApparent
            ? `The true weight is $\\rho_{\\text{cube}} V g = ${engineering(trueWeight, 'N')}$, and the scale reads the difference.`
            : `Note that the cube's own density never entered this: it sets the weight, not the buoyancy.`,
          askApparent
            ? `Apparent weight $= ${engineering(trueWeight, 'N')} - ${engineering(buoyant, 'N')} = ${engineering(value, 'N')}$.`
            : `$F_B = ${engineering(value, 'N')}$.`,
        ],
        principle:
          'Buoyancy is a statement about the fluid, not the object. Only the displaced volume and the fluid density enter it — which is why it is the same for every material of the same shape.',
        hints: [
          'Whose density belongs in the buoyant force?',
          'What volume of fluid has been pushed out of the way?',
        ],
      },
    };
  },
};

export const floatingFraction: Generator = {
  id: 'phys2335.fluids.floating',
  title: 'Floating fraction and draft',
  kcRefs: [{ kc: 'phys2335.floating-equilibrium', weight: 1.0 }],
  difficultyB: 0.1,
  generate(rng: Rng) {
    const fluid = pick(rng, FLUIDS.filter((f) => f.rho >= 789));
    const solid = pick(rng, SOLIDS.filter((s) => s.rho < fluid.rho));
    const askFraction = rng() < 0.5;
    const height = tidy(pick(rng, [0.1, 0.15, 0.2, 0.3, 0.4]), 0.01);

    const fraction = solid.rho / fluid.rho;
    const draft = fraction * height;
    const value = askFraction ? fraction : draft;

    const inverted = askFraction ? fluid.rho / solid.rho : (fluid.rho / solid.rho) * height;
    const complement = askFraction ? 1 - fraction : (1 - fraction) * height;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        askFraction ? -0.4 : 0.4,
        ratioDifficulty(fluid.rho, solid.rho),
      ]),
      stem: askFraction
        ? `A block of ${solid.name}, density $${density(solid.rho)}$, floats in ${fluid.name} of ` +
          `density $${density(fluid.rho)}$. What fraction of its volume is below the surface?`
        : `A rectangular block of ${solid.name}, density $${density(solid.rho)}$, is $${q(height, 'm')}$ ` +
          `tall and floats upright in ${fluid.name} of density $${density(fluid.rho)}$. ` +
          `How deep does it sit below the waterline?`,
      answer: {
        kind: 'numeric' as const,
        value,
        unit: askFraction ? '' : 'm',
        tolerance: { rel: 0.02 },
      },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        {
          misconception: 'fluids.density-ratio-inverted',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback:
            `That ratio is upside down — it is greater than one, so it would have the block more than ` +
            `fully submerged while floating. The submerged fraction is ` +
            `$\\rho_{\\text{object}}/\\rho_{\\text{fluid}}$.`,
        },
        {
          misconception: 'fluids.submerged-emergent-confused',
          value: complement,
          tolerance: { rel: 0.015 },
          feedback:
            `That is the fraction standing **above** the surface. The submerged part is the density ` +
            `ratio itself; the exposed part is what is left over.`,
        },
      ]),
      explanation: {
        steps: [
          `Floating means equilibrium: the buoyant force exactly carries the weight.`,
          `$\\rho_{\\text{fluid}}\\,V_{\\text{sub}}\\,g = \\rho_{\\text{object}}\\,V_{\\text{total}}\\,g$, so $g$ and the total volume rearrange to ` +
            `$\\dfrac{V_{\\text{sub}}}{V_{\\text{total}}} = \\dfrac{\\rho_{\\text{object}}}{\\rho_{\\text{fluid}}} = \\dfrac{${trimNumber(solid.rho)}}{${trimNumber(fluid.rho)}} = ${trimNumber(fraction, 4)}$.`,
          askFraction
            ? `So ${trimNumber(fraction * 100, 3)}% of the volume is below the surface and ${trimNumber((1 - fraction) * 100, 3)}% stands proud.`
            : `For a block of uniform cross-section the volume fraction is also the height fraction, so the draft is $${trimNumber(fraction, 4)} \\times ${q(height, 'm')}$.`,
          askFraction
            ? `Submerged fraction $= ${trimNumber(value, 4)}$.`
            : `Draft $= ${q(value, 'm')}$, leaving $${q(height - draft, 'm')}$ above the waterline.`,
        ],
        principle:
          'A floating body displaces its own weight, and that single statement collapses to a ratio of densities. Nothing about the shape survives it except the conversion from volume to height.',
        hints: [
          'What is in equilibrium for a floating object?',
          'Should the submerged fraction be more or less than one?',
        ],
      },
    };
  },
};

export const PHYS2335_FLUID_GENERATORS: readonly Generator[] = [
  fluidPressureDepth,
  manometer,
  pascalHydraulic,
  buoyantForce,
  floatingFraction,
];
