import type { Generator } from '../types.js';
import { adjustDifficulty, mantissaDifficulty, pick, ratioDifficulty, trimNumber, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';
import {
  DRY_111, ORIENTATION_BA, OXIDE_ABOVE_FRACTION, SI_CONSUMED_FRACTION, WET_111,
  aFrom, celsius, oxideThickness, oxideTime, plain, tauFor, thicknessAtTau, tidy, um, unit,
} from './common.js';

/**
 * Thermal oxidation: the closed-form third of EE 4392.
 *
 * Every generator here is the same equation read in a different direction,
 * which is exactly why the unit is worth drilling rather than reading. The
 * quadratic x0²/B + x0/(B/A) = t + tau is easy to state and easy to misuse,
 * and the four ways to misuse it are the four traps below:
 *
 * - treating an oxide already on the wafer as a zero initial condition, which
 *   is the whole point of tau and the reason the exam's second step is never
 *   on bare silicon;
 * - applying the orientation correction to B, which the slides call out in so
 *   many words because diffusion through an amorphous film cannot see the
 *   lattice;
 * - reading the rate-constant table in µm/min when it is tabulated in µm/hr,
 *   which the lecture itself lists as the most common calculation mistake;
 * - and swapping the 44/56 split, which is the difference between how much
 *   oxide there is and how much silicon it cost.
 */

const orientationLabel = (o: string): string => `(${o})`;

/** B/A corrected for substrate orientation. B is never corrected. */
const linearFor = (ba: number, orientation: string): number => ba / ORIENTATION_BA[orientation]!;

export const oxideGrowthTime: Generator = {
  id: 'ee4392.oxidation.growth-time',
  title: 'Oxidation time for a target thickness',
  kcRefs: [
    { kc: 'ee4392.oxide-growth-calculation', weight: 0.8 },
    { kc: 'ee4392.oxidation-rate-constants', weight: 0.2 },
  ],
  difficultyB: 0.35,
  generate(rng: Rng) {
    const wet = rng() < 0.6;
    const temperature = pick(rng, wet ? [900, 1000, 1100] : [1000, 1100, 1200]);
    const orientation = pick(rng, ['100', '111']);
    const base = wet ? WET_111[temperature]! : DRY_111[temperature]!;
    const rc = { b: base.b, ba: linearFor(base.ba, orientation) };

    // Dry and wet are not interchangeable in what they are asked to grow. Dry
    // oxidation is slow enough that a micron of it is two days in a furnace,
    // so it is used for gate and pad oxides measured in tens of nanometres;
    // wet is what grows a field oxide. Drawing both from one range produces
    // arithmetically correct items describing a process nobody runs.
    // Dry growth runs anomalously fast below about 20 nm and the model does not
    // capture it, so the dry curve is shifted by a tabulated tau even on a bare
    // wafer. Wet growth has no such anomaly: on bare silicon its tau is zero,
    // which is why the exam's multi-step problems put the wet step second.
    const tau = wet ? 0 : (base as typeof DRY_111[number]).tau;

    // A dry target below the thickness tau itself implies sits inside the
    // anomalous regime the model does not describe, and would come back as a
    // negative furnace time. Draw above it rather than reporting one.
    const floor = wet ? 0 : thicknessAtTau(rc, tau) * 1.5;
    const candidates = (wet
      ? [0.1, 0.15, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8]
      : [0.04, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2]
    ).filter((x) => x > floor);
    const target = tidy(pick(rng, candidates), 0.001);
    const t = oxideTime(target, rc, 0) - tau;

    // The two errors that produce a specific wrong number rather than nonsense.
    const wrongOrientation = (orientation === '100'
      ? oxideTime(target, { b: base.b, ba: base.ba }, 0)
      : oxideTime(target, { b: base.b, ba: linearFor(base.ba, '111') / ORIENTATION_BA['111']! }, 0)) - tau;
    const parabolicOnly = (target * target) / rc.b - tau;
    const tauIgnored = oxideTime(target, rc, 0);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        orientation === '111' ? -0.7 : 0.5,
        wet ? -0.4 : 0.4,
        mantissaDifficulty(target),
      ]),
      stem:
        `A bare $${orientationLabel(orientation)}$ silicon wafer is oxidised in ` +
        `${wet ? 'steam' : 'dry oxygen'} at $${celsius(temperature)}$. ` +
        `For this ambient and temperature the Si(111) rate constants are ` +
        `$B = ${unit(base.b, '\\mu m^2/hr')}$ and $B/A = ${unit(base.ba, '\\mu m/hr')}$` +
        `${wet ? '' : `, with a tabulated $\\tau = ${unit(tau, 'hr')}$`}. ` +
        `How long must the oxidation run to grow $${um(target)}$ of oxide?`,
      answer: { kind: 'numeric' as const, value: t, unit: 'hr', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(t, { rel: 0.02 }, [
        {
          misconception: 'oxidation.orientation-correction-missed',
          value: wrongOrientation,
          tolerance: { rel: 0.015 },
          feedback:
            `That is the time for a $(111)$ substrate. The tabulated $B/A$ is the $(111)$ value, and ` +
            `a $(100)$ wafer reacts more slowly: divide $B/A$ by $1.68$. Only the linear constant moves — ` +
            `$B$ describes diffusion through an amorphous oxide, which cannot see the lattice beneath it.`,
        },
        {
          misconception: 'oxidation.linear-term-dropped',
          value: parabolicOnly,
          tolerance: { rel: 0.015 },
          feedback:
            `You used $t = x_0^2/B$ alone. That is the thick-oxide limit; at $${um(target)}$ the ` +
            `reaction-limited term $x_0/(B/A)$ still contributes ` +
            `$${unit(target / rc.ba, 'hr')}$ of the total.`,
        },
        ...(wet ? [] : [{
          misconception: 'oxidation.tau-omitted',
          value: tauIgnored,
          tolerance: { rel: 0.015 },
          feedback:
            `You left $\\tau$ out. Dry oxidation grows faster than the model predicts below about ` +
            `$20\\,\\mathrm{{n}m}$, so its curve is shifted: the wafer behaves as though it had already ` +
            `been in the furnace for $${unit(tau, 'hr')}$, and that time comes off the total.`,
        }]),
        {
          misconception: 'oxidation.hour-minute-confusion',
          value: t * 60,
          tolerance: { rel: 0.01 },
          feedback:
            `That is the answer in minutes. The rate constants quoted here are in $\\mathrm{\\mu m^2/hr}$ and ` +
            `$\\mathrm{\\mu m/hr}$, so the time that falls out of them is already in hours.`,
        },
      ]),
      explanation: {
        steps: [
          `The tabulated constants are for Si(111). ${orientation === '100'
            ? `This wafer is $(100)$, so the linear constant becomes $B/A = ${unit(base.ba, '\\mu m/hr')} / 1.68 = ${unit(rc.ba, '\\mu m/hr')}$. $B$ is unchanged.`
            : `This wafer is $(111)$, so both constants are used as tabulated.`}`,
          wet
            ? `The wafer starts bare and this is a wet oxidation, so $\\tau = 0$.`
            : `The wafer starts bare, but dry growth runs anomalously fast below about $20\\,\\mathrm{{n}m}$ and the model does not capture that, so the dry curve carries a tabulated $\\tau = ${unit(tau, 'hr')}$ even with no deliberate initial oxide.`,
          `Deal-Grove in the direction that gives time: $t = \\dfrac{x_0^2}{B} + \\dfrac{x_0}{B/A} - \\tau$.`,
          `$t = \\dfrac{${plain(target)}^2}{${plain(rc.b)}} + \\dfrac{${plain(target)}}{${plain(rc.ba)}}${wet ? '' : ` - ${plain(tau)}`} = ${unit((target * target) / rc.b, 'hr')} + ${unit(target / rc.ba, 'hr')}${wet ? '' : ` - ${unit(tau, 'hr')}`}$.`,
          `$t = ${unit(t, 'hr')}$, which is ${trimNumber(t * 60, 3)} minutes.`,
        ],
        principle:
          'Deal-Grove is one quadratic relating thickness and time. Which term dominates tells you which regime you are in: linear while the oxide is thin, parabolic once the oxidant has to diffuse through it.',
        hints: [
          'Is this substrate the one the table was measured on?',
          'Both terms, or only one? Compare their sizes before deciding.',
        ],
      },
    };
  },
};

export const oxideRegrowth: Generator = {
  id: 'ee4392.oxidation.regrowth',
  title: 'Growing on an oxide that is already there',
  kcRefs: [{ kc: 'ee4392.oxide-growth-calculation', weight: 1.0 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const temperature = pick(rng, [900, 1000, 1100]);
    const base = WET_111[temperature]!;
    const rc = { b: base.b, ba: base.ba };

    const initial = tidy(pick(rng, [0.1, 0.15, 0.2, 0.3, 0.4, 0.5]), 0.01);
    const t = tidy(pick(rng, [0.25, 0.5, 0.75, 1.0, 1.5, 2.0]), 0.05);

    const finalThickness = oxideThickness(t, rc, initial);
    const tau = tauFor(initial, rc);
    // The error the whole concept of tau exists to prevent.
    const ignoringInitial = oxideThickness(t, rc, 0);
    // Adding the fresh growth to the old oxide instead of solving from tau.
    const additive = initial + ignoringInitial;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratioDifficulty(finalThickness, initial),
        mantissaDifficulty(t),
      ]),
      stem:
        `A silicon wafer already carries $${um(initial)}$ of oxide. It is oxidised in steam at ` +
        `$${celsius(temperature)}$ for a further $${unit(t, 'hr')}$, where ` +
        `$B = ${unit(rc.b, '\\mu m^2/hr')}$ and $B/A = ${unit(rc.ba, '\\mu m/hr')}$. ` +
        `What is the total oxide thickness at the end?`,
      answer: { kind: 'numeric' as const, value: finalThickness, unit: 'um', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(finalThickness, { rel: 0.02 }, [
        {
          misconception: 'oxidation.initial-oxide-ignored',
          value: ignoringInitial,
          tolerance: { rel: 0.015 },
          feedback:
            `That is the thickness that would grow on a bare wafer. The $${um(initial)}$ already present ` +
            `slows everything that follows, because the oxidant has further to diffuse. ` +
            `That is what $\\tau$ encodes: here $\\tau = ${unit(tau, 'hr')}$, and the growth curve is ` +
            `read at $t + \\tau$ rather than at $t$.`,
        },
        {
          misconception: 'oxidation.growth-added-to-initial',
          value: additive,
          tolerance: { rel: 0.015 },
          feedback:
            `You grew $${um(ignoringInitial)}$ as if on bare silicon and added the starting oxide. ` +
            `Growth is not additive — the second $${um(initial)}$ takes far longer than the first, ` +
            `so the film ends thinner than that sum.`,
        },
      ]),
      explanation: {
        steps: [
          `An oxide already on the wafer enters the model as a time offset, not as a separate layer.`,
          `$\\tau = \\dfrac{x_i^2}{B} + \\dfrac{x_i}{B/A} = \\dfrac{${plain(initial)}^2}{${plain(rc.b)}} + \\dfrac{${plain(initial)}}{${plain(rc.ba)}} = ${unit(tau, 'hr')}$.`,
          `With $A = B/(B/A) = ${um(aFrom(rc))}$, read the growth curve at $t + \\tau = ${unit(t + tau, 'hr')}$:`,
          `$x_0 = \\dfrac{A}{2}\\left[\\sqrt{1 + \\dfrac{4B(t+\\tau)}{A^2}} - 1\\right]$.`,
          `$x_0 = ${um(finalThickness)}$ in total, of which $${um(finalThickness - initial)}$ is new.`,
        ],
        principle:
          'Tau is not a fudge factor. It is the time the wafer would have needed to reach the oxide it already has, which is what makes the growth curve continuous across a process step.',
        hints: [
          'What does the existing oxide do to the oxidant that has to cross it?',
          'Find the time the wafer is effectively already at before adding the new step.',
        ],
      },
    };
  },
};

export const siliconConsumed: Generator = {
  id: 'ee4392.oxidation.silicon-consumed',
  title: 'Silicon consumed and oxide above the surface',
  kcRefs: [{ kc: 'ee4392.oxide-volume-expansion', weight: 1.0 }],
  difficultyB: -0.35,
  generate(rng: Rng) {
    // Two directions: given the oxide, find the silicon it cost; or given a
    // required recess, find the oxide that produces it. The second is LOCOS.
    const fromRecess = rng() < 0.45;
    const grown = tidy(pick(rng, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.8, 1.0]), 0.01);
    const recess = tidy(pick(rng, [0.15, 0.2, 0.25, 0.3, 0.4, 0.5]), 0.01);

    const value = fromRecess ? recess / OXIDE_ABOVE_FRACTION : grown * SI_CONSUMED_FRACTION;
    const swapped = fromRecess ? recess / SI_CONSUMED_FRACTION : grown * OXIDE_ABOVE_FRACTION;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        fromRecess ? 0.8 : -0.6,
        mantissaDifficulty(fromRecess ? recess : grown),
      ]),
      stem: fromRecess
        ? `A LOCOS step must leave the field oxide sitting $${um(recess)}$ **above** the original ` +
          `silicon surface. How much total oxide has to be grown to achieve that?`
        : `An oxidation grows $${um(grown)}$ of $\\mathrm{SiO_2}$ on a silicon wafer. ` +
          `How much silicon is consumed from below the original surface?`,
      answer: {
        kind: 'numeric' as const,
        value,
        unit: 'um',
        tolerance: { rel: 0.02 },
      },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        {
          misconception: 'oxidation.consumption-fractions-swapped',
          value: swapped,
          tolerance: { rel: 0.015 },
          feedback: fromRecess
            ? `You divided by $0.44$. That fraction is the silicon *consumed* below the original surface; ` +
              `the part standing proud of it is $0.56$ of the grown oxide.`
            : `That is the oxide standing above the original surface, not the silicon eaten below it. ` +
              `The split is $44\\%$ down and $56\\%$ up.`,
        },
        {
          misconception: 'oxidation.expansion-ratio-applied-directly',
          value: fromRecess ? recess * 2.2 : grown / 2.2,
          tolerance: { rel: 0.015 },
          feedback:
            `The $2.2\\times$ figure is the *volume* expansion from silicon to its oxide. The thickness ` +
            `split that follows from it is $44/56$, and applying $2.2$ to a thickness directly double-counts it.`,
        },
      ]),
      explanation: {
        steps: [
          `Converting silicon to $\\mathrm{SiO_2}$ expands the volume by about $2.2\\times$ ` +
            `(molar volumes $12.06$ against $27.18\\ \\mathrm{cm^3/mol}$).`,
          `The film can only expand upward, so of any grown oxide $44\\%$ lies below the original ` +
            `silicon surface and $56\\%$ above it.`,
          fromRecess
            ? `Here the $56\\%$ is what is specified: $x_{0} = ${plain(recess)} / 0.56$.`
            : `Here the $44\\%$ is what is asked for: $x_{\\mathrm{Si}} = 0.44 \\times ${plain(grown)}$.`,
          fromRecess
            ? `Total oxide to grow $= ${um(value)}$, of which $${um(value * SI_CONSUMED_FRACTION)}$ comes out of the substrate.`
            : `Silicon consumed $= ${um(value)}$, leaving $${um(grown * OXIDE_ABOVE_FRACTION)}$ standing above the original surface.`,
        ],
        principle:
          'Oxide does not sit on the wafer; it partly replaces it. Every cross-section question in this course is that sentence applied to a specific step.',
        hints: [
          'Which of the two fractions does the question actually specify?',
          'Sketch the original surface as a line and put the oxide across it.',
        ],
      },
    };
  },
};

export const rateConstantArrhenius: Generator = {
  id: 'ee4392.oxidation.rate-constant',
  title: 'Rate constants from the Arrhenius form',
  kcRefs: [{ kc: 'ee4392.oxidation-rate-constants', weight: 1.0 }],
  difficultyB: 0.25,
  generate(rng: Rng) {
    const wet = rng() < 0.5;
    const parabolic = rng() < 0.5;
    const temperature = pick(rng, [850, 950, 1050, 1150]);

    // The lecture's own constants, in µm/min and µm²/min.
    const c = wet
      ? (parabolic ? { pre: 7.0, ea: 0.78 } : { pre: 2.95e6, ea: 2.05 })
      : (parabolic ? { pre: 12.87, ea: 1.23 } : { pre: 1.04e5, ea: 2.0 });

    const K_EV = 8.617e-5;
    const kelvin = temperature + 273.15;
    const perMinute = c.pre * Math.exp(-c.ea / (K_EV * kelvin));
    const perHour = perMinute * 60;

    const symbol = parabolic ? 'B' : 'B/A';
    const units = parabolic ? '\\mu m^2/hr' : '\\mu m/hr';

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        parabolic ? -0.4 : 0.4,
        temperature >= 1050 ? -0.3 : 0.4,
      ]),
      stem:
        `For ${wet ? 'steam' : 'dry oxygen'} oxidation the ${parabolic ? 'parabolic' : 'linear'} rate ` +
        `constant is $${symbol} = ${plain(c.pre)}\\exp\\!\\left(-${plain(c.ea)}\\,\\mathrm{eV}/kT\\right)$, ` +
        `with $${symbol}$ in $\\mathrm{${parabolic ? '\\mu m^2/min' : '\\mu m/min'}}$ and ` +
        `$k = 8.617\\times10^{-5}\\,\\mathrm{eV/K}$. ` +
        `Evaluate $${symbol}$ at $${celsius(temperature)}$, expressed in $\\mathrm{${units}}$.`,
      answer: { kind: 'numeric' as const, value: perHour, unit: '', tolerance: { rel: 0.04 } },
      options: [],
      misconceptionTraps: separatedTraps(perHour, { rel: 0.04 }, [
        {
          misconception: 'oxidation.hour-minute-confusion',
          value: perMinute,
          tolerance: { rel: 0.02 },
          feedback:
            `That is the constant in $\\mathrm{${parabolic ? '\\mu m^2/min' : '\\mu m/min'}}$. The prefactor is ` +
            `quoted per minute and the answer is wanted per hour, so multiply by $60$. ` +
            `This is the single commonest arithmetic slip in the unit.`,
        },
        {
          misconception: 'oxidation.celsius-used-as-kelvin',
          value: c.pre * Math.exp(-c.ea / (K_EV * temperature)) * 60,
          tolerance: { rel: 0.02 },
          feedback:
            `You put $${plain(temperature)}$ into $kT$ directly. An Arrhenius exponent needs absolute ` +
            `temperature: $T = ${plain(temperature)} + 273.15 = ${plain(kelvin)}\\,\\mathrm{K}$.`,
        },
      ]),
      explanation: {
        steps: [
          `Convert to absolute temperature: $T = ${plain(temperature)} + 273.15 = ${plain(kelvin)}\\,\\mathrm{K}$.`,
          `$kT = (8.617\\times10^{-5})(${plain(kelvin)}) = ${plain(K_EV * kelvin)}\\,\\mathrm{eV}$.`,
          `$${symbol} = ${plain(c.pre)}\\exp\\!\\left(-${plain(c.ea)}/${plain(K_EV * kelvin)}\\right) = ${plain(perMinute)}\\ \\mathrm{${parabolic ? '\\mu m^2/min' : '\\mu m/min'}}$.`,
          `The table is in hours, so $${symbol} = ${plain(perMinute)} \\times 60 = ${plain(perHour)}\\ \\mathrm{${units}}$.`,
        ],
        principle:
          'Both rate constants are activated processes. The activation energy says which physical step is rate-limiting — around 2 eV for the interface reaction whatever the ambient, and something ambient-specific for diffusion through the oxide.',
        hints: [
          'What temperature scale does an Arrhenius exponent require?',
          'Check the units on the prefactor against the units the answer is wanted in.',
        ],
      },
    };
  },
};

export const EE4392_OXIDATION_GENERATORS: readonly Generator[] = [
  oxideGrowthTime,
  oxideRegrowth,
  siliconConsumed,
  rateConstantArrhenius,
];
