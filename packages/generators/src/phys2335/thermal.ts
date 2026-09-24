import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, engineering, mantissaDifficulty, pick, ratioDifficulty, trimNumber, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';
import {
  ATM, R_GAS, SIGMA_SB, WATER, celsius, kelvin, q, tidy, toKelvin,
} from './common.js';

/**
 * Temperature, heat and the ideal gas.
 *
 * One error runs through the whole unit and is trapped in four of these five
 * generators: substituting a celsius temperature where the physics needs an
 * absolute one. It is not a misunderstanding of thermodynamics — the learner
 * usually knows perfectly well that absolute zero is not at zero celsius — it
 * is a substitution habit, which is exactly the kind of thing the misconception
 * feed is for. It is tagged `scale.celsius-for-absolute` everywhere it appears
 * so it rolls up as one habit rather than four topics.
 *
 * A temperature *difference* is the exception and is the same number on both
 * scales, which is why calorimetry and linear expansion do not trap it.
 */

export const thermalExpansion: Generator = {
  id: 'phys2335.thermal-expansion.linear',
  title: 'Thermal expansion',
  kcRefs: [{ kc: 'phys2335.thermal-expansion', weight: 1.0 }],
  difficultyB: -1.0,
  generate(rng: Rng) {
    const material = pick(rng, [
      { name: 'aluminium', alpha: 23e-6 },
      { name: 'copper', alpha: 17e-6 },
      { name: 'steel', alpha: 12e-6 },
      { name: 'brass', alpha: 19e-6 },
      { name: 'glass', alpha: 9e-6 },
    ]);
    const l0 = pick(rng, [0.5, 1, 1.5, 2, 2.5, 4, 5, 8, 12]);
    const t0 = pick(rng, [0, 10, 15, 20, 25]);
    const t1 = pick(rng, [60, 80, 100, 120, 150, 200, 250]);
    const dT = t1 - t0;
    const volume = rng() < 0.4;

    const coefficient = volume ? 3 * material.alpha : material.alpha;
    const change = coefficient * l0 * dT;
    const linearWhenVolume = material.alpha * l0 * dT;
    const total = l0 + change;

    const subject = volume
      ? `A block of ${material.name} of volume $${q(l0, 'm^3')}$`
      : `A ${material.name} rod of length $${q(l0, 'm')}$`;
    // `m^3` carries an exponent, so it is a compound unit and cannot take an SI
    // prefix — the same reason `m/s` and `mol` cannot. A length may.
    const size = (value: number): string => (volume ? q(value, 'm^3', 3) : engineering(value, 'm'));

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [volume ? 0.7 : -0.5, mantissaDifficulty(dT)]),
      stem:
        `${subject} at $${celsius(t0)}$ is heated to $${celsius(t1)}$. The linear expansion coefficient ` +
        `of ${material.name} is $${trimNumber(material.alpha * 1e6)} \\times 10^{-6}\\,\\mathrm{K^{-1}}$. ` +
        `Find the **change** in its ${volume ? 'volume' : 'length'}.`,
      answer: {
        kind: 'numeric' as const,
        value: change,
        unit: volume ? 'm^3' : 'm',
        tolerance: DEFAULT_TOLERANCE,
      },
      options: [],
      misconceptionTraps: separatedTraps(change, DEFAULT_TOLERANCE, [
        ...(volume
          ? [{
              misconception: 'expansion.volume-coefficient-omitted',
              value: linearWhenVolume,
              tolerance: { rel: 0.015 },
              feedback:
                `You used the linear coefficient on a volume. Every dimension grows by the same factor, so ` +
                `$V(1+\\alpha\\Delta T)^3 \\approx V(1 + 3\\alpha\\Delta T)$ — the volume coefficient is $3\\alpha$.`,
            }]
          : []),
        {
          misconception: 'expansion.total-for-change',
          value: total,
          tolerance: { rel: 0.005 },
          feedback:
            `That is the **final** ${volume ? 'volume' : 'length'}, not the change. The question asks for ` +
            `$\\Delta ${volume ? 'V' : 'L'}$, which is $${size(change)}$ before adding it back on.`,
        },
        {
          misconception: 'scale.celsius-for-absolute',
          value: coefficient * l0 * toKelvin(t1),
          tolerance: { rel: 0.015 },
          feedback:
            `You converted the temperature to kelvin and used it as the difference. Expansion depends on ` +
            `$\\Delta T$, and a **difference** is identical on both scales: $${trimNumber(dT)}\\,\\mathrm{K}$ ` +
            `is $${trimNumber(dT)}\\,{}^{\\circ}\\mathrm{C}$. This is the one place in the unit where celsius is safe.`,
        },
      ]),
      explanation: {
        steps: [
          `Expansion is proportional to the original size and to the temperature change: $\\Delta L = \\alpha L_0 \\Delta T$.`,
          volume
            ? `For a volume all three dimensions grow, so to first order the coefficient is $3\\alpha = ${trimNumber(coefficient * 1e6)} \\times 10^{-6}\\,\\mathrm{K^{-1}}$.`
            : `The coefficient is used directly for a length.`,
          `$\\Delta T = ${trimNumber(t1)} - ${trimNumber(t0)} = ${trimNumber(dT)}\\,\\mathrm{K}$ — a difference, so celsius and kelvin agree.`,
          `$\\Delta ${volume ? 'V' : 'L'} = (${trimNumber(coefficient * 1e6)} \\times 10^{-6})(${trimNumber(l0)})(${trimNumber(dT)}) = ${size(change)}$.`,
        ],
        principle:
          'Area and volume coefficients are not separate facts: they follow from every linear dimension growing by the same fraction.',
        hints: ['Is the question asking for the change or for the final size?', volume ? 'If every length grows by a factor, what happens to a volume?' : 'Does a temperature difference care which scale you use?'],
      },
    };
  },
};

export const calorimetryLatent: Generator = {
  id: 'phys2335.calorimetry.phase-change',
  title: 'Heat across a phase change',
  kcRefs: [{ kc: 'phys2335.calorimetry', weight: 1.0 }],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const mass = pick(rng, [0.05, 0.1, 0.15, 0.2, 0.25, 0.4, 0.5]);
    const tStart = pick(rng, [-25, -20, -15, -10, -5]);
    const tEnd = pick(rng, [10, 15, 20, 25, 30, 40]);

    const warmIce = mass * WATER.cIce * (0 - tStart);
    const melt = mass * WATER.lFusion;
    const warmWater = mass * WATER.c * (tEnd - 0);
    const total = warmIce + melt + warmWater;
    const withoutLatent = warmIce + warmWater;
    const asWaterThroughout = mass * WATER.c * (tEnd - tStart);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mantissaDifficulty(mass),
        ratioDifficulty(melt, warmIce + warmWater),
      ]),
      stem:
        `How much heat is needed to take $${q(mass, 'kg')}$ of ice at $${celsius(tStart)}$ all the way to ` +
        `water at $${celsius(tEnd)}$? Use $c_{ice} = ${q(WATER.cIce, 'J/(kg \\cdot K)')}$, ` +
        `$c_{water} = ${q(WATER.c, 'J/(kg \\cdot K)')}$ and a latent heat of fusion of ` +
        `$${engineering(WATER.lFusion, 'J')}\\mathrm{/kg}$.`,
      answer: { kind: 'numeric' as const, value: total, unit: 'J', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(total, DEFAULT_TOLERANCE, [
        {
          misconception: 'calorimetry.latent-heat-omitted',
          value: withoutLatent,
          tolerance: { rel: 0.01 },
          feedback:
            `The melt is missing. Between $0\\,{}^{\\circ}\\mathrm{C}$ ice and $0\\,{}^{\\circ}\\mathrm{C}$ water ` +
            `the temperature does not change at all, but $${engineering(melt, 'J')}$ still has to go in — ` +
            `that is the whole point of a latent heat.`,
        },
        {
          misconception: 'calorimetry.single-phase-assumed',
          value: asWaterThroughout,
          tolerance: { rel: 0.01 },
          feedback:
            `You used one specific heat across the whole range. Ice and water are different substances ` +
            `thermally ($${trimNumber(WATER.cIce)}$ against $${trimNumber(WATER.c)}\\,\\mathrm{J/(kg \\cdot K)}$), ` +
            `and there is a phase change between them.`,
        },
      ]),
      explanation: {
        steps: [
          `Three separate stages, because the substance changes twice: warm the ice, melt it, then warm the water.`,
          `Warming the ice: $Q_1 = mc_{ice}\\Delta T = (${trimNumber(mass)})(${trimNumber(WATER.cIce)})(${trimNumber(0 - tStart)}) = ${engineering(warmIce, 'J')}$.`,
          `Melting it, at constant temperature: $Q_2 = mL_f = (${trimNumber(mass)})(${trimNumber(WATER.lFusion)}) = ${engineering(melt, 'J')}$.`,
          `Warming the water: $Q_3 = mc_{water}\\Delta T = (${trimNumber(mass)})(${trimNumber(WATER.c)})(${trimNumber(tEnd)}) = ${engineering(warmWater, 'J')}$.`,
          `$Q_{total} = ${engineering(warmIce, 'J')} + ${engineering(melt, 'J')} + ${engineering(warmWater, 'J')} = ${engineering(total, 'J')}$.`,
        ],
        principle:
          'A heating curve is flat wherever a phase changes, and those flat stretches carry energy without carrying temperature.',
        hints: ['Sketch temperature against heat added — where is the curve flat?', 'Does ice have the same specific heat as water?'],
      },
    };
  },
};

export const heatConduction: Generator = {
  id: 'phys2335.heat-transfer.conduction',
  title: 'Conduction and radiation',
  kcRefs: [{ kc: 'phys2335.heat-transfer', weight: 1.0 }],
  difficultyB: 0.45,
  generate(rng: Rng) {
    const radiating = rng() < 0.4;
    const area = pick(rng, [0.5, 0.8, 1, 1.2, 1.5, 2, 2.5, 4]);

    if (radiating) {
      const emissivity = pick(rng, [0.4, 0.5, 0.6, 0.7, 0.85, 0.95]);
      const tSurfaceC = pick(rng, [60, 80, 100, 150, 200, 250, 300]);
      const tAmbientC = pick(rng, [10, 15, 20, 25, 30]);
      const tS = toKelvin(tSurfaceC);
      const tA = toKelvin(tAmbientC);

      const netPower = emissivity * SIGMA_SB * area * (tS ** 4 - tA ** 4);
      const inCelsius = emissivity * SIGMA_SB * area * (tSurfaceC ** 4 - tAmbientC ** 4);
      const differenceFirst = emissivity * SIGMA_SB * area * (tS - tA) ** 4;

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.5, mantissaDifficulty(tSurfaceC)]),
        stem:
          `A surface of area $${q(area, 'm^2')}$ and emissivity $${trimNumber(emissivity)}$ sits at ` +
          `$${celsius(tSurfaceC)}$ in surroundings at $${celsius(tAmbientC)}$. Find the **net** radiated power. ` +
          `Take $\\sigma = ${trimNumber(SIGMA_SB * 1e8)} \\times 10^{-8}\\,\\mathrm{W/(m^2 \\cdot K^4)}$.`,
        answer: { kind: 'numeric' as const, value: netPower, unit: 'W', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(netPower, DEFAULT_TOLERANCE, [
          {
            misconception: 'scale.celsius-for-absolute',
            value: inCelsius,
            tolerance: { rel: 0.01 },
            feedback:
              `Celsius will not do here. Stefan-Boltzmann is a statement about **absolute** temperature — ` +
              `a body at $0\\,{}^{\\circ}\\mathrm{C}$ radiates strongly, and your expression says it radiates ` +
              `nothing. Use $${kelvin(tS)}$ and $${kelvin(tA)}$.`,
          },
          {
            misconception: 'radiation.difference-before-power',
            value: differenceFirst,
            tolerance: { rel: 0.01 },
            feedback:
              `You raised the temperature **difference** to the fourth power. The net flow is the difference ` +
              `of two fourth powers, $T_s^4 - T_a^4$, because the body emits and absorbs independently.`,
          },
        ]),
        explanation: {
          steps: [
            `A surface radiates $\\varepsilon\\sigma AT_s^4$ and absorbs $\\varepsilon\\sigma AT_a^4$ from its surroundings, so the net is the difference of the two fourth powers.`,
            `Both temperatures must be absolute: $T_s = ${kelvin(tS)}$ and $T_a = ${kelvin(tA)}$.`,
            `$T_s^4 - T_a^4 = ${trimNumber(tS ** 4, 4)} - ${trimNumber(tA ** 4, 4)} = ${trimNumber(tS ** 4 - tA ** 4, 4)}\\,\\mathrm{K^4}$.`,
            `$P = (${trimNumber(emissivity)})(${trimNumber(SIGMA_SB * 1e8)} \\times 10^{-8})(${trimNumber(area)})(${trimNumber(tS ** 4 - tA ** 4, 4)}) = ${engineering(netPower, 'W')}$.`,
          ],
          principle:
            'Radiation is a difference of two fourth powers of absolute temperature — emission and absorption are separate processes, not one flow driven by a temperature gap.',
          hints: ['Does a body at room temperature radiate?', 'Is $(T_s - T_a)^4$ the same as $T_s^4 - T_a^4$?'],
        },
      };
    }

    const layers = pick(rng, [
      { name: 'brick', k: 0.72, thickness: 0.1 },
      { name: 'concrete', k: 1.1, thickness: 0.15 },
      { name: 'oak', k: 0.17, thickness: 0.04 },
      { name: 'glass', k: 0.8, thickness: 0.006 },
    ]);
    const insulation = pick(rng, [
      { name: 'fibreglass', k: 0.043, thickness: 0.08 },
      { name: 'foam board', k: 0.03, thickness: 0.05 },
      { name: 'mineral wool', k: 0.038, thickness: 0.1 },
    ]);
    const dT = pick(rng, [15, 18, 20, 22, 25, 30, 35]);

    const r1 = layers.thickness / (layers.k * area);
    const r2 = insulation.thickness / (insulation.k * area);
    const power = dT / (r1 + r2);
    // Conductivities averaged as though the two layers were side by side.
    const conductivitiesAdded = ((layers.k + insulation.k) * area * dT) / (layers.thickness + insulation.thickness);
    const bareWall = dT / r1;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [0.2, ratioDifficulty(r1, r2), mantissaDifficulty(dT)]),
      stem:
        `A wall of area $${q(area, 'm^2')}$ is built from $${q(layers.thickness, 'm')}$ of ${layers.name} ` +
        `($k = ${q(layers.k, 'W/(m \\cdot K)')}$) backed by $${q(insulation.thickness, 'm')}$ of ` +
        `${insulation.name} ($k = ${q(insulation.k, 'W/(m \\cdot K)')}$). The temperature difference across ` +
        `the whole wall is $${q(dT, 'K')}$. Find the rate of heat flow through it.`,
      answer: { kind: 'numeric' as const, value: power, unit: 'W', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(power, DEFAULT_TOLERANCE, [
        {
          misconception: 'conduction.resistances-not-summed',
          value: conductivitiesAdded,
          tolerance: { rel: 0.01 },
          feedback:
            `You combined the conductivities. The layers are in **series** — the same heat passes through ` +
            `both — so it is the thermal resistances $L/kA$ that add, exactly as resistors in series do.`,
        },
        {
          misconception: 'conduction.layer-ignored',
          value: bareWall,
          tolerance: { rel: 0.01 },
          feedback:
            `Only the ${layers.name} is in your answer. The ${insulation.name} adds ` +
            `$${trimNumber(r2, 3)}\\,\\mathrm{K/W}$ of resistance against the ${layers.name}'s ` +
            `$${trimNumber(r1, 3)}$ — it dominates, which is why it is there.`,
        },
      ]),
      explanation: {
        steps: [
          `Conduction through a slab is $P = \\dfrac{kA\\Delta T}{L}$, which is a temperature difference divided by a thermal resistance $R = \\dfrac{L}{kA}$.`,
          `The same heat crosses both layers, so they are in series and their resistances add: $R_1 = \\dfrac{${trimNumber(layers.thickness)}}{(${trimNumber(layers.k)})(${trimNumber(area)})} = ${trimNumber(r1, 3)}\\,\\mathrm{K/W}$.`,
          `$R_2 = \\dfrac{${trimNumber(insulation.thickness)}}{(${trimNumber(insulation.k)})(${trimNumber(area)})} = ${trimNumber(r2, 3)}\\,\\mathrm{K/W}$.`,
          `$P = \\dfrac{\\Delta T}{R_1 + R_2} = \\dfrac{${trimNumber(dT)}}{${trimNumber(r1 + r2, 4)}} = ${engineering(power, 'W')}$.`,
        ],
        principle:
          'Thermal resistance is the same idea as electrical resistance with temperature as the potential, so layers in series add and the largest one governs.',
        hints: ['Does the same heat go through both layers, or does it split?', 'Which quantity adds in series — the conductivity or its reciprocal?'],
      },
    };
  },
};

export const idealGasState: Generator = {
  id: 'phys2335.ideal-gas-law.state',
  title: 'The ideal gas law',
  kcRefs: [{ kc: 'phys2335.ideal-gas-law', weight: 1.0 }],
  difficultyB: -0.7,
  generate(rng: Rng) {
    const twoState = rng() < 0.5;
    const t1C = pick(rng, [15, 20, 25, 27, 30, 40]);
    const t2C = pick(rng, [80, 100, 120, 150, 180, 200, 250]);

    if (twoState) {
      const p1 = tidy(pick(rng, [1, 1.5, 2, 2.5, 3, 4]) * ATM, 100);
      const v1 = pick(rng, [0.002, 0.005, 0.01, 0.02, 0.05]);
      const v2 = tidy(v1 * pick(rng, [0.5, 0.6, 0.75, 1.25, 1.5, 2]), 0.0005);
      const t1 = toKelvin(t1C);
      const t2 = toKelvin(t2C);

      const p2 = (p1 * v1 * t2) / (v2 * t1);
      const celsiusUsed = (p1 * v1 * t2C) / (v2 * t1C);
      const temperatureInverted = (p1 * v1 * t1) / (v2 * t2);

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.4, ratioDifficulty(v1, v2), mantissaDifficulty(p1)]),
        stem:
          `A sealed sample of gas occupies $${q(v1, 'm^3')}$ at $${engineering(p1, 'Pa')}$ and $${celsius(t1C)}$. ` +
          `It is compressed or expanded to $${q(v2, 'm^3')}$ while being heated to $${celsius(t2C)}$. ` +
          `Find its new pressure.`,
        answer: { kind: 'numeric' as const, value: p2, unit: 'Pa', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(p2, DEFAULT_TOLERANCE, [
          {
            misconception: 'scale.celsius-for-absolute',
            value: celsiusUsed,
            tolerance: { rel: 0.01 },
            feedback:
              `The temperatures must be absolute. $PV/T$ is constant only on a scale where $T = 0$ means no ` +
              `thermal motion — on celsius, a gas at $0\\,{}^{\\circ}\\mathrm{C}$ would need zero pressure. ` +
              `Use $${kelvin(t1)}$ and $${kelvin(t2)}$.`,
          },
          {
            misconception: 'gas.temperature-ratio-inverted',
            value: temperatureInverted,
            tolerance: { rel: 0.01 },
            feedback:
              `The temperature ratio is upside down. Heating a gas at fixed volume raises its pressure, so ` +
              `$T_2 > T_1$ must **increase** $P_2$: $P_2 = P_1\\dfrac{V_1}{V_2}\\dfrac{T_2}{T_1}$.`,
          },
        ]),
        explanation: {
          steps: [
            `The amount of gas is fixed, so $\\dfrac{P_1V_1}{T_1} = \\dfrac{P_2V_2}{T_2}$ with both temperatures absolute.`,
            `$T_1 = ${trimNumber(t1C)} + 273.15 = ${kelvin(t1)}$ and $T_2 = ${trimNumber(t2C)} + 273.15 = ${kelvin(t2)}$.`,
            `Rearranged: $P_2 = P_1 \\dfrac{V_1}{V_2} \\dfrac{T_2}{T_1}$.`,
            `$P_2 = (${trimNumber(p1)})\\dfrac{${trimNumber(v1)}}{${trimNumber(v2)}}\\dfrac{${trimNumber(t2, 5)}}{${trimNumber(t1, 5)}} = ${engineering(p2, 'Pa')}$.`,
          ],
          principle:
            'The combined gas law is the ideal gas law with $nR$ cancelled, which is legitimate only because the sample is sealed.',
          hints: ['What stays constant between the two states?', 'Which temperature scale does $PV = nRT$ require?'],
        },
      };
    }

    const n = pick(rng, [0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 4]);
    const tC = pick(rng, [t1C, t2C]);
    const t = toKelvin(tC);
    const volume = pick(rng, [0.005, 0.01, 0.02, 0.04, 0.05, 0.08]);

    const pressure = (n * R_GAS * t) / volume;
    const celsiusUsed = (n * R_GAS * tC) / volume;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [-0.4, mantissaDifficulty(n), mantissaDifficulty(volume)]),
      stem:
        `A rigid vessel of volume $${q(volume, 'm^3')}$ holds $${q(n, 'mol')}$ of an ideal gas at ` +
        `$${celsius(tC)}$. Find the pressure. Take $R = ${q(R_GAS, 'J/(mol \\cdot K)')}$.`,
      answer: { kind: 'numeric' as const, value: pressure, unit: 'Pa', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(pressure, DEFAULT_TOLERANCE, [
        {
          misconception: 'scale.celsius-for-absolute',
          value: celsiusUsed,
          tolerance: { rel: 0.01 },
          feedback:
            `$PV = nRT$ needs an absolute temperature. $R$ carries units of $\\mathrm{J/(mol \\cdot K)}$, and ` +
            `the K there is kelvin: $T = ${trimNumber(tC)} + 273.15 = ${kelvin(t)}$.`,
        },
        {
          misconception: 'gas.volume-multiplied',
          value: n * R_GAS * t * volume,
          tolerance: { rel: 0.01 },
          feedback: `You multiplied by the volume. $PV = nRT$ rearranges to $P = nRT/V$ — a smaller vessel gives a **higher** pressure.`,
        },
      ]),
      explanation: {
        steps: [
          `$PV = nRT$, with $T$ absolute: $T = ${trimNumber(tC)} + 273.15 = ${kelvin(t)}$.`,
          `Rearranged, $P = \\dfrac{nRT}{V}$.`,
          `$P = \\dfrac{(${trimNumber(n)})(${trimNumber(R_GAS)})(${trimNumber(t, 5)})}{${trimNumber(volume)}} = ${engineering(pressure, 'Pa')}$.`,
          `For scale, one atmosphere is $${engineering(ATM, 'Pa')}$, so this is about ${trimNumber(pressure / ATM, 3)} atmospheres.`,
        ],
        principle:
          'Every gas-law temperature is absolute, because the law says pressure vanishes when the temperature does.',
        hints: ['What are the units of $R$, and what do they tell you about $T$?', 'Does a smaller vessel raise or lower the pressure?'],
      },
    };
  },
};

export const rmsSpeed: Generator = {
  id: 'phys2335.kinetic-theory.rms-speed',
  title: 'Root-mean-square molecular speed',
  kcRefs: [
    { kc: 'phys2335.kinetic-theory', weight: 0.85 },
    { kc: 'phys2335.ideal-gas-law', weight: 0.15 },
  ],
  difficultyB: 0.45,
  generate(rng: Rng) {
    const gas = pick(rng, [
      { name: 'helium', molar: 0.004 },
      { name: 'nitrogen', molar: 0.028 },
      { name: 'oxygen', molar: 0.032 },
      { name: 'argon', molar: 0.040 },
      { name: 'carbon dioxide', molar: 0.044 },
      { name: 'hydrogen', molar: 0.002 },
    ]);
    const tC = pick(rng, [0, 20, 25, 50, 100, 150, 200, 300]);
    const t = toKelvin(tC);

    const vRms = Math.sqrt((3 * R_GAS * t) / gas.molar);
    const celsiusUsed = tC > 0 ? Math.sqrt((3 * R_GAS * tC) / gas.molar) : vRms * 0.5;
    const noRoot = (3 * R_GAS * t) / gas.molar;
    const twoInstead = Math.sqrt((2 * R_GAS * t) / gas.molar);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(t), gas.molar < 0.005 ? -0.3 : 0.3]),
      stem:
        `Find the root-mean-square speed of ${gas.name} molecules at $${celsius(tC)}$. The molar mass of ` +
        `${gas.name} is $${q(gas.molar, 'kg/mol')}$ and $R = ${q(R_GAS, 'J/(mol \\cdot K)')}$.`,
      answer: { kind: 'numeric' as const, value: vRms, unit: 'm/s', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(vRms, DEFAULT_TOLERANCE, [
        {
          misconception: 'scale.celsius-for-absolute',
          value: celsiusUsed,
          tolerance: { rel: 0.01 },
          feedback:
            `The temperature must be absolute. Molecular motion does not stop at $0\\,{}^{\\circ}\\mathrm{C}$ — ` +
            `it stops at $0\\,\\mathrm{K}$, which is what makes $v_{rms} \\propto \\sqrt{T}$ true at all. ` +
            `Use $${kelvin(t)}$.`,
        },
        {
          misconception: 'kinetic.root-dropped',
          value: noRoot,
          tolerance: { rel: 0.01 },
          feedback:
            `The square root is missing. $\\frac{1}{2}Mv^2 = \\frac{3}{2}RT$ gives $v^2 = 3RT/M$, so the ` +
            `speed is its root — and $3RT/M$ has units of $\\mathrm{m^2/s^2}$.`,
        },
        {
          misconception: 'kinetic.equipartition-coefficient',
          value: twoInstead,
          tolerance: { rel: 0.01 },
          feedback:
            `The coefficient is 3, not 2. Translation has three degrees of freedom and equipartition gives ` +
            `$\\frac{1}{2}kT$ to each, so the mean translational energy is $\\frac{3}{2}kT$ per molecule.`,
        },
      ]),
      explanation: {
        steps: [
          `Equipartition gives every translational degree of freedom $\\frac{1}{2}kT$, and there are three, so the mean translational kinetic energy per mole is $\\frac{3}{2}RT$.`,
          `Setting that equal to $\\frac{1}{2}Mv_{rms}^2$ gives $v_{rms} = \\sqrt{\\dfrac{3RT}{M}}$.`,
          `$T = ${trimNumber(tC)} + 273.15 = ${kelvin(t)}$.`,
          `$v_{rms} = \\sqrt{\\dfrac{3(${trimNumber(R_GAS)})(${trimNumber(t, 5)})}{${trimNumber(gas.molar)}}} = ${q(vRms, 'm/s')}$.`,
        ],
        principle:
          'Every gas at the same temperature has the same mean molecular kinetic energy, so speed depends only on mass — which is why hydrogen escapes an atmosphere and argon does not.',
        hints: ['What is the mean translational kinetic energy per molecule at temperature $T$?', 'Which temperature scale does that statement require?'],
      },
    };
  },
};

export const PHYS2335_THERMAL_GENERATORS: readonly Generator[] = [
  thermalExpansion, calorimetryLatent, heatConduction, idealGasState, rmsSpeed,
];
