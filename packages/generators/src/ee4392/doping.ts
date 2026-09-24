import type { Generator } from '../types.js';
import { adjustDifficulty, mantissaDifficulty, pick, trimNumber, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';
import { celsius, concentration, dose as doseUnits, nm, plain, sci, tidy, um, unit } from './common.js';

/**
 * Diffusion and ion implantation.
 *
 * A caveat that belongs at the top rather than in a commit message: these
 * lectures have not been given yet. Everything here is standard dopant
 * transport from the textbook literature rather than this instructor's
 * treatment of it, and the notation is the near-universal one — Q for dose,
 * N_s and N_0 for surface concentrations, x_j for junction depth, R_p and
 * Delta R_p for implant range and straggle. Where the course turns out to
 * write something else, the items should follow the course, because being
 * marked wrong for notation teaches notation.
 *
 * What is safe to assert now is the physics, which does not depend on whose
 * slides it arrives on. The two source conditions are the whole unit: a
 * constant surface concentration gives a complementary error function and a
 * dose that grows as the square root of Dt, while a fixed dose spread by a
 * drive-in gives a Gaussian whose surface concentration falls as Dt grows.
 * Which one applies is a process question — is the dopant supply still there —
 * before it is a mathematical one, and choosing wrongly is the characteristic
 * error of the unit.
 */

/**
 * The complementary error function, Abramowitz and Stegun 7.1.26.
 *
 * Accurate to about 1.5e-7, which is several orders better than any tolerance
 * an item here declares. Implemented rather than pulled in because
 * `packages/generators` has no numeric dependency and one special function is
 * not a reason to acquire one.
 */
export function erfc(x: number): number {
  const z = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * z);
  const poly = t * (0.254829592
    + t * (-0.284496736
      + t * (1.421413741
        + t * (-1.453152027 + t * 1.061405429))));
  const result = poly * Math.exp(-z * z);
  return x >= 0 ? result : 2 - result;
}

/** Diffusivity from the Arrhenius form, cm^2/s. */
export const diffusivity = (d0: number, ea: number, kelvin: number): number =>
  d0 * Math.exp(-ea / (8.617e-5 * kelvin));

/**
 * Representative Arrhenius constants for the common dopants in silicon,
 * D0 in cm^2/s and Ea in eV. Substitutional diffusion via vacancies.
 */
export const DOPANTS: readonly { name: string; d0: number; ea: number; type: string }[] = [
  { name: 'boron', d0: 0.76, ea: 3.46, type: 'p-type' },
  { name: 'phosphorus', d0: 3.85, ea: 3.66, type: 'n-type' },
  { name: 'arsenic', d0: 22.9, ea: 4.10, type: 'n-type' },
  { name: 'antimony', d0: 0.214, ea: 3.65, type: 'n-type' },
];

export const diffusivityArrhenius: Generator = {
  id: 'ee4392.diffusion.diffusivity',
  title: 'Diffusivity at a drive-in temperature',
  kcRefs: [{ kc: 'ee4392.diffusion-model', weight: 1.0 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const dopant = pick(rng, [...DOPANTS]);
    const temperature = pick(rng, [900, 950, 1000, 1050, 1100, 1150]);
    const kelvin = temperature + 273.15;
    const d = diffusivity(dopant.d0, dopant.ea, kelvin);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        temperature >= 1050 ? -0.4 : 0.4,
        mantissaDifficulty(dopant.d0),
      ]),
      stem:
        `${dopant.name[0]!.toUpperCase()}${dopant.name.slice(1)} diffuses in silicon with ` +
        `$D_0 = ${plain(dopant.d0)}\\ \\mathrm{cm^2/s}$ and an activation energy of ` +
        `$${plain(dopant.ea)}\\,\\mathrm{eV}$. Taking $k = 8.617 \\times 10^{-5}\\,\\mathrm{eV/K}$, ` +
        `find the diffusivity at $${celsius(temperature)}$.`,
      answer: { kind: 'numeric' as const, value: d, unit: '', tolerance: { rel: 0.05 } },
      options: [],
      misconceptionTraps: separatedTraps(d, { rel: 0.05 }, [
        {
          misconception: 'diffusion.celsius-used-as-kelvin',
          value: diffusivity(dopant.d0, dopant.ea, temperature),
          tolerance: { rel: 0.03 },
          feedback:
            `You put $${plain(temperature)}$ into the exponent directly. An Arrhenius law needs ` +
            `absolute temperature: $T = ${plain(temperature)} + 273.15 = ${plain(kelvin)}\\,\\mathrm{K}$.`,
        },
        {
          misconception: 'diffusion.activation-energy-sign',
          value: dopant.d0 * Math.exp(dopant.ea / (8.617e-5 * kelvin)),
          tolerance: { rel: 0.03 },
          feedback:
            `The exponent is negative. A diffusivity larger than $D_0$ would mean the barrier ` +
            `helps rather than hinders — $D$ approaches $D_0$ from below as temperature rises.`,
        },
      ]),
      explanation: {
        steps: [
          `Absolute temperature: $T = ${plain(temperature)} + 273.15 = ${plain(kelvin)}\\,\\mathrm{K}$, ` +
            `so $kT = ${sci(8.617e-5 * kelvin, 'eV')}$.`,
          `$D = D_0\\exp(-E_a/kT) = ${plain(dopant.d0)}\\exp\\!\\left(-${plain(dopant.ea)}/${plain(8.617e-5 * kelvin)}\\right)$.`,
          `Activation energies near $${plain(dopant.ea)}\\,\\mathrm{eV}$ make this extraordinarily ` +
            `temperature-sensitive: a hundred degrees changes $D$ by roughly an order of magnitude, ` +
            `which is why thermal budget dominates junction engineering.`,
          `$D = ${sci(d, 'cm^2/s')}$ at $${celsius(temperature)}$.`,
        ],
        principle:
          'Substitutional diffusion is an activated process with a barrier near 3.5 to 4 eV. That size of barrier is what makes every later thermal step a design constraint.',
        hints: ['What temperature scale does an Arrhenius exponent need?', 'Should D be larger or smaller than D0?'],
      },
    };
  },
};

export const driveInJunction: Generator = {
  id: 'ee4392.diffusion.junction-depth',
  title: 'Junction depth after a drive-in',
  kcRefs: [{ kc: 'ee4392.diffusion-profiles', weight: 1.0 }],
  difficultyB: 0.6,
  generate(rng: Rng) {
    // A limited-source drive-in gives a Gaussian, whose junction depth is a
    // clean logarithm. The constant-source case needs an inverse erfc and is
    // asked in the forward direction by `predepositionProfile` instead.
    const surfaceExp = pick(rng, [18, 19, 20]);
    const surfaceMantissa = pick(rng, [1, 2, 5]);
    const n0 = surfaceMantissa * 10 ** surfaceExp;
    const backgroundExp = pick(rng, [14, 15, 16]);
    const nb = pick(rng, [1, 2, 5]) * 10 ** backgroundExp;

    const dtExp = pick(rng, [-9, -10, -11]);
    const dt = pick(rng, [1, 2, 4, 8]) * 10 ** dtExp; // cm^2

    const ratio = n0 / nb;
    // x_j = 2 sqrt(Dt ln(N0/NB)), in cm; reported in micrometres.
    const xjCm = 2 * Math.sqrt(dt * Math.log(ratio));
    const xj = xjCm * 1e4;

    // Forgetting the logarithm entirely — the diffusion length itself.
    const diffusionLength = 2 * Math.sqrt(dt) * 1e4;
    // Dropping the factor of two.
    const halved = xj / 2;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratio > 1e4 ? 0.4 : -0.3,
        mantissaDifficulty(surfaceMantissa),
      ]),
      stem:
        `A limited-source drive-in leaves a Gaussian profile with a surface concentration of ` +
        `$N_0 = ${concentration(n0)}$ in a wafer with a uniform background of $N_B = ${concentration(nb)}$ of the ` +
        `opposite type. The drive-in gives $Dt = ${sci(dt, 'cm^2')}$. ` +
        `How deep is the metallurgical junction?`,
      answer: { kind: 'numeric' as const, value: xj, unit: 'um', tolerance: { rel: 0.03 } },
      options: [],
      misconceptionTraps: separatedTraps(xj, { rel: 0.03 }, [
        {
          misconception: 'diffusion.logarithm-omitted',
          value: diffusionLength,
          tolerance: { rel: 0.02 },
          feedback:
            `That is $2\\sqrt{Dt}$, the diffusion length alone. The junction sits where the profile ` +
            `has fallen all the way to the background, which costs an extra ` +
            `$\\sqrt{\\ln(N_0/N_B)} = ${plain(Math.sqrt(Math.log(ratio)))}$.`,
        },
        {
          misconception: 'diffusion.factor-two-dropped',
          value: halved,
          tolerance: { rel: 0.02 },
          feedback:
            `The factor of two is part of the Gaussian's argument: the profile is ` +
            `$\\exp(-x^2/4Dt)$, so setting it equal to $N_B/N_0$ gives $x_j = 2\\sqrt{Dt\\ln(N_0/N_B)}$.`,
        },
      ]),
      explanation: {
        steps: [
          `A limited source spread by a drive-in gives $N(x) = N_0\\exp\\!\\left(-x^2/4Dt\\right)$.`,
          `The junction is where the diffused profile meets the background: $N(x_j) = N_B$, so ` +
            `$\\exp\\!\\left(-x_j^2/4Dt\\right) = N_B/N_0 = ${sci(nb / n0)}$.`,
          `Taking logarithms, $x_j = 2\\sqrt{Dt\\,\\ln(N_0/N_B)}$ with ` +
            `$\\ln(N_0/N_B) = \\ln(${sci(ratio)}) = ${plain(Math.log(ratio))}$.`,
          `$x_j = 2\\sqrt{${sci(dt)} \\times ${plain(Math.log(ratio))}} = ${sci(xjCm)}\\ \\mathrm{cm} = ${um(xj)}$.`,
        ],
        principle:
          'The junction depth is the diffusion length scaled by how many decades the profile has to fall. The logarithm is why a thousandfold deeper background barely moves the junction.',
        hints: [
          'What condition defines a metallurgical junction?',
          'Solve the Gaussian for x rather than substituting a remembered result.',
        ],
      },
    };
  },
};

export const predepositionDose: Generator = {
  id: 'ee4392.diffusion.predeposition-dose',
  title: 'Dose delivered by a constant-source predeposition',
  kcRefs: [
    { kc: 'ee4392.diffusion-profiles', weight: 0.7 },
    { kc: 'ee4392.diffusion-model', weight: 0.3 },
  ],
  difficultyB: 0.45,
  generate(rng: Rng) {
    const askConcentration = rng() < 0.45;
    const ns = pick(rng, [1, 2, 5]) * 10 ** pick(rng, [19, 20]);
    const dt = pick(rng, [1, 2, 4, 8]) * 10 ** pick(rng, [-11, -12]);

    // Q = 2 Ns sqrt(Dt/pi), atoms per cm^2.
    const dose = 2 * ns * Math.sqrt(dt / Math.PI);
    const depth = pick(rng, [0.05, 0.1, 0.2]); // um
    const argument = (depth * 1e-4) / (2 * Math.sqrt(dt));
    const concentrationAt = ns * erfc(argument);

    const value = askConcentration ? concentrationAt : dose;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        askConcentration ? 0.5 : -0.3,
        mantissaDifficulty(ns / 10 ** Math.floor(Math.log10(ns))),
      ]),
      stem: askConcentration
        ? `A constant-source predeposition holds the surface at its solid solubility, ` +
          `$N_s = ${concentration(ns)}$, and runs to $Dt = ${sci(dt, 'cm^2')}$. ` +
          `The profile is $N(x) = N_s\\,\\mathrm{erfc}\\!\\left(x/2\\sqrt{Dt}\\right)$. ` +
          `What is the dopant concentration at a depth of $${um(depth)}$?`
        : `A constant-source predeposition holds the surface at its solid solubility, ` +
          `$N_s = ${concentration(ns)}$, and runs to $Dt = ${sci(dt, 'cm^2')}$. ` +
          `What dose has been introduced into the wafer?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { rel: 0.05 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.05 }, [
        ...(askConcentration
          ? [
            {
              misconception: 'diffusion.erfc-argument-factor-two',
              value: ns * erfc(argument * 2),
              tolerance: { rel: 0.03 },
              feedback:
                `The argument is $x/2\\sqrt{Dt}$, not $x/\\sqrt{Dt}$. The factor of two comes from the ` +
                `same place as the one in the Gaussian and halves the argument, which matters a great ` +
                `deal because erfc falls so steeply.`,
            },
            {
              misconception: 'diffusion.erf-used-for-erfc',
              value: ns * (1 - erfc(argument)),
              tolerance: { rel: 0.03 },
              feedback:
                `That is $N_s\\,\\mathrm{erf}$, which rises from zero. The profile must **fall** from ` +
                `$N_s$ at the surface toward zero in the bulk, which is erfc.`,
            },
          ]
          : [
            {
              misconception: 'diffusion.dose-factor-omitted',
              value: ns * Math.sqrt(dt / Math.PI),
              tolerance: { rel: 0.03 },
              feedback:
                `The factor of two is part of the integral: $Q = \\int_0^\\infty N\\,dx = 2N_s\\sqrt{Dt/\\pi}$.`,
            },
            {
              misconception: 'diffusion.dose-pi-omitted',
              value: 2 * ns * Math.sqrt(dt),
              tolerance: { rel: 0.03 },
              feedback:
                `The $\\pi$ belongs under the root. Integrating the complementary error function over ` +
                `all depths is what puts it there.`,
            },
          ]),
      ]),
      explanation: askConcentration
        ? {
          steps: [
            `The argument is the depth in units of twice the diffusion length: ` +
              `$\\dfrac{x}{2\\sqrt{Dt}} = \\dfrac{${sci(depth * 1e-4)}}{2\\sqrt{${sci(dt)}}} = ${plain(argument)}$.`,
            `$\\mathrm{erfc}(${plain(argument)}) = ${plain(erfc(argument))}$.`,
            `$N = N_s\\,\\mathrm{erfc} = ${concentration(ns)} \\times ${plain(erfc(argument))}$.`,
            `$N = ${concentration(concentrationAt)}$, which is ${trimNumber((concentrationAt / ns) * 100, 3)}% of the surface value.`,
          ],
          principle:
            'A constant source pins the surface and lets the profile spread. Depth enters only through the ratio of x to the diffusion length, which is why every such profile has the same shape.',
          hints: ['What is the diffusion length here?', 'Does erfc rise or fall with its argument?'],
        }
        : {
          steps: [
            `The dose is the profile integrated over all depths: $Q = \\int_0^{\\infty} N_s\\,\\mathrm{erfc}\\!\\left(\\dfrac{x}{2\\sqrt{Dt}}\\right) dx$.`,
            `That integral evaluates to $Q = \\dfrac{2}{\\sqrt{\\pi}}N_s\\sqrt{Dt}$, usually written $2N_s\\sqrt{Dt/\\pi}$.`,
            `$Q = 2 \\times ${concentration(ns)} \\times \\sqrt{${sci(dt)}/\\pi}$.`,
            `$Q = ${doseUnits(dose)}$.`,
          ],
          principle:
            'A constant-source step keeps adding dopant, so the dose grows as the square root of Dt. A drive-in conserves the dose instead — which of the two you are in decides every later formula.',
          hints: ['Is the dopant supply exhausted, or maintained?', 'Dose is a concentration integrated over depth — what are its units?'],
        },
    };
  },
};

export const implantProfile: Generator = {
  id: 'ee4392.implant.profile',
  title: 'Implant peak concentration and profile',
  kcRefs: [{ kc: 'ee4392.ion-implantation', weight: 1.0 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const dose = pick(rng, [1, 2, 5]) * 10 ** pick(rng, [13, 14, 15]); // cm^-2
    const rp = tidy(pick(rng, [50, 80, 120, 200, 300]), 1); // nm
    const straggle = tidy(rp * pick(rng, [0.2, 0.25, 0.3, 0.35]), 1); // nm

    const straggleCm = straggle * 1e-7;
    const peak = dose / (Math.sqrt(2 * Math.PI) * straggleCm);

    // Dropping the root-two-pi, and using the range instead of the straggle.
    const noRootTwoPi = dose / straggleCm;
    const usingRange = dose / (Math.sqrt(2 * Math.PI) * rp * 1e-7);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mantissaDifficulty(rp),
        straggle / rp > 0.3 ? -0.2 : 0.3,
      ]),
      stem:
        `An implant delivers a dose of $Q = ${doseUnits(dose)}$ ` +
        `with a projected range $R_p = ${nm(rp)}$ and straggle $\\Delta R_p = ${nm(straggle)}$. ` +
        `The profile is Gaussian about $R_p$. What is the peak concentration?`,
      answer: { kind: 'numeric' as const, value: peak, unit: '', tolerance: { rel: 0.04 } },
      options: [],
      misconceptionTraps: separatedTraps(peak, { rel: 0.04 }, [
        {
          misconception: 'implant.normalisation-omitted',
          value: noRootTwoPi,
          tolerance: { rel: 0.03 },
          feedback:
            `The $\\sqrt{2\\pi}$ is what makes the Gaussian integrate to the dose. Without it the ` +
            `profile would contain ${plain(Math.sqrt(2 * Math.PI))} times too much dopant.`,
        },
        {
          misconception: 'implant.range-used-as-straggle',
          value: usingRange,
          tolerance: { rel: 0.03 },
          feedback:
            `You divided by $R_p$. The width of the distribution is the straggle $\\Delta R_p$; ` +
            `the range only says where the peak sits, not how spread out it is.`,
        },
        {
          misconception: 'implant.straggle-units-unconverted',
          value: dose / (Math.sqrt(2 * Math.PI) * straggle),
          tolerance: { rel: 0.03 },
          feedback:
            `The straggle is in nanometres and the dose is per square centimetre. ` +
            `$\\Delta R_p = ${nm(straggle)} = ${sci(straggleCm)}\\ \\mathrm{cm}$.`,
        },
      ]),
      explanation: {
        steps: [
          `A Gaussian implant profile is $N(x) = N_p\\exp\\!\\left[-\\dfrac{(x - R_p)^2}{2\\Delta R_p^2}\\right]$, ` +
            `and its integral over all depths must equal the dose.`,
          `That normalisation gives $N_p = \\dfrac{Q}{\\sqrt{2\\pi}\\,\\Delta R_p}$.`,
          `Putting the straggle in centimetres: $\\Delta R_p = ${nm(straggle)} = ${sci(straggleCm)}\\ \\mathrm{cm}$.`,
          `$N_p = \\dfrac{${sci(dose)}}{\\sqrt{2\\pi} \\times ${sci(straggleCm)}} = ${concentration(peak)}$.`,
        ],
        principle:
          'Dose and depth are set independently in implantation — the beam current sets how much and the energy sets how deep. That separation is the whole reason implantation displaced predeposition.',
        hints: [
          'What must the profile integrate to?',
          'Which of the two lengths describes the width rather than the position?',
        ],
      },
    };
  },
};

export const implantDose: Generator = {
  id: 'ee4392.implant.dose-from-beam',
  title: 'Dose from beam current and time',
  kcRefs: [{ kc: 'ee4392.ion-implantation', weight: 1.0 }],
  difficultyB: 0.15,
  generate(rng: Rng) {
    const currentUa = tidy(pick(rng, [20, 50, 100, 200, 500]), 1); // microamps
    const area = tidy(pick(rng, [100, 150, 200, 300]), 1); // cm^2
    const seconds = tidy(pick(rng, [30, 60, 120, 240]), 1);
    const charge = pick(rng, [1, 2]);

    const Q_E = 1.602e-19;
    const current = currentUa * 1e-6;
    const dose = (current * seconds) / (charge * Q_E * area);

    const ignoringCharge = (current * seconds) / (Q_E * area);
    const ignoringArea = (current * seconds) / (charge * Q_E);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        charge === 2 ? 0.6 : -0.4,
        mantissaDifficulty(currentUa),
      ]),
      stem:
        `An implanter scans a $${unit(currentUa, '\\mu A')}$ beam of ` +
        `${charge === 1 ? 'singly' : 'doubly'} charged ions uniformly over ` +
        `$${unit(area, 'cm^2')}$ of wafer for $${unit(seconds, 's')}$. ` +
        `Taking $q = 1.602 \\times 10^{-19}\\,\\mathrm{C}$, what dose is delivered?`,
      answer: { kind: 'numeric' as const, value: dose, unit: '', tolerance: { rel: 0.04 } },
      options: [],
      misconceptionTraps: separatedTraps(dose, { rel: 0.04 }, [
        ...(charge === 2
          ? [{
            misconception: 'implant.charge-state-ignored',
            value: ignoringCharge,
            tolerance: { rel: 0.03 },
            feedback:
              `These ions are doubly charged, so each one carries $2q$ of current. The same measured ` +
              `current therefore corresponds to half as many ions.`,
          }]
          : []),
        {
          misconception: 'implant.area-omitted',
          value: ignoringArea,
          tolerance: { rel: 0.03 },
          feedback:
            `That is the total number of ions, not the dose. Dose is per unit area, so divide by the ` +
            `$${unit(area, 'cm^2')}$ they were spread over.`,
        },
        {
          misconception: 'implant.microamp-unconverted',
          value: dose * 1e6,
          tolerance: { rel: 0.03 },
          feedback:
            `The beam is $${unit(currentUa, '\\mu A')}$, which is $${sci(current)}\\ \\mathrm{A}$. ` +
            `Leaving it in microamps inflates the dose by a factor of a million.`,
        },
      ]),
      explanation: {
        steps: [
          `Charge delivered: $It = ${sci(current)} \\times ${plain(seconds)} = ${sci(current * seconds)}\\ \\mathrm{C}$.`,
          `Each ion carries $${charge === 1 ? 'q' : '2q'} = ${sci(charge * Q_E)}\\ \\mathrm{C}$, so the ion count is ` +
            `$\\dfrac{It}{${charge === 1 ? 'q' : '2q'}} = ${sci((current * seconds) / (charge * Q_E))}$.`,
          `Dose is that count per unit area: $Q = \\dfrac{It}{${charge === 1 ? 'q' : '2q'}A}$.`,
          `$Q = ${doseUnits(dose)}$.`,
        ],
        principle:
          'The implanter measures current, which is charge per second, not ions per second. The charge state is the conversion between them and is the commonest thing to forget.',
        hints: [
          'How much charge does one ion carry?',
          'What are the units of a dose?',
        ],
      },
    };
  },
};

export const EE4392_DOPING_GENERATORS: readonly Generator[] = [
  diffusivityArrhenius,
  driveInJunction,
  predepositionDose,
  implantProfile,
  implantDose,
];
