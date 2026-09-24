import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, engineering, mantissaDifficulty, pick, ratioDifficulty, trimNumber, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';
import { ATM, R_GAS, celsius, kelvin, q, tidy, toKelvin } from './common.js';

/**
 * The laws of thermodynamics.
 *
 * These four generators are ordered by how much of the previous one they
 * assume, which is also the order in which the errors compound: a sign error in
 * the first law survives into the work integral, which survives into the cycle
 * efficiency, which is where it finally produces a number that violates the
 * second law. The last generator traps exactly that — an efficiency above the
 * Carnot bound is the sharpest self-check in the course, and a learner who
 * never computes the bound never gets to use it.
 */

export const firstLaw: Generator = {
  id: 'phys2335.first-law.internal-energy',
  title: 'The first law of thermodynamics',
  kcRefs: [{ kc: 'phys2335.first-law', weight: 1.0 }],
  difficultyB: 0.1,
  generate(rng: Rng) {
    const heat = tidy(pick(rng, [400, 600, 800, 1200, 1500, 2000, 2500, 3200]), 1);
    const work = tidy(pick(rng, [150, 250, 400, 500, 700, 900, 1100, 1400]), 1);
    const absorbs = rng() < 0.7;
    const doesWork = rng() < 0.7;

    const q1 = absorbs ? heat : -heat;
    const w = doesWork ? work : -work;
    const deltaU = q1 - w;
    const signFlipped = q1 + w;

    const heatPhrase = absorbs
      ? `absorbs $${engineering(heat, 'J')}$ of heat`
      : `gives up $${engineering(heat, 'J')}$ of heat`;
    const workPhrase = doesWork
      ? `does $${engineering(work, 'J')}$ of work on its surroundings`
      : `has $${engineering(work, 'J')}$ of work done on it`;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        absorbs && doesWork ? -0.6 : 0.5,
        ratioDifficulty(heat, work),
      ]),
      stem:
        `A gas ${heatPhrase} and ${workPhrase}. Find the change in its internal energy, ` +
        `taking heat into the gas and work done by the gas as positive.`,
      answer: { kind: 'numeric' as const, value: deltaU, unit: 'J', tolerance: { rel: 0.02, abs: 1 } },
      options: [],
      misconceptionTraps: separatedTraps(deltaU, { rel: 0.02, abs: 1 }, [
        {
          misconception: 'first-law.work-sign-inverted',
          value: signFlipped,
          tolerance: { rel: 0.015 },
          feedback:
            `The work term has the wrong sign. With the stated convention, work done **by** the gas leaves it, ` +
            `so $\\Delta U = Q - W$. You added where the convention subtracts.`,
        },
        {
          misconception: 'first-law.heat-reported-as-energy',
          value: q1,
          tolerance: { rel: 0.015 },
          feedback:
            `That is the heat alone. Internal energy is a **state** function and both transfers change it: ` +
            `$${engineering(q1, 'J')}$ came in as heat and $${engineering(w, 'J')}$ left as work.`,
        },
      ]),
      explanation: {
        steps: [
          `The convention given makes $Q = ${engineering(q1, 'J')}$ (${absorbs ? 'into' : 'out of'} the gas) and $W = ${engineering(w, 'J')}$ (${doesWork ? 'by' : 'on'} the gas).`,
          `The first law is conservation of energy for the gas: what it gains as heat minus what it spends as work stays as internal energy.`,
          `$\\Delta U = Q - W = ${trimNumber(q1)} - (${trimNumber(w)})$.`,
          `$\\Delta U = ${engineering(deltaU, 'J')}$, so the gas ends ${deltaU >= 0 ? 'with more' : 'with less'} internal energy than it started with.`,
        ],
        principle:
          'Internal energy is a state function; heat and work are not. The first law is the bookkeeping that connects the two kinds of quantity.',
        hints: ['Which way does energy flow when the gas does work?', 'Write down the sign of each transfer before combining them.'],
      },
    };
  },
};

export const gasWork: Generator = {
  id: 'phys2335.pv-work.process',
  title: 'Work done by an expanding gas',
  kcRefs: [
    { kc: 'phys2335.pv-work', weight: 0.85 },
    { kc: 'phys2335.first-law', weight: 0.15 },
  ],
  difficultyB: 0.65,
  generate(rng: Rng) {
    const isothermal = rng() < 0.55;
    const n = pick(rng, [0.5, 1, 1.5, 2, 2.5, 3]);
    const tC = pick(rng, [20, 27, 50, 80, 100, 127, 150]);
    const t = toKelvin(tC);
    const v1 = pick(rng, [0.005, 0.01, 0.015, 0.02, 0.03]);
    const ratio = pick(rng, [1.5, 2, 2.5, 3, 4, 5]);
    const v2 = tidy(v1 * ratio, 0.0005);

    if (isothermal) {
      const work = n * R_GAS * t * Math.log(v2 / v1);
      const p1 = (n * R_GAS * t) / v1;
      const asIsobaric = p1 * (v2 - v1);
      const logInverted = n * R_GAS * t * Math.log(v1 / v2);
      const celsiusUsed = n * R_GAS * tC * Math.log(v2 / v1);

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.4, mantissaDifficulty(ratio), ratioDifficulty(v2, v1)]),
        stem:
          `$${q(n, 'mol')}$ of an ideal gas expands **isothermally** at $${celsius(tC)}$ from ` +
          `$${q(v1, 'm^3')}$ to $${q(v2, 'm^3')}$. Find the work done by the gas. ` +
          `Take $R = ${q(R_GAS, 'J/(mol \\cdot K)')}$.`,
        answer: { kind: 'numeric' as const, value: work, unit: 'J', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(work, DEFAULT_TOLERANCE, [
          {
            misconception: 'pv-work.path-ignored',
            value: asIsobaric,
            tolerance: { rel: 0.01 },
            feedback:
              `You used $P\\Delta V$ with the initial pressure, which is the **isobaric** answer. In an ` +
              `isothermal expansion the pressure falls the whole way, so the area under the curve is an ` +
              `integral, not a rectangle.`,
          },
          {
            misconception: 'pv-work.log-ratio-inverted',
            value: logInverted,
            tolerance: { rel: 0.01 },
            feedback:
              `The ratio inside the logarithm is upside down, which flips the sign. An **expanding** gas does ` +
              `positive work, so the larger volume goes on top: $\\ln(V_2/V_1)$.`,
          },
          {
            misconception: 'scale.celsius-for-absolute',
            value: celsiusUsed,
            tolerance: { rel: 0.01 },
            feedback: `$nRT$ needs an absolute temperature: $T = ${kelvin(t)}$, not $${trimNumber(tC)}$.`,
          },
        ]),
        explanation: {
          steps: [
            `Work is the area under the path on a $PV$ diagram: $W = \\displaystyle\\int_{V_1}^{V_2} P\\,dV$.`,
            `Isothermal means $T$ is fixed, so $P = \\dfrac{nRT}{V}$ and the integrand is $nRT/V$.`,
            `$W = nRT\\displaystyle\\int_{V_1}^{V_2}\\dfrac{dV}{V} = nRT\\ln\\dfrac{V_2}{V_1}$, with $T = ${kelvin(t)}$.`,
            `$W = (${trimNumber(n)})(${trimNumber(R_GAS)})(${trimNumber(t, 5)})\\ln\\dfrac{${trimNumber(v2)}}{${trimNumber(v1)}} = ${engineering(work, 'J')}$.`,
          ],
          principle:
            'Work depends on the path, not the endpoints, which is exactly why it is an integral of pressure rather than a difference of anything.',
          hints: ['What is $P$ as a function of $V$ along this path?', 'Is the pressure constant during an isothermal expansion?'],
        },
      };
    }

    const pressure = tidy(pick(rng, [1, 1.5, 2, 2.5, 3]) * ATM, 100);
    const work = pressure * (v2 - v1);
    const finalOnly = pressure * v2;
    const ratioUsed = pressure * v1 * Math.log(v2 / v1);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [-0.5, mantissaDifficulty(pressure), ratioDifficulty(v2, v1)]),
      stem:
        `A gas expands at a constant pressure of $${engineering(pressure, 'Pa')}$ from $${q(v1, 'm^3')}$ ` +
        `to $${q(v2, 'm^3')}$. Find the work done by the gas.`,
      answer: { kind: 'numeric' as const, value: work, unit: 'J', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(work, DEFAULT_TOLERANCE, [
        {
          misconception: 'pv-work.change-not-taken',
          value: finalOnly,
          tolerance: { rel: 0.01 },
          feedback:
            `You used the final volume rather than the change. The area under a horizontal line from $V_1$ to ` +
            `$V_2$ is $P(V_2 - V_1)$ — the gas only does work over the volume it actually sweeps.`,
        },
        {
          misconception: 'pv-work.path-ignored',
          value: ratioUsed,
          tolerance: { rel: 0.01 },
          feedback:
            `The logarithm belongs to an **isothermal** path, where the pressure falls. Here the pressure is ` +
            `constant, so the area is a rectangle: $W = P\\Delta V$.`,
        },
      ]),
      explanation: {
        steps: [
          `$W = \\displaystyle\\int_{V_1}^{V_2} P\\,dV$, and here $P$ is constant so it comes straight out of the integral.`,
          `$W = P(V_2 - V_1)$ — the area of a rectangle on the $PV$ diagram.`,
          `$\\Delta V = ${trimNumber(v2)} - ${trimNumber(v1)} = ${trimNumber(v2 - v1)}\\,\\mathrm{m^3}$.`,
          `$W = (${trimNumber(pressure)})(${trimNumber(v2 - v1)}) = ${engineering(work, 'J')}$.`,
        ],
        principle:
          'Every $PV$ work problem is the same integral; the process only decides what $P(V)$ to put inside it.',
        hints: ['Sketch the path on a $PV$ diagram — what shape is the area?', 'Does the gas do work over $V_2$ or over $V_2 - V_1$?'],
      },
    };
  },
};

export const adiabaticProcess: Generator = {
  id: 'phys2335.thermodynamic-processes.adiabatic',
  title: 'Adiabatic compression',
  kcRefs: [
    { kc: 'phys2335.thermodynamic-processes', weight: 0.85 },
    { kc: 'phys2335.ideal-gas-law', weight: 0.15 },
  ],
  difficultyB: 0.85,
  generate(rng: Rng) {
    const monatomic = rng() < 0.5;
    const gamma = monatomic ? 5 / 3 : 7 / 5;
    const gasName = monatomic ? 'a monatomic gas (helium)' : 'a diatomic gas (nitrogen)';
    const p1 = tidy(pick(rng, [1, 1.2, 1.5, 2]) * ATM, 100);
    const ratio = pick(rng, [3, 4, 5, 6, 8, 10, 12]);
    const wantsPressure = rng() < 0.5;
    const t1C = pick(rng, [20, 25, 27, 30, 40]);
    const t1 = toKelvin(t1C);

    const p2 = p1 * ratio ** gamma;
    const t2 = t1 * ratio ** (gamma - 1);
    const answer = wantsPressure ? p2 : t2;

    const isothermal = wantsPressure ? p1 * ratio : t1;
    const wrongGamma = wantsPressure
      ? p1 * ratio ** (monatomic ? 7 / 5 : 5 / 3)
      : t1 * ratio ** ((monatomic ? 7 / 5 : 5 / 3) - 1);
    const gammaOnTemperature = wantsPressure ? p1 * ratio ** (gamma - 1) : t1 * ratio ** gamma;

    const traps = [
      {
        misconception: 'process.adiabatic-treated-as-isothermal',
        value: isothermal,
        tolerance: { rel: 0.01 },
        feedback:
          wantsPressure
            ? `You used $P_1V_1 = P_2V_2$, which holds at constant **temperature**. An adiabatic compression ` +
              `has nowhere to dump the work done on it, so the gas heats up and the pressure rises faster: ` +
              `$PV^{\\gamma}$ is what stays constant.`
            : `You left the temperature unchanged, which is the **isothermal** assumption. Adiabatic means no ` +
              `heat leaves, so the work done on the gas goes straight into its internal energy and $T$ rises.`,
      },
      {
        misconception: 'process.wrong-gamma',
        value: wrongGamma,
        tolerance: { rel: 0.01 },
        feedback:
          `That is the other $\\gamma$. ${monatomic ? 'A monatomic' : 'A diatomic'} gas has ` +
          `${monatomic ? 'three translational degrees of freedom only, giving $\\gamma = 5/3$' : 'two rotational degrees of freedom as well, giving $\\gamma = 7/5$'}.`,
      },
      {
        misconception: 'process.exponent-off-by-one',
        value: gammaOnTemperature,
        tolerance: { rel: 0.01 },
        feedback:
          wantsPressure
            ? `That exponent is $\\gamma - 1$, which belongs to the **temperature** relation $TV^{\\gamma-1}$. Pressure carries the full $\\gamma$.`
            : `That exponent is $\\gamma$, which belongs to the **pressure** relation $PV^{\\gamma}$. Substituting $PV = nRT$ into it leaves $TV^{\\gamma-1}$ constant.`,
      },
    ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        wantsPressure ? -0.3 : 0.5,
        monatomic ? -0.2 : 0.2,
        mantissaDifficulty(ratio),
      ]),
      stem:
        `${gasName.charAt(0).toUpperCase()}${gasName.slice(1)} at $${engineering(p1, 'Pa')}$ and ` +
        `$${celsius(t1C)}$ is compressed **adiabatically** to $1/${trimNumber(ratio)}$ of its original volume. ` +
        `Find its final ${wantsPressure ? 'pressure' : 'temperature'}.`,
      answer: {
        kind: 'numeric' as const,
        value: answer,
        unit: wantsPressure ? 'Pa' : 'K',
        tolerance: DEFAULT_TOLERANCE,
      },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          `Adiabatic means $Q = 0$, so the first law reduces to $\\Delta U = -W$: all the work done on the gas becomes internal energy.`,
          `That gives $PV^{\\gamma} = \\text{const}$, with $\\gamma = ${monatomic ? '5/3' : '7/5'} = ${trimNumber(gamma)}$ for ${monatomic ? 'a monatomic' : 'a diatomic'} gas.`,
          wantsPressure
            ? `$P_2 = P_1\\left(\\dfrac{V_1}{V_2}\\right)^{\\gamma} = (${trimNumber(p1)})(${trimNumber(ratio)})^{${trimNumber(gamma)}}$.`
            : `Substituting $PV = nRT$ leaves $TV^{\\gamma-1} = \\text{const}$, so $T_2 = T_1\\left(\\dfrac{V_1}{V_2}\\right)^{\\gamma-1} = (${kelvin(t1)})(${trimNumber(ratio)})^{${trimNumber(gamma - 1)}}$.`,
          wantsPressure
            ? `$P_2 = ${engineering(p2, 'Pa')}$ — higher than the isothermal $${engineering(p1 * ratio, 'Pa')}$, because the gas got hotter on the way.`
            : `$T_2 = ${kelvin(t2)}$, well above the starting $${kelvin(t1)}$ — which is why a bicycle pump warms up.`,
        ],
        principle:
          'An adiabatic curve is steeper than an isotherm through the same point, because compressing without cooling raises the temperature as well as the density.',
        hints: [
          'What does adiabatic do to the first law?',
          'Which exponent belongs on the pressure relation and which on the temperature one?',
        ],
      },
    };
  },
};

export const carnotEfficiency: Generator = {
  id: 'phys2335.heat-engines.efficiency',
  title: 'Engine efficiency against the Carnot bound',
  kcRefs: [
    { kc: 'phys2335.heat-engines', weight: 0.85 },
    { kc: 'phys2335.entropy', weight: 0.15 },
  ],
  difficultyB: 0.95,
  generate(rng: Rng) {
    const tcC = pick(rng, [15, 20, 25, 30, 40, 50]);
    const thC = pick(rng, [200, 250, 300, 350, 400, 450, 500]);
    const tc = toKelvin(tcC);
    const th = toKelvin(thC);
    const fridge = rng() < 0.35;

    if (fridge) {
      const cop = tc / (th - tc);
      const inverted = th / (th - tc);
      const celsiusUsed = tcC / (thC - tcC);

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.5, ratioDifficulty(th, tc)]),
        stem:
          `A refrigerator keeps its interior at $${celsius(tcC)}$ while rejecting heat to a condenser at ` +
          `$${celsius(thC)}$. Find the **maximum possible** coefficient of performance.`,
        answer: { kind: 'numeric' as const, value: cop, unit: '', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(cop, DEFAULT_TOLERANCE, [
          {
            misconception: 'carnot.heat-pump-for-refrigerator',
            value: inverted,
            tolerance: { rel: 0.01 },
            feedback:
              `That is the coefficient of performance of a **heat pump**, which is judged on the heat it ` +
              `delivers to the hot side. A refrigerator is judged on the heat it removes from the cold side, ` +
              `so the numerator is $T_c$.`,
          },
          {
            misconception: 'scale.celsius-for-absolute',
            value: celsiusUsed,
            tolerance: { rel: 0.01 },
            feedback:
              `The numerator must be absolute. The **difference** in the denominator is the same on both ` +
              `scales, which is what makes this error survive a units check — but $T_c$ on its own is ` +
              `$${kelvin(tc)}$, not $${trimNumber(tcC)}$.`,
          },
        ]),
        explanation: {
          steps: [
            `A refrigerator is rated on what it removes from the cold space per unit of work: $\\mathrm{COP} = Q_c/W$.`,
            `For a reversible cycle the heats are in the ratio of the absolute temperatures, $Q_c/Q_h = T_c/T_h$, and $W = Q_h - Q_c$.`,
            `That gives $\\mathrm{COP}_{max} = \\dfrac{T_c}{T_h - T_c}$, with $T_c = ${kelvin(tc)}$ and $T_h = ${kelvin(th)}$.`,
            `$\\mathrm{COP}_{max} = \\dfrac{${trimNumber(tc, 5)}}{${trimNumber(th - tc, 5)}} = ${trimNumber(cop, 4)}$.`,
          ],
          principle:
            'Every reversible-cycle bound is a ratio of absolute temperatures, which is why the temperature scale is not a presentation choice here.',
          hints: ['What is a refrigerator paid to move, and what does it cost?', 'Which temperatures have to be absolute?'],
        },
      };
    }

    const carnot = 1 - tc / th;
    // A real engine at a believable fraction of the bound.
    const actual = tidy(carnot * pick(rng, [0.45, 0.5, 0.55, 0.6, 0.65, 0.7]), 0.001);
    const qh = tidy(pick(rng, [2000, 3000, 5000, 8000, 12000]), 100);
    const wantsCarnot = rng() < 0.5;

    const work = actual * qh;
    const answer = wantsCarnot ? carnot : work;
    const inverted = 1 - th / tc;
    const celsiusUsed = 1 - tcC / thC;

    const traps = wantsCarnot
      ? [
          {
            misconception: 'carnot.temperature-ratio-inverted',
            value: inverted,
            tolerance: { rel: 0.02 },
            feedback:
              `The ratio is inverted, which makes the efficiency negative. The cold reservoir goes on top: ` +
              `$\\eta = 1 - T_c/T_h$, and it approaches 1 only as $T_c \\to 0$.`,
          },
          {
            misconception: 'scale.celsius-for-absolute',
            value: celsiusUsed,
            tolerance: { rel: 0.01 },
            feedback:
              `Celsius gives the wrong answer here even though it looks plausible. $\\eta = 1 - T_c/T_h$ is a ` +
              `ratio of two absolute temperatures — $${kelvin(tc)}$ and $${kelvin(th)}$ — and a ratio is not ` +
              `preserved by shifting both by 273.`,
          },
        ]
      : [
          {
            misconception: 'engine.carnot-bound-used-as-actual',
            value: carnot * qh,
            tolerance: { rel: 0.01 },
            feedback:
              `You used the Carnot efficiency, which is the **ceiling**, not this engine's. The stated ` +
              `efficiency is $${trimNumber(actual * 100, 3)}\\%$ against a bound of $${trimNumber(carnot * 100, 3)}\\%$.`,
          },
          {
            misconception: 'engine.rejected-heat-as-input',
            value: actual * qh * (1 / actual - 1),
            tolerance: { rel: 0.01 },
            feedback:
              `That is the heat **rejected**, $Q_c = Q_h - W$. Efficiency is defined against the heat taken ` +
              `in, so $W = \\eta Q_h$.`,
          },
        ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        wantsCarnot ? -0.4 : 0.3,
        ratioDifficulty(th, tc),
        mantissaDifficulty(qh),
      ]),
      stem: wantsCarnot
        ? `A heat engine runs between reservoirs at $${celsius(thC)}$ and $${celsius(tcC)}$. Find the ` +
          `maximum efficiency any engine could achieve between them, as a fraction.`
        : `A heat engine operating between $${celsius(thC)}$ and $${celsius(tcC)}$ achieves an efficiency of ` +
          `$${trimNumber(actual * 100, 3)}\\%$ and absorbs $${engineering(qh, 'J')}$ per cycle from the hot ` +
          `reservoir. Find the work it delivers per cycle.`,
      answer: {
        kind: 'numeric' as const,
        value: answer,
        unit: wantsCarnot ? '' : 'J',
        tolerance: DEFAULT_TOLERANCE,
      },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          `Both reservoir temperatures must be absolute: $T_h = ${kelvin(th)}$ and $T_c = ${kelvin(tc)}$.`,
          `No cycle between them can beat the Carnot efficiency $\\eta_{max} = 1 - \\dfrac{T_c}{T_h} = 1 - \\dfrac{${trimNumber(tc, 5)}}{${trimNumber(th, 5)}}$.`,
          wantsCarnot
            ? `$\\eta_{max} = ${trimNumber(carnot, 4)}$, or $${trimNumber(carnot * 100, 3)}\\%$.`
            : `$\\eta_{max} = ${trimNumber(carnot, 4)}$, and the stated $${trimNumber(actual, 4)}$ sits below it, so the engine is physically possible.`,
          wantsCarnot
            ? `Any claimed efficiency above $${trimNumber(carnot * 100, 3)}\\%$ between these reservoirs would decrease the total entropy of the universe, which is the second law's content.`
            : `Efficiency is work out over heat in, so $W = \\eta Q_h = (${trimNumber(actual, 4)})(${trimNumber(qh)}) = ${engineering(work, 'J')}$.`,
        ],
        principle:
          'The Carnot efficiency is not an engineering target but a bound set by the second law, and checking against it is the quickest way to catch a wrong cycle analysis.',
        hints: [
          'Convert both temperatures before forming the ratio.',
          wantsCarnot ? 'Which temperature belongs on top?' : 'Is the efficiency you were given the actual one or the bound?',
        ],
      },
    };
  },
};

export const entropyChange: Generator = {
  id: 'phys2335.entropy.reservoirs',
  title: 'Entropy change of two reservoirs',
  kcRefs: [{ kc: 'phys2335.entropy', weight: 1.0 }],
  difficultyB: 1.05,
  generate(rng: Rng) {
    const tcC = pick(rng, [10, 20, 25, 30, 40]);
    const thC = pick(rng, [150, 200, 250, 300, 400, 500]);
    const tc = toKelvin(tcC);
    const th = toKelvin(thC);
    const heat = tidy(pick(rng, [500, 1000, 1500, 2000, 3000, 5000]), 1);

    const total = heat / tc - heat / th;
    const reversedSign = heat / th - heat / tc;
    const overDifference = heat / (th - tc);
    const celsiusUsed = heat / tcC - heat / thC;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [ratioDifficulty(th, tc), mantissaDifficulty(heat)]),
      stem:
        `$${engineering(heat, 'J')}$ of heat flows directly from a large reservoir at $${celsius(thC)}$ into ` +
        `one at $${celsius(tcC)}$. Both are big enough that their temperatures do not change. Find the total ` +
        `entropy change of the two reservoirs together.`,
      answer: { kind: 'numeric' as const, value: total, unit: 'J/K', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(total, DEFAULT_TOLERANCE, [
        {
          misconception: 'entropy.flow-direction-reversed',
          value: reversedSign,
          tolerance: { rel: 0.01 },
          feedback:
            `The signs are swapped, giving a negative total. Heat **leaves** the hot reservoir ($-Q/T_h$) and ` +
            `**enters** the cold one ($+Q/T_c$). Since $T_c < T_h$, the gain must outweigh the loss — a ` +
            `spontaneous process cannot lower the total entropy.`,
        },
        {
          misconception: 'entropy.temperature-difference-used',
          value: overDifference,
          tolerance: { rel: 0.01 },
          feedback:
            `You divided by the temperature **difference**. Each reservoir gets its own term at its own ` +
            `temperature: $\\Delta S = \\dfrac{Q}{T_c} - \\dfrac{Q}{T_h}$.`,
        },
        {
          misconception: 'scale.celsius-for-absolute',
          value: celsiusUsed,
          tolerance: { rel: 0.01 },
          feedback: `Entropy divides by an **absolute** temperature: $${kelvin(tc)}$ and $${kelvin(th)}$.`,
        },
      ]),
      explanation: {
        steps: [
          `For a reservoir at fixed temperature, $\\Delta S = Q/T$ with $Q$ signed by the direction of flow.`,
          `The hot reservoir loses heat: $\\Delta S_h = -\\dfrac{${trimNumber(heat)}}{${trimNumber(th, 5)}} = ${trimNumber(-heat / th, 4)}\\,\\mathrm{J/K}$.`,
          `The cold one gains it: $\\Delta S_c = +\\dfrac{${trimNumber(heat)}}{${trimNumber(tc, 5)}} = ${trimNumber(heat / tc, 4)}\\,\\mathrm{J/K}$.`,
          `$\\Delta S_{total} = ${trimNumber(heat / tc, 4)} - ${trimNumber(heat / th, 4)} = ${trimNumber(total, 4)}\\,\\mathrm{J/K}$.`,
          `It is positive, as it must be: the same heat buys more entropy at a low temperature than it costs at a high one, which is the second law stated arithmetically.`,
        ],
        principle:
          'Entropy is a state function evaluated along any convenient reversible path, and a spontaneous flow always produces a positive total.',
        hints: ['Each reservoir gets its own term — at which temperature?', 'What sign must the total have for a process that happens on its own?'],
      },
    };
  },
};

export const PHYS2335_THERMODYNAMICS_GENERATORS: readonly Generator[] = [
  firstLaw, gasWork, adiabaticProcess, carnotEfficiency, entropyChange,
];
