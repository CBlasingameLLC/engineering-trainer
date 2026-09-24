import type { Generator } from '../types.js';
import { adjustDifficulty, mantissaDifficulty, pick, trimNumber, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';
import {
  EXPOSURE_SOURCES, nm, opticalMtf, plain, resistCmtf, resistContrast, tidy, um, unit,
} from './common.js';

/**
 * Photolithography: optics, then chemistry, then the one comparison that
 * decides whether a feature exists.
 *
 * The unit has a shape worth preserving in the items. Resolution and depth of
 * focus come from the same two numbers and move in opposite directions, so a
 * generator that only ever asks for one of them hides the trade that the whole
 * unit is about. Both are asked here, from the same draw, and the trap on each
 * is the other one's exponent.
 *
 * The contrast chain is the course's favourite multi-part question: two dose
 * limits give resist contrast, contrast gives CMTF, the aerial image gives
 * MTF, and only the comparison of the last two answers the question actually
 * asked. A learner can compute all three correctly and still not know whether
 * the feature printed, which is why the resolution criterion is a separate
 * mode rather than a footnote.
 */

export const rayleighResolution: Generator = {
  id: 'ee4392.litho.rayleigh',
  title: 'Resolution and depth of focus',
  kcRefs: [{ kc: 'ee4392.optical-resolution', weight: 1.0 }],
  difficultyB: 0.15,
  generate(rng: Rng) {
    const wantDof = rng() < 0.5;
    const source = pick(rng, [...EXPOSURE_SOURCES]);
    const na = tidy(pick(rng, [0.5, 0.55, 0.6, 0.65, 0.7, 0.75, 0.85, 0.93]), 0.01);
    // k1 equal to NA makes the resolution land exactly on the wavelength, which
    // reads as a derivation rather than a coincidence. Draw around it.
    const k1 = tidy(pick(rng, [0.6, 0.65, 0.7, 0.75, 0.8].filter((k) => Math.abs(k - na) > 1e-9)), 0.01);
    const k2 = tidy(pick(rng, [0.5, 0.6, 0.7]), 0.05);

    const resolution = (k1 * source.lambda) / na;
    const dof = (k2 * source.lambda) / (na * na);
    const value = wantDof ? dof : resolution;

    // Squaring the wrong factor is the error the whole trade-off hides behind.
    const exponentSwapped = wantDof
      ? (k2 * source.lambda) / na
      : (k1 * source.lambda) / (na * na);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        wantDof ? 0.4 : -0.4,
        mantissaDifficulty(na),
        na > 0.8 ? 0.3 : -0.2,
      ]),
      stem:
        `A projection stepper uses ${source.article} ${source.name} source at $\\lambda = ${nm(source.lambda)}$ with a ` +
        `numerical aperture of $\\mathrm{NA} = ${plain(na)}$. Taking ` +
        `${wantDof ? `$k_2 = ${plain(k2)}$` : `$k_1 = ${plain(k1)}$`}, find the ` +
        `${wantDof ? 'depth of focus (give the magnitude of the $\\pm$ bound)' : 'smallest resolvable feature'}.`,
      answer: { kind: 'numeric' as const, value, unit: 'nm', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        {
          misconception: 'litho.na-exponent-confused',
          value: exponentSwapped,
          tolerance: { rel: 0.015 },
          feedback: wantDof
            ? `Depth of focus goes as $\\mathrm{NA}^2$, not $\\mathrm{NA}$. That difference is the whole ` +
              `trade-off in the unit: raising NA buys resolution linearly and costs depth of focus quadratically.`
            : `Resolution goes as $\\mathrm{NA}$, not $\\mathrm{NA}^2$. The squared form is depth of focus.`,
        },
        {
          misconception: 'litho.na-inverted',
          value: wantDof ? k2 * source.lambda * na * na : k1 * source.lambda * na,
          tolerance: { rel: 0.015 },
          feedback:
            `NA belongs in the denominator. A larger aperture collects more diffracted orders, so it ` +
            `makes the resolvable feature **smaller** — multiplying by NA gets that backwards.`,
        },
      ]),
      explanation: {
        steps: [
          wantDof
            ? `Depth of focus is $\\mathrm{DOF} = \\pm\\dfrac{k_2\\lambda}{\\mathrm{NA}^2}$.`
            : `Rayleigh resolution is $R = \\dfrac{k_1\\lambda}{\\mathrm{NA}}$.`,
          wantDof
            ? `$\\mathrm{DOF} = \\pm\\dfrac{${plain(k2)} \\times ${plain(source.lambda)}}{${plain(na)}^2} = \\pm\\dfrac{${plain(k2 * source.lambda)}}{${plain(na * na)}}$.`
            : `$R = \\dfrac{${plain(k1)} \\times ${plain(source.lambda)}}{${plain(na)}}$.`,
          `${wantDof ? '$\\mathrm{DOF}$' : '$R$'} $= ${nm(value)}$${wantDof ? `, so the usable focal range is $${nm(2 * value)}$ wide in total` : ''}.`,
          `For the same system the other figure is ${wantDof ? `$R = ${nm(resolution)}$` : `$\\mathrm{DOF} = \\pm${nm(dof)}$`} — raising NA would improve one and damage the other.`,
        ],
        principle:
          'Resolution and depth of focus are set by the same aperture and pull against each other. Depth of focus is usually the binding constraint in practice, which is why wafer flatness is a lithography problem.',
        hints: [
          'Which of the two expressions squares the numerical aperture?',
          'Should a bigger aperture make the feature larger or smaller?',
        ],
      },
    };
  },
};

export const proximityPrinting: Generator = {
  id: 'ee4392.litho.proximity',
  title: 'Minimum feature in proximity printing',
  kcRefs: [
    { kc: 'ee4392.optical-resolution', weight: 0.6 },
    { kc: 'ee4392.litho-systems', weight: 0.4 },
  ],
  difficultyB: -0.1,
  generate(rng: Rng) {
    const source = pick(rng, EXPOSURE_SOURCES.filter((s) => s.lambda >= 365));
    const gap = tidy(pick(rng, [5, 7, 10, 15, 20, 25]), 0.5);
    const k = tidy(pick(rng, [0.5, 0.6, 0.7, 0.8, 1.0]), 0.05);

    const gapNm = gap * 1000;
    const wMin = Math.sqrt(k * source.lambda * gapNm);
    const forgotK = Math.sqrt(source.lambda * gapNm);
    // Multiplying rather than taking the root — dimensionally impossible and common.
    const noRoot = k * source.lambda * gap;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mantissaDifficulty(gap),
        k === 1.0 ? -0.5 : 0.3,
      ]),
      stem:
        `A proximity printer exposes with ${source.article} ${source.name} source at $\\lambda = ${nm(source.lambda)}$ ` +
        `across a mask-to-wafer gap of $g = ${um(gap)}$, with $k = ${plain(k)}$. ` +
        `What is the smallest feature it can print?`,
      answer: { kind: 'numeric' as const, value: wMin, unit: 'nm', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(wMin, { rel: 0.02 }, [
        {
          misconception: 'litho.proximity-k-dropped',
          value: forgotK,
          tolerance: { rel: 0.015 },
          feedback:
            `The $k$ factor sits inside the root: $W_{\\min} \\approx \\sqrt{k\\lambda g}$. ` +
            `Dropping it here reports a feature ${trimNumber(forgotK / wMin, 3)} times too large.`,
        },
        {
          misconception: 'litho.proximity-root-omitted',
          value: noRoot,
          tolerance: { rel: 0.015 },
          feedback:
            `No square root was taken. Check the dimensions: $\\lambda g$ is an area, so its root is ` +
            `the only combination of the two that can be a length.`,
        },
        {
          misconception: 'litho.gap-units-unconverted',
          value: Math.sqrt(k * source.lambda * gap),
          tolerance: { rel: 0.015 },
          feedback:
            `The gap is in micrometres and the wavelength in nanometres. Put both in the same unit ` +
            `first: $g = ${nm(gapNm)}$.`,
        },
      ]),
      explanation: {
        steps: [
          `Shadow printing is limited by Fresnel diffraction across the gap: $W_{\\min} \\approx \\sqrt{k \\lambda g}$.`,
          `Put both lengths in nanometres: $g = ${um(gap)} = ${nm(gapNm)}$.`,
          `$W_{\\min} = \\sqrt{${plain(k)} \\times ${plain(source.lambda)} \\times ${plain(gapNm)}} = \\sqrt{${plain(k * source.lambda * gapNm)}}$.`,
          `$W_{\\min} = ${nm(wMin)}$, which is $${um(wMin / 1000)}$.`,
        ],
        principle:
          'Proximity resolution improves as the square root of the gap, so closing the gap pays less and less — and hard contact, which would be best of all, damages the mask.',
        hints: [
          'What shape does the gap dependence take — linear or a root?',
          'Are the wavelength and the gap in the same units?',
        ],
      },
    };
  },
};

export const resistContrastChain: Generator = {
  id: 'ee4392.litho.resist-contrast',
  title: 'Resist contrast, CMTF and whether the image resolves',
  kcRefs: [{ kc: 'ee4392.resist-contrast', weight: 1.0 }],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const mode = pick(rng, ['contrast', 'cmtf', 'mtf', 'exposure'] as const);

    const q0 = tidy(pick(rng, [4, 5, 8, 10, 12, 15, 20, 22]), 1);
    const qf = tidy(q0 * pick(rng, [1.4, 1.8, 2.2, 3.0, 4.0, 6.0, 11.0]), 1);
    const iMax = tidy(pick(rng, [8, 10, 12, 15, 20]), 0.5);
    const iMin = tidy(iMax * pick(rng, [0, 0.05, 0.1, 0.2, 0.3]), 0.1);

    const gamma = resistContrast(q0, qf);
    const cmtf = resistCmtf(q0, qf);
    const mtf = opticalMtf(iMax, iMin);
    const exposureTime = qf / iMax;

    const value =
      mode === 'contrast' ? gamma
        : mode === 'cmtf' ? cmtf
          : mode === 'mtf' ? mtf
            : exposureTime;

    const ask =
      mode === 'contrast'
        ? `A resist first responds at $Q_0 = ${unit(q0, 'mJ/cm^2')}$ and is fully cleared at ` +
          `$Q_f = ${unit(qf, 'mJ/cm^2')}$. What is its contrast $\\gamma$?`
        : mode === 'cmtf'
          ? `A resist first responds at $Q_0 = ${unit(q0, 'mJ/cm^2')}$ and is fully cleared at ` +
            `$Q_f = ${unit(qf, 'mJ/cm^2')}$. What is its CMTF?`
          : mode === 'mtf'
            ? `An aerial image at the wafer swings between $I_{\\max} = ${unit(iMax, 'mW/cm^2')}$ and ` +
              `$I_{\\min} = ${unit(iMin, 'mW/cm^2')}$. What is the optical MTF?`
            : `A resist clears fully at $Q_f = ${unit(qf, 'mJ/cm^2')}$. The tool delivers ` +
              `$${unit(iMax, 'mW/cm^2')}$ at the centre of a clear feature. ` +
              `How long must it expose to clear the resist there?`;

    const traps =
      mode === 'contrast'
        ? [
          {
            misconception: 'resist.contrast-not-reciprocated',
            value: Math.log10(qf / q0),
            tolerance: { rel: 0.02 },
            feedback:
              `That is $\\log_{10}(Q_f/Q_0)$. Contrast is its **reciprocal**: ` +
              `$\\gamma = 1/\\log_{10}(Q_f/Q_0)$, so a resist that switches over a narrow dose range has a high $\\gamma$.`,
          },
          {
            misconception: 'resist.contrast-natural-log',
            value: 1 / Math.log(qf / q0),
            tolerance: { rel: 0.02 },
            feedback: `The definition uses $\\log_{10}$, not the natural log. The two differ by a factor of $\\ln 10 \\approx 2.303$.`,
          },
          {
            misconception: 'resist.dose-limits-inverted',
            value: -gamma,
            tolerance: { rel: 0.02 },
            feedback: `The ratio is $Q_f/Q_0$ with the larger dose on top, so $\\gamma$ is positive.`,
          },
        ]
        : mode === 'cmtf'
          ? [
            {
              misconception: 'resist.cmtf-sum-difference-swapped',
              value: (qf + q0) / (qf - q0),
              tolerance: { rel: 0.02 },
              feedback: `Difference over sum, not sum over difference. CMTF is a modulation depth, so it lies between $0$ and $1$.`,
            },
            {
              misconception: 'resist.cmtf-from-contrast-misapplied',
              value: (10 ** gamma - 1) / (10 ** gamma + 1),
              tolerance: { rel: 0.02 },
              feedback:
                `The exponent is $1/\\gamma$, not $\\gamma$: $\\mathrm{CMTF} = \\dfrac{10^{1/\\gamma} - 1}{10^{1/\\gamma} + 1}$. ` +
                `Both routes should agree — from the doses directly it is $${plain(cmtf)}$.`,
            },
          ]
          : mode === 'mtf'
            ? [
              {
                misconception: 'litho.mtf-sum-difference-swapped',
                value: iMin === 0 ? Number.POSITIVE_INFINITY : (iMax + iMin) / (iMax - iMin),
                tolerance: { rel: 0.02 },
                feedback: `Difference over sum. MTF is the contrast of the aerial image and cannot exceed $1$.`,
              },
              {
                misconception: 'litho.mtf-ratio-of-intensities',
                value: iMax === 0 ? 0 : iMin / iMax,
                tolerance: { rel: 0.02 },
                feedback: `That is the intensity ratio, not the modulation. MTF normalises the swing by the mean level.`,
              },
            ]
            : [
              {
                misconception: 'resist.exposure-uses-threshold-dose',
                value: q0 / iMax,
                tolerance: { rel: 0.02 },
                feedback:
                  `$Q_0$ is where the resist **begins** to respond. To clear it completely the dose has to ` +
                  `reach $Q_f$, so the time is $Q_f/I$.`,
              },
              {
                misconception: 'resist.dose-intensity-multiplied',
                value: qf * iMax,
                tolerance: { rel: 0.02 },
                feedback:
                  `Dose is intensity times time, so time is dose **divided** by intensity. ` +
                  `Check the units: $\\mathrm{mJ/cm^2}$ over $\\mathrm{mW/cm^2}$ leaves seconds.`,
              },
            ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mode === 'mtf' ? -0.8 : mode === 'exposure' ? -0.5 : mode === 'cmtf' ? 0.2 : 0.5,
        mantissaDifficulty(qf / q0),
      ]),
      stem: ask,
      answer: {
        kind: 'numeric' as const,
        value,
        unit: mode === 'exposure' ? 's' : '',
        tolerance: { rel: 0.03 },
      },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.03 }, traps.filter((t) => Number.isFinite(t.value))),
      explanation: {
        steps:
          mode === 'contrast'
            ? [
              `Resist contrast measures how sharply the resist switches over a dose range: $\\gamma = \\dfrac{1}{\\log_{10}(Q_f/Q_0)}$.`,
              `$Q_f/Q_0 = ${plain(qf)}/${plain(q0)} = ${plain(qf / q0)}$, so $\\log_{10}(Q_f/Q_0) = ${plain(Math.log10(qf / q0))}$.`,
              `$\\gamma = ${plain(value)}$ — a ${gamma > 5 ? 'high-contrast' : 'moderate-contrast'} resist.`,
            ]
            : mode === 'cmtf'
              ? [
                `The CMTF is the image modulation the resist needs before it can tell exposed from unexposed: $\\mathrm{CMTF} = \\dfrac{Q_f - Q_0}{Q_f + Q_0}$.`,
                `$\\mathrm{CMTF} = \\dfrac{${plain(qf)} - ${plain(q0)}}{${plain(qf)} + ${plain(q0)}} = \\dfrac{${plain(qf - q0)}}{${plain(qf + q0)}}$.`,
                `$\\mathrm{CMTF} = ${plain(value)}$. The same number follows from the contrast $\\gamma = ${plain(gamma)}$ through $\\dfrac{10^{1/\\gamma} - 1}{10^{1/\\gamma} + 1}$.`,
              ]
              : mode === 'mtf'
                ? [
                  `The optical MTF is the contrast the projected image actually has: $\\mathrm{MTF} = \\dfrac{I_{\\max} - I_{\\min}}{I_{\\max} + I_{\\min}}$.`,
                  `$\\mathrm{MTF} = \\dfrac{${plain(iMax)} - ${plain(iMin)}}{${plain(iMax)} + ${plain(iMin)}} = \\dfrac{${plain(iMax - iMin)}}{${plain(iMax + iMin)}}$.`,
                  `$\\mathrm{MTF} = ${plain(value)}$${iMin === 0 ? ' — a perfectly dark background gives the ideal value of 1' : ''}.`,
                ]
                : [
                  `Dose is intensity integrated over time, and the intensity here is constant: $Q = I t$.`,
                  `Clearing the resist completely needs $Q_f$, not merely $Q_0$.`,
                  `$t = \\dfrac{Q_f}{I} = \\dfrac{${plain(qf)}}{${plain(iMax)}}$.`,
                  `$t = ${unit(value, 's')}$.`,
                ],
        principle:
          'Contrast, CMTF and MTF are three numbers about the same exposure: what the resist needs, and what the optics supply. The feature prints only when the optics supply more than the resist needs.',
        hints:
          mode === 'exposure'
            ? ['Which dose corresponds to fully cleared resist?', 'What are the units of dose over intensity?']
            : ['Write the definition down before substituting.', 'Should the result be larger or smaller than one?'],
      },
    };
  },
};

export const resolutionCriterion: Generator = {
  id: 'ee4392.litho.resolution-criterion',
  title: 'Does the feature resolve?',
  kcRefs: [
    { kc: 'ee4392.resist-contrast', weight: 0.7 },
    { kc: 'ee4392.optical-resolution', weight: 0.3 },
  ],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const q0 = tidy(pick(rng, [4, 5, 8, 10, 15, 20]), 1);
    const qf = tidy(q0 * pick(rng, [1.3, 1.6, 2.0, 3.0, 5.0, 9.0]), 1);
    const iMax = tidy(pick(rng, [10, 12, 15, 20]), 0.5);
    const iMin = tidy(iMax * pick(rng, [0, 0.05, 0.1, 0.2, 0.35, 0.5]), 0.1);

    const cmtf = resistCmtf(q0, qf);
    const mtf = opticalMtf(iMax, iMin);
    const resolves = mtf > cmtf;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        Math.abs(mtf - cmtf) < 0.12 ? 0.9 : -0.5,
        mantissaDifficulty(qf / q0),
      ]),
      stem:
        `A resist responds between $Q_0 = ${unit(q0, 'mJ/cm^2')}$ and $Q_f = ${unit(qf, 'mJ/cm^2')}$. ` +
        `The aerial image for the feature of interest swings between ` +
        `$I_{\\max} = ${unit(iMax, 'mW/cm^2')}$ and $I_{\\min} = ${unit(iMin, 'mW/cm^2')}$. ` +
        `Will this feature resolve?`,
      answer: { kind: 'choice' as const, correctId: resolves ? 'yes' : 'no' },
      options: [
        {
          id: 'yes',
          text: 'Yes — the optical MTF exceeds the resist CMTF',
          ...(resolves ? {} : { misconception: 'litho.resolution-criterion-inverted' }),
        },
        {
          id: 'no',
          text: 'No — the resist needs more image modulation than the optics deliver',
          ...(resolves ? { misconception: 'litho.resolution-criterion-inverted' } : {}),
        },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `What the resist needs: $\\mathrm{CMTF} = \\dfrac{Q_f - Q_0}{Q_f + Q_0} = \\dfrac{${plain(qf - q0)}}{${plain(qf + q0)}} = ${plain(cmtf)}$.`,
          `What the optics supply: $\\mathrm{MTF} = \\dfrac{I_{\\max} - I_{\\min}}{I_{\\max} + I_{\\min}} = \\dfrac{${plain(iMax - iMin)}}{${plain(iMax + iMin)}} = ${plain(mtf)}$.`,
          `The feature resolves when $\\mathrm{MTF} > \\mathrm{CMTF}$. Here $${plain(mtf)} ${resolves ? '>' : '<'} ${plain(cmtf)}$.`,
          `So the feature **${resolves ? 'resolves' : 'does not resolve'}**${resolves ? ', given enough exposure time' : ' — a higher-contrast resist or a sharper aerial image is needed'}.`,
        ],
        principle:
          'The comparison runs one way: the image must be more modulated than the resist requires. A high-contrast resist is forgiving of a poor image, which is why resist contrast rose as wavelengths fell.',
        hints: [
          'Compute both numbers before comparing them.',
          'Which of the two is a property of the resist, and which of the optics?',
        ],
      },
    };
  },
};

export const EE4392_LITHOGRAPHY_GENERATORS: readonly Generator[] = [
  rayleighResolution,
  proximityPrinting,
  resistContrastChain,
  resolutionCriterion,
];
