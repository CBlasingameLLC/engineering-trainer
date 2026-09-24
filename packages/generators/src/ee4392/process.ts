import type { Generator } from '../types.js';
import { adjustDifficulty, mantissaDifficulty, pick, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';
import { celsius, nm, plain, sci, tidy, um, unit } from './common.js';

/**
 * Etch, deposition and interconnect — the exam-2 units.
 *
 * Same caveat as the dopant generators: these lectures have not been given,
 * so this is standard process engineering rather than this instructor's
 * treatment, and the notation should give way to the course's when it arrives.
 *
 * Less of this unit is closed-form than the oxidation or diffusion units, and
 * the split is worth stating rather than blurring. Etch bias, selectivity,
 * anisotropy and step coverage are arithmetic on measured rates. Mean free
 * path and interconnect RC delay are one line each. Everything else about
 * these units — why plasma etching is anisotropic, why PVD covers steps badly,
 * what damascene is for — is process knowledge and belongs in the hand-authored
 * pack alongside the oxidation and lithography concepts.
 */

/** Boltzmann constant in SI, J/K. */
const K_B = 1.380649e-23;

export const etchSelectivity: Generator = {
  id: 'ee4392.etch.selectivity',
  title: 'Etch selectivity and overetch',
  kcRefs: [{ kc: 'ee4392.etch-fundamentals', weight: 1.0 }],
  difficultyB: 0.1,
  generate(rng: Rng) {
    const askLoss = rng() < 0.55;
    const filmThickness = tidy(pick(rng, [200, 300, 400, 500, 800]), 10); // nm
    const filmRate = tidy(pick(rng, [20, 40, 50, 80, 100]), 1); // nm/min
    const selectivity = tidy(pick(rng, [5, 10, 20, 25, 40]), 1);
    const overetchPercent = tidy(pick(rng, [10, 20, 30, 50]), 5);

    const underlayerRate = filmRate / selectivity;
    const clearTime = filmThickness / filmRate;
    const totalTime = clearTime * (1 + overetchPercent / 100);
    const underlayerLoss = underlayerRate * (totalTime - clearTime);

    const value = askLoss ? underlayerLoss : totalTime;

    // Charging the underlayer for the whole etch rather than the overetch only.
    const lossWholeEtch = underlayerRate * totalTime;
    const overetchAsTotal = clearTime * (overetchPercent / 100);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        askLoss ? 0.5 : -0.5,
        mantissaDifficulty(selectivity),
      ]),
      stem:
        `A $${nm(filmThickness)}$ film is etched at $${unit(filmRate, 'nm/min')}$ with a selectivity of ` +
        `$${plain(selectivity)}{:}1$ against the layer beneath it. The recipe runs ` +
        `$${plain(overetchPercent)}\\%$ of overetch past the point where the film clears. ` +
        (askLoss
          ? `How much of the underlying layer is lost?`
          : `What is the total etch time?`),
      answer: {
        kind: 'numeric' as const,
        value,
        unit: askLoss ? 'nm' : 'min',
        tolerance: { rel: 0.02 },
      },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        ...(askLoss
          ? [
            {
              misconception: 'etch.underlayer-etched-throughout',
              value: lossWholeEtch,
              tolerance: { rel: 0.015 },
              feedback:
                `The underlayer is only exposed once the film above it clears. Before that it is ` +
                `covered, so only the overetch — $${unit(totalTime - clearTime, 'min')}$ — attacks it.`,
            },
            {
              misconception: 'etch.selectivity-inverted',
              value: filmRate * selectivity * (totalTime - clearTime),
              tolerance: { rel: 0.015 },
              feedback:
                `Selectivity of $${plain(selectivity)}{:}1$ means the underlayer etches ` +
                `$${plain(selectivity)}$ times **slower**, so divide rather than multiply.`,
            },
          ]
          : [
            {
              misconception: 'etch.overetch-taken-as-total',
              value: overetchAsTotal,
              tolerance: { rel: 0.015 },
              feedback:
                `That is the overetch alone. The total is the time to clear the film plus the overetch: ` +
                `$${unit(clearTime, 'min')} \\times (1 + ${plain(overetchPercent / 100)})$.`,
            },
            {
              misconception: 'etch.overetch-omitted',
              value: clearTime,
              tolerance: { rel: 0.015 },
              feedback:
                `That is only the time to clear the film. Overetch is added on purpose, because the ` +
                `film is never exactly uniform and the last of it has to come off everywhere.`,
            },
          ]),
      ]),
      explanation: {
        steps: [
          `Time to clear the film: $t_{\\mathrm{clear}} = \\dfrac{${plain(filmThickness)}}{${plain(filmRate)}} = ${unit(clearTime, 'min')}$.`,
          `Overetch adds $${plain(overetchPercent)}\\%$ of that, so the total is ` +
            `$${unit(clearTime, 'min')} \\times ${plain(1 + overetchPercent / 100)} = ${unit(totalTime, 'min')}$.`,
          `The underlayer is exposed only during the overetch, which lasts $${unit(totalTime - clearTime, 'min')}$, ` +
            `and it etches at $\\dfrac{${plain(filmRate)}}{${plain(selectivity)}} = ${unit(underlayerRate, 'nm/min')}$.`,
          askLoss
            ? `Underlayer lost $= ${unit(underlayerRate, 'nm/min')} \\times ${unit(totalTime - clearTime, 'min')} = ${nm(value)}$.`
            : `Total etch time $= ${unit(value, 'min')}$, of which $${unit(totalTime - clearTime, 'min')}$ is overetch.`,
        ],
        principle:
          'Overetch is not waste; it is insurance against non-uniformity. Selectivity is what decides how much of it the layer below can survive, which is why the two numbers are always quoted together.',
        hints: [
          'When does the underlying layer first see the etchant?',
          'Does a higher selectivity make the underlayer etch faster or slower?',
        ],
      },
    };
  },
};

export const etchBias: Generator = {
  id: 'ee4392.etch.bias-anisotropy',
  title: 'Etch bias and degree of anisotropy',
  kcRefs: [{ kc: 'ee4392.etch-fundamentals', weight: 1.0 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const maskWidth = tidy(pick(rng, [100, 180, 250, 400, 600]), 10); // nm
    const depth = tidy(pick(rng, [150, 200, 300, 450]), 10); // nm
    // Anisotropy A = 1 - lateral/vertical. A = 1 is perfectly directional.
    const anisotropy = tidy(pick(rng, [0, 0.2, 0.4, 0.6, 0.8]), 0.05);
    const lateral = depth * (1 - anisotropy);

    const askWidth = rng() < 0.6;
    const finalWidth = maskWidth + 2 * lateral;
    const value = askWidth ? finalWidth : lateral;

    // Undercutting only one side.
    const oneSided = maskWidth + lateral;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        anisotropy === 0 ? -0.6 : 0.4,
        askWidth ? 0.2 : -0.3,
      ]),
      stem:
        `A masked feature $${nm(maskWidth)}$ wide is etched $${nm(depth)}$ deep. The process has a ` +
        `degree of anisotropy $A = ${plain(anisotropy)}$, where $A = 1 - v_{\\ell}/v_{v}$ compares the ` +
        `lateral etch rate with the vertical one. ` +
        (askWidth
          ? `What is the width of the etched opening at the end?`
          : `How far does the etch undercut the mask on each side?`),
      answer: { kind: 'numeric' as const, value, unit: 'nm', tolerance: { rel: 0.02, abs: 0.5 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02, abs: 0.5 }, [
        ...(askWidth
          ? [
            {
              misconception: 'etch.undercut-counted-once',
              value: oneSided,
              tolerance: { rel: 0.015 },
              feedback:
                `The etch undercuts **both** edges of the mask, so the opening widens by ` +
                `$2 \\times ${nm(lateral)}$, not by one undercut.`,
            },
            {
              misconception: 'etch.anisotropy-inverted',
              value: maskWidth + 2 * depth * anisotropy,
              tolerance: { rel: 0.015 },
              feedback:
                `$A$ is defined so that $A = 1$ is perfectly directional with no undercut at all. ` +
                `The lateral rate is $v_v(1 - A)$, so the undercut shrinks as $A$ grows.`,
            },
          ]
          : [
            {
              misconception: 'etch.anisotropy-inverted',
              value: depth * anisotropy,
              tolerance: { rel: 0.015 },
              feedback:
                `With $A = 1$ meaning perfectly directional, the lateral etch is $v_v(1 - A)$. ` +
                `Using $A$ directly makes a perfectly anisotropic etch undercut the most, which is backwards.`,
            },
          ]),
      ]),
      explanation: {
        steps: [
          `Anisotropy compares the two rates: $A = 1 - v_{\\ell}/v_{v}$, so $v_{\\ell}/v_{v} = ${plain(1 - anisotropy)}$.`,
          `The vertical etch runs to the full depth $${nm(depth)}$, so in the same time the lateral etch ` +
            `advances $${nm(depth)} \\times ${plain(1 - anisotropy)} = ${nm(lateral)}$ under each mask edge.`,
          askWidth
            ? `Both edges undercut, so the opening ends at $${nm(maskWidth)} + 2 \\times ${nm(lateral)} = ${nm(value)}$.`
            : `The undercut on each side is $${nm(value)}$, so the opening is $${nm(finalWidth)}$ overall.`,
          anisotropy === 0
            ? `At $A = 0$ the etch is perfectly isotropic: it cuts sideways exactly as fast as down, which is the wet-etch case and why wet etching cannot pattern fine features.`
            : `Etch bias — the difference between the mask and the result — is $${nm(2 * lateral)}$ here, and it is what a plasma process exists to reduce.`,
        ],
        principle:
          'A perfectly isotropic etch undercuts by as much as it etches down, so the smallest feature it can pattern is set by the film thickness. Directionality is what breaks that limit.',
        hints: [
          'Which value of A means no sideways etching at all?',
          'How many mask edges does the etch attack?',
        ],
      },
    };
  },
};

export const meanFreePath: Generator = {
  id: 'ee4392.deposition.mean-free-path',
  title: 'Mean free path in a deposition chamber',
  kcRefs: [{ kc: 'ee4392.vacuum-systems', weight: 1.0 }],
  difficultyB: 0.35,
  generate(rng: Rng) {
    // lambda = kT / (sqrt(2) pi d^2 P), SI throughout.
    //
    // Two directions, because one of them alone put every item at the same
    // ability point: the parameters here are all round powers of ten and the
    // arithmetic does not get harder when they change, so the difficulty has
    // to come from what is being asked rather than from what was drawn.
    // Inverting for the pressure that achieves a required path is the way a
    // process engineer actually meets this equation, and it is the harder ask.
    const inverse = rng() < 0.4;
    const pressureTorr = pick(rng, [1e-6, 1e-5, 1e-4, 1e-3, 1e-2, 1e-1]);
    const temperature = pick(rng, [20, 100, 200, 300]); // celsius
    const kelvin = temperature + 273.15;
    const diameter = 3.7e-10; // nitrogen, metres

    const pressurePa = pressureTorr * 133.322;
    const lambdaM = (K_B * kelvin) / (Math.SQRT2 * Math.PI * diameter * diameter * pressurePa);
    const lambdaCm = lambdaM * 100;

    // For the inverse ask: a required path, and the pressure that gives it.
    const requiredCm = pick(rng, [10, 20, 50, 100, 200]);
    const requiredPa = (K_B * kelvin) / (Math.SQRT2 * Math.PI * diameter * diameter * (requiredCm / 100));
    const requiredTorr = requiredPa / 133.322;

    const usingTorr = (K_B * kelvin) / (Math.SQRT2 * Math.PI * diameter * diameter * pressureTorr) * 100;
    const noRootTwo = lambdaCm * Math.SQRT2;
    const value = inverse ? requiredTorr : lambdaCm;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        inverse ? 1 : -1,
        inverse ? 0.6 : -0.6,
        temperature > 100 ? 0.4 : -0.4,
      ]),
      stem: inverse
        ? `A deposition must run in molecular flow, which needs a mean free path of at least ` +
          `$${plain(requiredCm)}\\,\\mathrm{cm}$ in nitrogen at $${celsius(temperature)}$. ` +
          `Taking a molecular diameter of $${sci(diameter, 'm')}$, ` +
          `$k = ${sci(K_B, 'J/K')}$ and $1\\,\\mathrm{Torr} = 133.3\\,\\mathrm{Pa}$, ` +
          `what is the highest pressure the chamber may sit at, in torr?`
        : `A chamber holds nitrogen at $${sci(pressureTorr)}\\,\\mathrm{Torr}$ and $${celsius(temperature)}$. ` +
          `Taking a molecular diameter of $${sci(diameter, 'm')}$, ` +
          `$k = ${sci(K_B, 'J/K')}$ and $1\\,\\mathrm{Torr} = 133.3\\,\\mathrm{Pa}$, ` +
          `find the mean free path in centimetres.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { rel: 0.05 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.05 }, inverse
        ? [
          {
            misconception: 'vacuum.pressure-units-unconverted',
            value: requiredPa,
            tolerance: { rel: 0.03 },
            feedback:
              `That is the answer in pascals. The question asks for torr, so divide by $133.3$.`,
          },
          {
            misconception: 'vacuum.root-two-omitted',
            value: requiredTorr * Math.SQRT2,
            tolerance: { rel: 0.03 },
            feedback:
              `The $\\sqrt{2}$ accounts for the other molecules moving too, rather than sitting still ` +
              `waiting to be hit. Leaving it out permits a pressure $41\\%$ too high.`,
          },
        ]
        : [
          {
            misconception: 'vacuum.pressure-units-unconverted',
            value: usingTorr,
            tolerance: { rel: 0.03 },
            feedback:
              `The pressure has to be in pascals for this to be dimensionally consistent: ` +
              `$${sci(pressureTorr)}\\,\\mathrm{Torr} \\times 133.3 = ${sci(pressurePa, 'Pa')}$.`,
          },
          {
            misconception: 'vacuum.root-two-omitted',
            value: noRootTwo,
            tolerance: { rel: 0.03 },
            feedback:
              `The $\\sqrt{2}$ accounts for the fact that the other molecules are moving too, not ` +
              `sitting still waiting to be hit. Leaving it out overestimates the path by $41\\%$.`,
          },
        ]),
      explanation: {
        steps: inverse
          ? [
            `Rearranging $\\lambda = \\dfrac{kT}{\\sqrt{2}\\,\\pi d^2 P}$ for pressure gives $P = \\dfrac{kT}{\\sqrt{2}\\,\\pi d^2 \\lambda}$.`,
            `The required path in metres is $${plain(requiredCm)}\\,\\mathrm{cm} = ${sci(requiredCm / 100)}\\ \\mathrm{m}$, and $T = ${plain(kelvin)}\\,\\mathrm{K}$.`,
            `$P = \\dfrac{${sci(K_B)} \\times ${plain(kelvin)}}{\\sqrt{2}\\,\\pi (${sci(diameter)})^2 \\times ${sci(requiredCm / 100)}} = ${sci(requiredPa, 'Pa')}$.`,
            `In torr that is $\\dfrac{${sci(requiredPa)}}{133.3} = ${sci(requiredTorr)}\\ \\mathrm{Torr}$, and the chamber must be pumped at least this low.`,
          ]
          : [
            `Convert the pressure: $P = ${sci(pressureTorr)}\\,\\mathrm{Torr} \\times 133.3 = ${sci(pressurePa, 'Pa')}$.`,
            `$\\lambda = \\dfrac{kT}{\\sqrt{2}\\,\\pi d^2 P}$, with $T = ${plain(kelvin)}\\,\\mathrm{K}$.`,
            `$\\lambda = \\dfrac{${sci(K_B)} \\times ${plain(kelvin)}}{\\sqrt{2}\\,\\pi (${sci(diameter)})^2 \\times ${sci(pressurePa)}}$.`,
            `$\\lambda = ${sci(lambdaCm)}\\ \\mathrm{cm}$, which is ${lambdaCm > 30 ? 'comparable to or larger than' : 'much smaller than'} a chamber dimension — ` +
              `${lambdaCm > 30 ? 'so transport is line-of-sight and the process is in molecular flow' : 'so molecules collide many times on the way and the process is in viscous flow'}.`,
          ],
        principle:
          'The mean free path compared against the chamber size is what decides whether a deposition is line-of-sight or diffusive, which in turn decides its step coverage. That comparison is the reason vacuum level is a process parameter rather than a housekeeping one.',
        hints: [
          'What units must the pressure be in?',
          'What is the mean free path being compared against to make it useful?',
        ],
      },
    };
  },
};

export const stepCoverage: Generator = {
  id: 'ee4392.deposition.step-coverage',
  title: 'Step coverage of a deposited film',
  kcRefs: [{ kc: 'ee4392.physical-vapour-deposition', weight: 1.0 }],
  difficultyB: 0.0,
  generate(rng: Rng) {
    const nominal = tidy(pick(rng, [200, 300, 500, 800, 1000]), 10); // nm
    const coveragePercent = tidy(pick(rng, [15, 25, 40, 60, 85]), 5);
    const sidewall = (nominal * coveragePercent) / 100;

    const askSidewall = rng() < 0.55;
    const value = askSidewall ? sidewall : coveragePercent;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        askSidewall ? -0.4 : 0.3,
        coveragePercent < 30 ? 0.3 : -0.3,
      ]),
      stem: askSidewall
        ? `A PVD step deposits $${nm(nominal)}$ of metal on a flat field. Measured step coverage into ` +
          `a via is $${plain(coveragePercent)}\\%$. How thick is the film on the via sidewall?`
        : `A PVD step deposits $${nm(nominal)}$ of metal on a flat field, and the film on the via ` +
          `sidewall measures $${nm(sidewall)}$. What is the step coverage, as a percentage?`,
      answer: {
        kind: 'numeric' as const,
        value,
        unit: askSidewall ? 'nm' : '',
        tolerance: { rel: 0.02, abs: 0.5 },
      },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02, abs: 0.5 }, [
        {
          misconception: 'deposition.step-coverage-inverted',
          value: askSidewall ? nominal / (coveragePercent / 100) : (nominal / sidewall) * 100,
          tolerance: { rel: 0.015 },
          feedback:
            `Step coverage is the thinnest part divided by the nominal thickness, so it cannot exceed ` +
            `$100\\%$ for a conformal-or-worse process. You inverted the ratio.`,
        },
        ...(askSidewall
          ? [{
            misconception: 'deposition.percentage-not-applied',
            value: nominal - coveragePercent,
            tolerance: { rel: 0.015 },
            feedback:
              `The coverage is a percentage, not a thickness to subtract: ` +
              `$${nm(nominal)} \\times ${plain(coveragePercent / 100)}$.`,
          }]
          : []),
      ]),
      explanation: {
        steps: [
          `Step coverage is defined as the thinnest deposited thickness divided by the thickness on a flat field.`,
          askSidewall
            ? `$t_{\\mathrm{side}} = ${plain(coveragePercent / 100)} \\times ${nm(nominal)}$.`
            : `$\\mathrm{coverage} = \\dfrac{${plain(sidewall)}}{${plain(nominal)}} \\times 100\\%$.`,
          askSidewall
            ? `$t_{\\mathrm{side}} = ${nm(value)}$.`
            : `$\\mathrm{coverage} = ${plain(value)}\\%$.`,
          `Coverage this ${coveragePercent < 40 ? 'poor is characteristic of line-of-sight deposition: sputtered atoms arrive from a narrow range of angles and a sidewall sees only a fraction of them' : 'moderate still leaves the sidewall the weak point, which is where an interconnect will fail first'}. ` +
            `Chemical vapour deposition improves it because the precursor reacts at the surface wherever it lands, having arrived by diffusion rather than by flight.`,
        ],
        principle:
          'Step coverage is a geometry problem disguised as a deposition parameter. It is decided by how molecules arrive at the surface, which is why the vacuum level and the deposition mechanism determine it.',
        hints: [
          'Which thickness goes on top of the ratio?',
          'Can step coverage sensibly exceed 100%?',
        ],
      },
    };
  },
};

export const interconnectDelay: Generator = {
  id: 'ee4392.interconnect.rc-delay',
  title: 'Interconnect RC delay',
  kcRefs: [{ kc: 'ee4392.interconnect', weight: 1.0 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const rho = pick(rng, [
      { name: 'aluminium', value: 2.65e-6 }, // ohm cm
      { name: 'copper', value: 1.68e-6 },
    ]);
    const length = tidy(pick(rng, [1000, 2000, 5000]), 100); // um
    const width = tidy(pick(rng, [0.2, 0.35, 0.5]), 0.05); // um
    const thickness = tidy(pick(rng, [0.3, 0.5, 0.8]), 0.05); // um
    const k = pick(rng, [2.7, 3.0, 3.9]);
    const spacing = tidy(pick(rng, [0.2, 0.35, 0.5]), 0.05); // um to the plane below

    const lengthCm = length * 1e-4;
    const areaCm2 = width * thickness * 1e-8;
    const resistance = (rho.value * lengthCm) / areaCm2;

    const EPS0 = 8.854e-14; // F/cm
    const capacitance = (k * EPS0 * (width * 1e-4) * lengthCm) / (spacing * 1e-4);
    const delay = resistance * capacitance;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mantissaDifficulty(length),
        k < 3 ? 0.3 : -0.2,
      ]),
      stem:
        `A ${rho.name} interconnect is $${um(length)}$ long, $${um(width)}$ wide and $${um(thickness)}$ thick, ` +
        `with resistivity $${sci(rho.value)}\\ \\Omega\\,\\mathrm{cm}$. It runs $${um(spacing)}$ above a ` +
        `ground plane through a dielectric of relative permittivity $${plain(k)}$, ` +
        `with $\\varepsilon_0 = ${sci(EPS0)}\\ \\mathrm{F/cm}$. ` +
        `Treating it as a parallel-plate capacitor, estimate the $RC$ delay.`,
      answer: { kind: 'numeric' as const, value: delay, unit: 's', tolerance: { rel: 0.05 } },
      options: [],
      misconceptionTraps: separatedTraps(delay, { rel: 0.05 }, [
        {
          misconception: 'interconnect.permittivity-of-free-space-omitted',
          value: resistance * (k * (width * 1e-4) * lengthCm) / (spacing * 1e-4),
          tolerance: { rel: 0.03 },
          feedback:
            `The relative permittivity multiplies $\\varepsilon_0$; it does not replace it. ` +
            `$C = \\dfrac{k\\varepsilon_0 A}{d}$.`,
        },
        {
          misconception: 'interconnect.thickness-used-in-capacitance',
          value: resistance * (k * EPS0 * (thickness * 1e-4) * lengthCm) / (spacing * 1e-4),
          tolerance: { rel: 0.03 },
          feedback:
            `The capacitor plate is the **bottom** of the line facing the plane below, so its area is ` +
            `width times length. The thickness sets the resistance, not this capacitance.`,
        },
        {
          misconception: 'interconnect.length-cancelled',
          value: (rho.value / areaCm2) * capacitance,
          tolerance: { rel: 0.03 },
          feedback:
            `Length does not cancel. Resistance rises with it and so does capacitance, so $RC$ grows ` +
            `as the **square** of the length — which is precisely why long interconnects are the problem.`,
        },
      ]),
      explanation: {
        steps: [
          `Resistance: $R = \\dfrac{\\rho L}{A} = \\dfrac{${sci(rho.value)} \\times ${sci(lengthCm)}}{${sci(areaCm2)}} = ${sci(resistance, '\\Omega')}$.`,
          `Capacitance to the plane below, with the plate area being width times length: ` +
            `$C = \\dfrac{k\\varepsilon_0 W L}{d} = ${sci(capacitance, 'F')}$.`,
          `$RC = ${sci(resistance)} \\times ${sci(capacitance)}$.`,
          `$RC = ${sci(delay, 's')}$. Both factors grow with length, so the delay goes as $L^2$ — ` +
            `which is why copper replaced aluminium and why low-$k$ dielectrics sit between the lines.`,
        ],
        principle:
          'Interconnect delay grows as the square of length while gate delay falls with scaling, so at some node the wires become the limit. Every material choice in the back end follows from that crossing.',
        hints: [
          'Which dimensions set the resistance, and which set the capacitance?',
          'What happens to RC if the line is twice as long?',
        ],
      },
    };
  },
};

export const EE4392_PROCESS_GENERATORS: readonly Generator[] = [
  etchSelectivity,
  etchBias,
  meanFreePath,
  stepCoverage,
  interconnectDelay,
];
