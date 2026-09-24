import type { Generator } from '../types.js';
import { adjustDifficulty, mantissaDifficulty, pick, trimNumber, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';
import { plain, tidy, unit } from './common.js';

/**
 * Defect density, yield and process capability.
 *
 * The three yield models are one model read at three clustering factors, and
 * the exam question is usually "which of these applies and why" rather than
 * the arithmetic. What makes them worth generating anyway is the comparison:
 * a learner who computes Poisson and negative-binomial yields for the same die
 * and sees the gap has understood what clustering *does*, which no amount of
 * reading the slide supplies.
 *
 * One correction is baked in here. L05 states that the negative binomial
 * becomes Poisson "when C = 0". It does not — the limit of
 * (1 + A D / C)^(-C) as C tends to zero is an indeterminate form, and the
 * Poisson curve is the C to infinity limit. The slide's own yield plot shows
 * it: C = 10 sits nearer the Poisson curve than C = 2 does. Items here use the
 * limit that is true, because a learner who reasons from C = 0 will get the
 * direction of the clustering effect backwards.
 */

const poisson = (area: number, d0: number): number => Math.exp(-area * d0);
const negBinomial = (area: number, d0: number, c: number): number =>
  (1 + (area * d0) / c) ** -c;
const seeds = (area: number, d0: number): number => 1 / (1 + area * d0);

export const yieldModels: Generator = {
  id: 'ee4392.yield.models',
  title: 'Die yield from defect density',
  kcRefs: [{ kc: 'ee4392.yield-models', weight: 1.0 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const model = pick(rng, ['poisson', 'negative-binomial', 'seeds'] as const);
    const edge = tidy(pick(rng, [4, 5, 6, 7, 8, 10, 12]), 0.1);
    const area = Number((edge * edge / 100).toPrecision(6)); // mm edge -> cm^2
    const d0 = tidy(pick(rng, [0.2, 0.3, 0.4, 0.5, 0.8, 1.0, 1.5]), 0.01);
    const c = pick(rng, [2, 3, 5]);

    const value =
      model === 'poisson' ? poisson(area, d0)
        : model === 'seeds' ? seeds(area, d0)
          : negBinomial(area, d0, c);

    const modelName =
      model === 'poisson' ? 'the Poisson model'
        : model === 'seeds' ? 'the Seeds model'
          : `the negative binomial model with a clustering factor $C = ${plain(c)}$`;

    // Every wrong model is a plausible answer to the same question, which is
    // exactly why naming the model matters more than the arithmetic here.
    const alternatives: { misconception: string; value: number; note: string }[] = [
      {
        misconception: 'yield.poisson-substituted',
        value: poisson(area, d0),
        note: `That is the Poisson yield. Poisson assumes defects fall independently, which real defects do not — they cluster, so Poisson **underpredicts** yield for a die this size.`,
      },
      {
        misconception: 'yield.seeds-substituted',
        value: seeds(area, d0),
        note: `That is the Seeds model, the negative binomial at $C = 1$. It assumes heavier clustering than ${model === 'negative-binomial' ? `$C = ${plain(c)}$` : 'the model asked for'} and so predicts a higher yield.`,
      },
      {
        misconception: 'yield.clustering-exponent-sign',
        value: (1 + (area * d0) / c) ** c,
        note: `The exponent is $-C$, not $+C$. A yield above one should have stopped this: yield is a probability.`,
      },
    ].filter((alt) => Math.abs(alt.value - value) > 1e-9);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        model === 'poisson' ? -0.7 : model === 'seeds' ? -0.2 : 0.7,
        mantissaDifficulty(d0),
        area * d0 > 1 ? 0.3 : -0.3,
      ]),
      stem:
        `A die measures $${plain(edge)}\\,\\mathrm{mm}$ on a side and the line runs at a defect density of ` +
        `$D_0 = ${unit(d0, 'cm^{-2}')}$. Estimate the die yield using ${modelName}.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { rel: 0.03, abs: 0.005 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.03, abs: 0.005 }, [
        ...alternatives.map((alt) => ({
          misconception: alt.misconception,
          value: alt.value,
          tolerance: { rel: 0.02 },
          feedback: alt.note,
        })),
        {
          misconception: 'yield.area-units-unconverted',
          value:
            model === 'poisson' ? poisson(edge * edge, d0)
              : model === 'seeds' ? seeds(edge * edge, d0)
                : negBinomial(edge * edge, d0, c),
          tolerance: { rel: 0.02 },
          feedback:
            `You used $${plain(edge * edge)}$ as the area. The edge is in millimetres and $D_0$ is per ` +
            `square centimetre, so $A_c = (${plain(edge)}/10)^2 = ${unit(area, 'cm^2')}$.`,
        },
      ]),
      explanation: {
        steps: [
          `Put the area in the same units as the defect density: $A_c = \\left(\\dfrac{${plain(edge)}\\,\\mathrm{mm}}{10}\\right)^2 = ${unit(area, 'cm^2')}$.`,
          `The expected defect count per die is $A_c D_0 = ${plain(area * d0)}$.`,
          model === 'poisson'
            ? `Poisson: $Y = e^{-A_c D_0} = e^{-${plain(area * d0)}}$.`
            : model === 'seeds'
              ? `Seeds: $Y = \\dfrac{1}{1 + A_c D_0} = \\dfrac{1}{1 + ${plain(area * d0)}}$.`
              : `Negative binomial: $Y = \\left(1 + \\dfrac{A_c D_0}{C}\\right)^{-C} = \\left(1 + \\dfrac{${plain(area * d0)}}{${plain(c)}}\\right)^{-${plain(c)}}$.`,
          `$Y = ${plain(value)}$, or about ${trimNumber(value * 100, 3)}% of die good.`,
        ],
        principle:
          'All three models answer the same question and differ only in how much they believe defects cluster. Poisson is the no-clustering extreme and the pessimistic one; the negative binomial approaches it as C grows.',
        hints: [
          'What are the units on the defect density, and do they match the area?',
          'Which model does the question name, and what does its parameter mean?',
        ],
      },
    };
  },
};

export const processCapability: Generator = {
  id: 'ee4392.yield.process-capability',
  title: 'Process capability, Cp and Cpk',
  kcRefs: [{ kc: 'ee4392.process-capability', weight: 1.0 }],
  difficultyB: 0.05,
  generate(rng: Rng) {
    const wantCpk = rng() < 0.6;
    const target = tidy(pick(rng, [100, 50, 20, 3.3, 5]), 0.1);
    const halfWidth = Number((target * pick(rng, [0.05, 0.08, 0.1, 0.15])).toPrecision(4));
    const usl = Number((target + halfWidth).toPrecision(6));
    const lsl = Number((target - halfWidth).toPrecision(6));

    // Off-centre by a drawn fraction of the half-width, so Cp and Cpk differ.
    const offset = Number((halfWidth * pick(rng, [0.1, 0.2, 0.3, 0.4])).toPrecision(4))
      * (rng() < 0.5 ? -1 : 1);
    const mean = Number((target + offset).toPrecision(6));
    const sigma = Number((halfWidth / pick(rng, [3, 4, 5, 6])).toPrecision(4));

    const cp = (usl - lsl) / (6 * sigma);
    const cpk = Math.min((usl - mean) / (3 * sigma), (mean - lsl) / (3 * sigma));
    const value = wantCpk ? cpk : cp;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        wantCpk ? 0.5 : -0.6,
        Math.abs(offset) / halfWidth > 0.25 ? -0.2 : 0.3,
      ]),
      stem:
        `An oxide-thickness measurement is specified between $\\mathrm{LSL} = ${plain(lsl)}$ and ` +
        `$\\mathrm{USL} = ${plain(usl)}\\ \\mathrm{nm}$. The line delivers a mean of ` +
        `$\\bar{X} = ${plain(mean)}\\ \\mathrm{nm}$ with $\\sigma = ${plain(sigma)}\\ \\mathrm{nm}$. ` +
        `Find $C_{p${wantCpk ? 'k' : ''}}$.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        {
          misconception: 'capability.cp-cpk-confused',
          value: wantCpk ? cp : cpk,
          tolerance: { rel: 0.015 },
          feedback: wantCpk
            ? `That is $C_p$, which only measures spread. $C_{pk}$ also charges the process for being ` +
              `off-centre, and this mean sits $${plain(Math.abs(offset))}\\ \\mathrm{nm}$ from the midpoint.`
            : `That is $C_{pk}$. $C_p$ compares the whole specification width against $6\\sigma$ and ` +
              `takes no view on where the mean sits.`,
        },
        {
          misconception: 'capability.wrong-sigma-multiple',
          value: wantCpk ? cpk * 2 : cp * 2,
          tolerance: { rel: 0.015 },
          feedback:
            `Check the denominator. $C_p$ divides the full width by $6\\sigma$; $C_{pk}$ divides a ` +
            `**one-sided** distance by $3\\sigma$. Mixing them scales the answer by two.`,
        },
        ...(wantCpk
          ? [{
            misconception: 'capability.wrong-specification-limit',
            value: Math.max((usl - mean) / (3 * sigma), (mean - lsl) / (3 * sigma)),
            tolerance: { rel: 0.015 },
            feedback:
              `You took the larger of the two one-sided ratios. $C_{pk}$ is the **minimum** — the process ` +
              `is only as capable as its nearer specification limit, because that is the one it will fail first.`,
          }]
          : []),
      ]),
      explanation: {
        steps: [
          `The specification width is $\\mathrm{USL} - \\mathrm{LSL} = ${plain(usl - lsl)}\\ \\mathrm{nm}$, ` +
            `and its midpoint is $${plain((usl + lsl) / 2)}\\ \\mathrm{nm}$.`,
          wantCpk
            ? `$C_{pk} = \\min\\left[\\dfrac{\\mathrm{USL} - \\bar{X}}{3\\sigma}, \\dfrac{\\bar{X} - \\mathrm{LSL}}{3\\sigma}\\right] = \\min\\left[${plain((usl - mean) / (3 * sigma))}, ${plain((mean - lsl) / (3 * sigma))}\\right]$.`
            : `$C_p = \\dfrac{\\mathrm{USL} - \\mathrm{LSL}}{6\\sigma} = \\dfrac{${plain(usl - lsl)}}{6 \\times ${plain(sigma)}}$.`,
          `$C_{p${wantCpk ? 'k' : ''}} = ${plain(value)}$.`,
          wantCpk
            ? `For comparison $C_p = ${plain(cp)}$; the gap between them is the cost of the mean sitting off target, and it closes by recentring rather than by reducing variation.`
            : `The mean is off target here, so $C_{pk} = ${plain(cpk)}$ is lower — spread alone is not the whole story.`,
        ],
        principle:
          'Cp asks whether the distribution could fit inside the specification; Cpk asks whether it currently does. A large gap between them is a centring problem, which is usually the cheaper one to fix.',
        hints: [
          'Which of the two indices notices where the mean is?',
          'For Cpk, which specification limit is the process closer to?',
        ],
      },
    };
  },
};

export const EE4392_YIELD_GENERATORS: readonly Generator[] = [yieldModels, processCapability];
