import type { Generator } from '../types.js';
import {
  adjustDifficulty, mantissaDifficulty, pick, trimNumber, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';
import { micrometres, millimetres, nanometres, q, tidy } from './common.js';

/**
 * Optics — roughly a third of the course, and absent from this file until the
 * syllabus arrived. Vol III chapters 2 to 4, examined on Exams 2 and 3.
 *
 * One trap runs through the whole wave-optics half and is worth stating once.
 * The two headline conditions are typographically almost identical:
 *
 *     d sin(theta) = m lambda      two slits, MAXIMA
 *     a sin(theta) = m lambda      one slit,  MINIMA
 *
 * A learner who has memorised the shape rather than the derivation will answer
 * either question with either formula and get a number that is the right order
 * of magnitude, correctly dimensioned, and wrong. Every generator here traps
 * that specific substitution, because nothing else about the answer reveals it.
 *
 * The second recurring error is geometric rather than physical: angles in
 * Snell's law are measured from the **normal**, not from the surface, so a
 * wrong answer is frequently the complement of the right one.
 */

/** Refractive indices as the course's problems use them. */
const MEDIA: readonly { name: string; n: number }[] = [
  { name: 'air', n: 1.00 },
  { name: 'water', n: 1.33 },
  { name: 'ethanol', n: 1.36 },
  { name: 'crown glass', n: 1.52 },
  { name: 'flint glass', n: 1.66 },
  { name: 'diamond', n: 2.42 },
];

/** Visible wavelengths in nanometres, with the colour the course names. */
const LIGHT: readonly { name: string; nm: number }[] = [
  { name: 'violet', nm: 410 },
  { name: 'blue', nm: 470 },
  { name: 'green', nm: 532 },
  { name: 'yellow', nm: 589 },
  { name: 'red', nm: 633 },
  { name: 'deep red', nm: 700 },
];

const degrees = (radians: number): number => (radians * 180) / Math.PI;

export const twoSlitInterference: Generator = {
  id: 'phys2335.optics.two-slit',
  title: 'Two-slit interference',
  kcRefs: [{ kc: 'phys2335.two-slit-interference', weight: 1.0 }],
  difficultyB: 0.05,
  generate(rng: Rng) {
    const light = pick(rng, [...LIGHT]);
    const spacingUm = tidy(pick(rng, [8, 12, 20, 25, 40, 60]), 0.5);
    const order = pick(rng, [1, 2, 3]);
    const askSpacing = rng() < 0.4;
    const screen = tidy(pick(rng, [1.2, 1.5, 2.0, 2.5, 3.0]), 0.1);

    const d = spacingUm * 1e-6;
    const lambda = light.nm * 1e-9;
    const sinTheta = (order * lambda) / d;
    const theta = degrees(Math.asin(sinTheta));
    // Small-angle fringe spacing on a distant screen.
    const fringe = (lambda * screen) / d;

    const value = askSpacing ? fringe * 1000 : theta;

    // The single-slit condition substituted here gives the same number for the
    // minima, so the trap is the *interpretation* — trapped instead on the
    // half-integer order, which is what a destructive-fringe formula returns.
    const destructive = degrees(Math.asin(((order - 0.5) * lambda) / d));

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        askSpacing ? -0.4 : 0.3,
        order > 1 ? 0.3 : -0.3,
        mantissaDifficulty(spacingUm),
      ]),
      stem: askSpacing
        ? `Two narrow slits $${micrometres(spacingUm)}$ apart are illuminated with ${light.name} light of ` +
          `wavelength $${nanometres(light.nm)}$. The interference pattern is observed on a screen ` +
          `$${q(screen, 'm')}$ away. What is the spacing between adjacent bright fringes, in millimetres?`
        : `Two narrow slits $${micrometres(spacingUm)}$ apart are illuminated with ${light.name} light of ` +
          `wavelength $${nanometres(light.nm)}$. At what angle from the central maximum does the ` +
          `$m = ${order}$ **bright** fringe appear?`,
      answer: {
        kind: 'numeric' as const,
        value,
        unit: askSpacing ? 'mm' : 'deg',
        tolerance: { rel: 0.02 },
      },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        ...(askSpacing
          ? [
            {
              misconception: 'optics.fringe-spacing-screen-omitted',
              value: (lambda / d) * 1000,
              tolerance: { rel: 0.015 },
              feedback:
                `You stopped at $\\lambda/d$, which is an angle in radians, not a distance. ` +
                `The fringe separation on the screen is $\\Delta y = \\lambda L/d$.`,
            },
          ]
          : [
            {
              misconception: 'optics.maxima-minima-condition-swapped',
              value: destructive,
              tolerance: { rel: 0.015 },
              feedback:
                `That is a **dark** fringe. For two slits the bright fringes sit where the path ` +
                `difference is a whole number of wavelengths, $d\\sin\\theta = m\\lambda$; the dark ones ` +
                `fall at the half-integers.`,
            },
            {
              misconception: 'optics.small-angle-assumed',
              value: degrees(sinTheta),
              tolerance: { rel: 0.015 },
              feedback:
                `You treated $\\sin\\theta$ as $\\theta$ itself. That approximation is fine for the ` +
                `first fringe of a wide-slit pattern and not here — take the arcsine.`,
            },
          ]),
      ]),
      explanation: {
        steps: [
          `Light from the two slits travels different distances to a given point, and the difference is $d\\sin\\theta$.`,
          `A **bright** fringe needs that difference to be a whole number of wavelengths: $d\\sin\\theta = m\\lambda$.`,
          askSpacing
            ? `For small angles $\\sin\\theta \\approx \\tan\\theta = y/L$, so adjacent maxima are separated by $\\Delta y = \\dfrac{\\lambda L}{d} = \\dfrac{${trimNumber(lambda, 3)} \\times ${trimNumber(screen)}}{${trimNumber(d, 3)}}$.`
            : `$\\sin\\theta = \\dfrac{m\\lambda}{d} = \\dfrac{${order} \\times ${trimNumber(lambda, 3)}}{${trimNumber(d, 3)}} = ${trimNumber(sinTheta, 4)}$.`,
          askSpacing
            ? `$\\Delta y = ${millimetres(value)}$.`
            : `$\\theta = \\arcsin(${trimNumber(sinTheta, 4)}) = ${q(value, 'degrees')}$.`,
        ],
        principle:
          'Interference is decided by path difference measured in wavelengths. Everything else in the topic — fringe spacing, order number, screen distance — is geometry applied to that one idea.',
        hints: [
          'What must the path difference equal for constructive interference?',
          'Is the quantity you have computed an angle, a sine, or a distance?',
        ],
      },
    };
  },
};

export const diffractionGrating: Generator = {
  id: 'phys2335.optics.grating',
  title: 'Diffraction grating angles',
  kcRefs: [{ kc: 'phys2335.multiple-slit-grating', weight: 1.0 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const light = pick(rng, [...LIGHT]);
    const linesPerMm = pick(rng, [100, 300, 500, 600, 750]);
    const order = pick(rng, [1, 2]);
    // Two directions. Reading an angle off a grating to recover a wavelength is
    // what the instrument exists for, and it is the harder ask — without it
    // every item in this generator landed at the same ability point, which
    // gives adaptive selection nothing to choose between.
    const askWavelength = rng() < 0.4;

    const d = 1 / (linesPerMm * 1000); // metres
    const lambda = light.nm * 1e-9;
    const sinTheta = (order * lambda) / d;
    const theta = degrees(Math.asin(sinTheta));

    // Treating lines/mm as the spacing itself rather than its reciprocal.
    const notInverted = degrees(Math.asin(Math.min(0.999999, order * lambda * linesPerMm)));
    // Forgetting the mm-to-m conversion, so d is a thousand times too big.
    const wrongScale = degrees(Math.asin((order * lambda) / (1 / linesPerMm)));

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        askWavelength ? 1 : -1,
        askWavelength ? 0.7 : -0.5,
        order > 1 ? 0.4 : -0.3,
      ]),
      stem: askWavelength
        ? `A diffraction grating ruled with $${trimNumber(linesPerMm)}$ lines per millimetre is used ` +
          `to measure an unknown spectral line. Its $m = ${order}$ maximum is found at ` +
          `$${q(theta, 'degrees')}$ from the straight-through direction. What is the wavelength, ` +
          `in nanometres?`
        : `A diffraction grating is ruled with $${trimNumber(linesPerMm)}$ lines per millimetre and is ` +
          `illuminated at normal incidence by ${light.name} light of wavelength $${nanometres(light.nm)}$. ` +
          `At what angle does the $m = ${order}$ maximum appear?`,
      answer: askWavelength
        ? { kind: 'numeric' as const, value: light.nm, unit: 'nm', tolerance: { rel: 0.02 } }
        : { kind: 'numeric' as const, value: theta, unit: 'deg', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(askWavelength ? light.nm : theta, { rel: 0.02 }, askWavelength
        ? [
          {
            misconception: 'optics.grating-order-ignored',
            value: light.nm * order,
            tolerance: { rel: 0.015 },
            feedback:
              `You solved $\\lambda = d\\sin\\theta$ without dividing by the order. This is the ` +
              `$m = ${order}$ maximum, so $\\lambda = d\\sin\\theta / ${order}$.`,
          },
          {
            misconception: 'optics.grating-spacing-not-inverted',
            value: light.nm * (d * 1e3) ** 2,
            tolerance: { rel: 0.015 },
            feedback:
              `Lines per millimetre is the reciprocal of the spacing. Invert it before using it: ` +
              `$d = ${nanometres(d * 1e9)}$.`,
          },
        ]
        : [
        {
          misconception: 'optics.grating-spacing-not-inverted',
          value: notInverted,
          tolerance: { rel: 0.015 },
          feedback:
            `Lines per millimetre is the *reciprocal* of the slit spacing. Invert it first: ` +
            `$d = 1/(${trimNumber(linesPerMm)}\\ \\mathrm{mm^{-1}}) = ${nanometres(d * 1e9)}$.`,
        },
        {
          misconception: 'optics.grating-units-unconverted',
          value: wrongScale,
          tolerance: { rel: 0.015 },
          feedback:
            `The spacing came out in millimetres while the wavelength is in metres. ` +
            `$d = ${nanometres(d * 1e9)} = ${trimNumber(d, 3)}\\ \\mathrm{m}$.`,
        },
      ]),
      explanation: {
        steps: askWavelength
          ? [
            `Lines per millimetre gives the spacing by reciprocal: $d = \\dfrac{1}{${trimNumber(linesPerMm)}\\ \\mathrm{mm^{-1}}} = ${nanometres(d * 1e9)}$.`,
            `The maximum condition $d\\sin\\theta = m\\lambda$ rearranges for the unknown wavelength: $\\lambda = \\dfrac{d\\sin\\theta}{m}$.`,
            `$\\sin ${trimNumber(theta, 4)}^{\\circ} = ${trimNumber(sinTheta, 4)}$, so $\\lambda = \\dfrac{${trimNumber(d, 3)} \\times ${trimNumber(sinTheta, 4)}}{${order}}$.`,
            `$\\lambda = ${nanometres(light.nm)}$, which is ${light.name} light.`,
          ]
          : [
            `Lines per millimetre gives the spacing by reciprocal: $d = \\dfrac{1}{${trimNumber(linesPerMm)}\\ \\mathrm{mm^{-1}}} = ${nanometres(d * 1e9)}$.`,
            `A grating obeys the same maximum condition as two slits — more slits sharpen the maxima rather than moving them: $d\\sin\\theta = m\\lambda$.`,
            `$\\sin\\theta = \\dfrac{${order} \\times ${trimNumber(lambda, 3)}}{${trimNumber(d, 3)}} = ${trimNumber(sinTheta, 4)}$.`,
            `$\\theta = ${q(theta, 'degrees')}$.`,
          ],
        principle:
          'A grating measures wavelength because its maxima are narrow, not because they are anywhere new. The number of slits sets the sharpness; the spacing sets the angles.',
        hints: [
          'Is the quoted figure the spacing, or its reciprocal?',
          'Are the spacing and the wavelength in the same units?',
        ],
      },
    };
  },
};

export const singleSlitDiffraction: Generator = {
  id: 'phys2335.optics.single-slit',
  title: 'Single-slit diffraction minima',
  kcRefs: [{ kc: 'phys2335.single-slit-diffraction', weight: 1.0 }],
  difficultyB: 0.45,
  generate(rng: Rng) {
    const light = pick(rng, [...LIGHT]);
    const widthUm = tidy(pick(rng, [2, 3, 5, 8, 12, 20]), 0.5);
    const order = pick(rng, [1, 2, 3]);
    const askWidth = rng() < 0.35;
    const screen = tidy(pick(rng, [1.5, 2.0, 2.5, 3.0]), 0.1);

    const a = widthUm * 1e-6;
    const lambda = light.nm * 1e-9;
    const sinTheta = (order * lambda) / a;
    const theta = degrees(Math.asin(sinTheta));
    // Width of the central maximum on a distant screen: 2 lambda L / a.
    const centralWidth = (2 * lambda * screen) / a;

    const value = askWidth ? centralWidth * 1000 : theta;

    // The classic: reading a sin(theta) = m lambda as locating a maximum, which
    // puts the first bright fringe where the first dark one actually is.
    const halfInteger = degrees(Math.asin(((order + 0.5) * lambda) / a));

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        // The mode has to dominate here. Slit width and order barely change how
        // hard the arithmetic is, so keying difficulty off them alone put every
        // item in one band.
        askWidth ? 1 : -1,
        askWidth ? 0.6 : -0.6,
        order > 1 ? 0.3 : -0.3,
      ]),
      stem: askWidth
        ? `A single slit of width $${micrometres(widthUm)}$ is illuminated with ${light.name} light of ` +
          `wavelength $${nanometres(light.nm)}$, and the pattern falls on a screen $${q(screen, 'm')}$ away. ` +
          `How wide is the central bright maximum, in millimetres?`
        : `A single slit of width $${micrometres(widthUm)}$ is illuminated with ${light.name} light of ` +
          `wavelength $${nanometres(light.nm)}$. At what angle does the $m = ${order}$ **dark** fringe fall?`,
      answer: {
        kind: 'numeric' as const,
        value,
        unit: askWidth ? 'mm' : 'deg',
        tolerance: { rel: 0.02 },
      },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        ...(askWidth
          ? [
            {
              misconception: 'optics.central-maximum-half-width',
              value: ((lambda * screen) / a) * 1000,
              tolerance: { rel: 0.015 },
              feedback:
                `That is the distance from the centre to the first minimum — half of it. The central ` +
                `maximum runs from the first dark fringe on one side to the first on the other, so it is ` +
                `twice as wide as that.`,
            },
          ]
          : [
            {
              misconception: 'optics.maxima-minima-condition-swapped',
              value: halfInteger,
              tolerance: { rel: 0.015 },
              feedback:
                `For a **single** slit, $a\\sin\\theta = m\\lambda$ locates the **minima**, not the maxima. ` +
                `The half-integer condition you used is the two-slit rule for dark fringes, and it is the ` +
                `single commonest confusion in this unit.`,
            },
            {
              misconception: 'optics.small-angle-assumed',
              value: degrees(sinTheta),
              tolerance: { rel: 0.015 },
              feedback:
                `You read $\\sin\\theta$ as the angle in degrees. Take the arcsine — at this slit width ` +
                `the angles are large enough that the approximation is not safe.`,
            },
          ]),
      ]),
      explanation: {
        steps: [
          `Waves from opposite halves of the slit cancel when they are half a wavelength out of step, and working that through gives $a\\sin\\theta = m\\lambda$ for the **dark** fringes.`,
          `This is the opposite of the two-slit rule, where the same-looking equation gives the bright ones. $m = 0$ is excluded here — straight ahead is the central maximum.`,
          askWidth
            ? `The first minima sit at $\\sin\\theta = \\lambda/a$ on each side, so on a distant screen the central maximum spans $\\dfrac{2\\lambda L}{a} = \\dfrac{2 \\times ${trimNumber(lambda, 3)} \\times ${trimNumber(screen)}}{${trimNumber(a, 3)}}$.`
            : `$\\sin\\theta = \\dfrac{m\\lambda}{a} = \\dfrac{${order} \\times ${trimNumber(lambda, 3)}}{${trimNumber(a, 3)}} = ${trimNumber(sinTheta, 4)}$.`,
          askWidth
            ? `Central maximum width $= ${millimetres(value)}$ — note that a *narrower* slit spreads the pattern wider.`
            : `$\\theta = ${q(value, 'degrees')}$.`,
        ],
        principle:
          'A single slit diffracts more as it narrows, which is the opposite of the intuition that a small hole makes a small spot. The equation that says so is the two-slit equation with its meaning inverted.',
        hints: [
          'Does this condition locate bright fringes or dark ones?',
          'What happens to the pattern as the slit gets narrower?',
        ],
      },
    };
  },
};

export const snellRefraction: Generator = {
  id: 'phys2335.optics.snell',
  title: "Refraction and Snell's law",
  kcRefs: [{ kc: 'phys2335.reflection-refraction', weight: 1.0 }],
  difficultyB: -0.25,
  generate(rng: Rng) {
    const from = pick(rng, [...MEDIA]);
    const to = pick(rng, MEDIA.filter((m) => Math.abs(m.n - from.n) > 0.15));
    const incident = tidy(pick(rng, [15, 20, 25, 30, 35, 40, 45, 50]), 1);

    const sinRefracted = (from.n * Math.sin((incident * Math.PI) / 180)) / to.n;
    // Drawn so the ray always transmits. Past the critical angle there is no
    // refracted ray at all, and an item asking for its angle would have no
    // answer — so the draw falls back to a shallow incidence that always
    // transmits rather than emitting one.
    const transmits = Math.abs(sinRefracted) <= 0.999;
    const safeIncident = transmits ? incident : 15;
    const safeSin = (from.n * Math.sin((safeIncident * Math.PI) / 180)) / to.n;
    const value = degrees(Math.asin(safeSin));

    // Indices applied to the wrong angles — the ratio inverted.
    const inverted = degrees(Math.asin(Math.min(0.999999, (to.n * Math.sin((safeIncident * Math.PI) / 180)) / from.n)));
    // Angles measured from the surface rather than the normal.
    const fromSurface = 90 - value;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        to.n > from.n ? -0.3 : 0.4,
        mantissaDifficulty(safeIncident),
      ]),
      stem:
        `A ray travelling in ${from.name} ($n = ${trimNumber(from.n)}$) strikes a flat boundary with ` +
        `${to.name} ($n = ${trimNumber(to.n)}$) at $${q(safeIncident, 'degrees')}$ from the normal. ` +
        `At what angle from the normal does it travel in the ${to.name}?`,
      answer: { kind: 'numeric' as const, value, unit: 'deg', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        {
          misconception: 'optics.snell-indices-inverted',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback:
            `The indices are paired with the wrong angles. Snell's law is ` +
            `$n_1\\sin\\theta_1 = n_2\\sin\\theta_2$, and the ray bends ` +
            `${to.n > from.n ? '**toward**' : '**away from**'} the normal entering the ` +
            `${to.n > from.n ? 'denser' : 'less dense'} medium.`,
        },
        {
          misconception: 'optics.angle-from-surface',
          value: fromSurface,
          tolerance: { rel: 0.015 },
          feedback:
            `That is measured from the **surface**. Every angle in Snell's law is measured from the ` +
            `normal, so the two differ by the complement.`,
        },
        {
          misconception: 'optics.tangent-used-for-sine',
          value: degrees(Math.atan(Math.min(50, (from.n * Math.tan((safeIncident * Math.PI) / 180)) / to.n))),
          tolerance: { rel: 0.015 },
          feedback: `Snell's law is written in sines, not tangents.`,
        },
      ]),
      explanation: {
        steps: [
          `Snell's law relates the two angles through the indices: $n_1\\sin\\theta_1 = n_2\\sin\\theta_2$, with both angles measured from the normal.`,
          `$\\sin\\theta_2 = \\dfrac{n_1\\sin\\theta_1}{n_2} = \\dfrac{${trimNumber(from.n)} \\times \\sin ${trimNumber(safeIncident)}^{\\circ}}{${trimNumber(to.n)}} = ${trimNumber(safeSin, 4)}$.`,
          `$\\theta_2 = ${q(value, 'degrees')}$.`,
          to.n > from.n
            ? `The ray bent **toward** the normal, which is what entering a denser medium always does.`
            : `The ray bent **away from** the normal, which is what leaving a denser medium always does — and is why a critical angle exists in this direction.`,
        ],
        principle:
          'Light slows in a denser medium and bends toward the normal; the index ratio is the whole of it. Measuring from the surface instead of the normal gives the complement and is the commonest geometric slip.',
        hints: [
          'Which way should the ray bend, given the two indices?',
          'Are these angles measured from the surface or from the normal?',
        ],
      },
    };
  },
};

export const criticalAngle: Generator = {
  id: 'phys2335.optics.critical-angle',
  title: 'Total internal reflection',
  kcRefs: [{ kc: 'phys2335.total-internal-reflection', weight: 1.0 }],
  difficultyB: 0.1,
  generate(rng: Rng) {
    // Only the dense-to-less-dense direction has a critical angle, which is
    // half the point of the topic. The draw enforces it.
    const dense = pick(rng, MEDIA.filter((m) => m.n >= 1.33));
    const light = pick(rng, MEDIA.filter((m) => m.n < dense.n));

    const sinCritical = light.n / dense.n;
    const critical = degrees(Math.asin(sinCritical));
    const inverted = degrees(Math.asin(Math.min(0.999999, dense.n / light.n)));

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        light.n === 1 ? -0.4 : 0.4,
        mantissaDifficulty(dense.n),
      ]),
      stem:
        `Light travels inside ${dense.name} ($n = ${trimNumber(dense.n)}$) and meets a boundary with ` +
        `${light.name} ($n = ${trimNumber(light.n)}$). Beyond what angle of incidence, measured from ` +
        `the normal, is the light totally internally reflected?`,
      answer: { kind: 'numeric' as const, value: critical, unit: 'deg', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(critical, { rel: 0.02 }, [
        {
          misconception: 'optics.critical-angle-ratio-inverted',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback:
            `The ratio is upside down. $\\sin\\theta_c = n_2/n_1$ with the **smaller** index on top — ` +
            `the other way round asks for the arcsine of a number greater than one, which is the ` +
            `physics saying there is no critical angle in that direction.`,
        },
        {
          misconception: 'optics.angle-from-surface',
          value: 90 - critical,
          tolerance: { rel: 0.015 },
          feedback: `That is the complement, measured from the surface rather than from the normal.`,
        },
      ]),
      explanation: {
        steps: [
          `At the critical angle the refracted ray grazes the boundary, so $\\theta_2 = 90^{\\circ}$ and $\\sin\\theta_2 = 1$.`,
          `Putting that into Snell's law: $n_1\\sin\\theta_c = n_2 \\times 1$, so $\\sin\\theta_c = \\dfrac{n_2}{n_1} = \\dfrac{${trimNumber(light.n)}}{${trimNumber(dense.n)}} = ${trimNumber(sinCritical, 4)}$.`,
          `$\\theta_c = ${q(critical, 'degrees')}$, and past that angle none of the light is transmitted.`,
          `This only exists going from the denser medium to the less dense one. The other way round the ratio exceeds one and the arcsine has no solution, which is the statement that there is no critical angle that way.`,
        ],
        principle:
          'Total internal reflection is the refraction equation run to its limit. The condition that it has no solution in one direction is a physical fact, not a calculator error.',
        hints: [
          'What is the refracted angle at the critical angle exactly?',
          'Which index belongs on top of the ratio?',
        ],
      },
    };
  },
};

export const PHYS2335_OPTICS_GENERATORS: readonly Generator[] = [
  twoSlitInterference,
  diffractionGrating,
  singleSlitDiffraction,
  snellRefraction,
  criticalAngle,
];
