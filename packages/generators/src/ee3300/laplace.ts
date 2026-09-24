import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, capacitance, inductance, intBetween, mantissaDifficulty, ohms, pick,
  resampleUntil, sci, trimNumber, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * Nilsson chapter 12 — the Laplace transform itself, as opposed to the circuit
 * analysis that chapter 13 builds on it.
 *
 * This unit previously had one generator, which asked for the time constant of
 * a first-order RL pole. That is a chapter 7 question wearing an s-domain
 * label: a learner could answer every item in the knowledge component without
 * meeting a transform pair, a partial fraction or a value theorem, and the
 * model would report them proficient in the s-domain for it. What follows is
 * chapter 12's own structure.
 *
 * Every answer here is numeric — a residue, a coefficient, a transform
 * evaluated at a point — rather than a symbolic F(s). That is deliberate and
 * not a shortcut: it keeps the whole unit on the independently verified numeric
 * path, and it matches how the exams ask, since a partial fraction expansion is
 * graded on its coefficients rather than on the shape of the expression.
 */

/** A small positive integer pole location, in rad/s. */
const poleAt = (rng: Rng): number => pick(rng, [1, 2, 3, 4, 5, 6, 8, 10, 12, 15, 20]);

type Pair =
  | { kind: 'exponential'; k: number; a: number }
  | { kind: 'ramp'; k: number }
  | { kind: 'damped-ramp'; k: number; a: number }
  | { kind: 'cosine'; k: number; w: number }
  | { kind: 'sine'; k: number; w: number };

const drawPair = (rng: Rng): Pair => {
  const k = pick(rng, [1, 2, 3, 4, 5, 6, 8, 10]);
  const kind = pick(rng, ['exponential', 'ramp', 'damped-ramp', 'cosine', 'sine'] as const);
  if (kind === 'ramp') return { kind, k };
  if (kind === 'cosine' || kind === 'sine') return { kind, k, w: poleAt(rng) };
  return { kind, k, a: poleAt(rng) };
};

const pairTime = (p: Pair): string => {
  switch (p.kind) {
    case 'exponential': return `${p.k}e^{-${p.a}t}u(t)`;
    case 'ramp': return `${p.k}t\\,u(t)`;
    case 'damped-ramp': return `${p.k}te^{-${p.a}t}u(t)`;
    case 'cosine': return `${p.k}\\cos(${p.w}t)u(t)`;
    case 'sine': return `${p.k}\\sin(${p.w}t)u(t)`;
  }
};

const pairLaplace = (p: Pair): string => {
  switch (p.kind) {
    case 'exponential': return `\\dfrac{${p.k}}{s + ${p.a}}`;
    case 'ramp': return `\\dfrac{${p.k}}{s^{2}}`;
    case 'damped-ramp': return `\\dfrac{${p.k}}{(s + ${p.a})^{2}}`;
    case 'cosine': return `\\dfrac{${p.k}s}{s^{2} + ${p.w * p.w}}`;
    case 'sine': return `\\dfrac{${p.k * p.w}}{s^{2} + ${p.w * p.w}}`;
  }
};

const pairEval = (p: Pair, s: number): number => {
  switch (p.kind) {
    case 'exponential': return p.k / (s + p.a);
    case 'ramp': return p.k / (s * s);
    case 'damped-ramp': return p.k / ((s + p.a) ** 2);
    case 'cosine': return (p.k * s) / (s * s + p.w * p.w);
    case 'sine': return (p.k * p.w) / (s * s + p.w * p.w);
  }
};

/** The transform table, used in the direction the question picks. */
export const laplaceTransformPairs: Generator = {
  id: 'ee3300.laplace.transform-pairs',
  title: 'Laplace transform pairs',
  kcRefs: [{ kc: 'ee3300.laplace-definition-pairs', weight: 1 }],
  difficultyB: 0.0,
  generate(rng: Rng) {
    const p = drawPair(rng);
    const s0 = pick(rng, [2, 3, 4, 5, 6, 8, 10]);
    const answer = pairEval(p, s0);

    // The two ways the table gets misread: the exponential's sign, and the
    // cosine/sine numerators, which differ only in whether an s or an omega
    // sits on top.
    const traps: { misconception: string; value: number; tolerance: { rel: number }; feedback: string }[] = [];
    if (p.kind === 'exponential' || p.kind === 'damped-ramp') {
      const flipped = p.kind === 'exponential' ? p.k / (s0 - p.a) : p.k / ((s0 - p.a) ** 2);
      if (Number.isFinite(flipped)) {
        traps.push({
          misconception: 'laplace.exponential-pole-sign',
          value: flipped,
          tolerance: { rel: 0.02 },
          feedback:
            `A **decaying** exponential $e^{-at}$ transforms to $1/(s + a)$ — the pole is at $s = -a$, ` +
            `in the left half plane. $1/(s - a)$ is the transform of $e^{+at}$, which grows.`,
        });
      }
    }
    if (p.kind === 'ramp') {
      traps.push({
        misconception: 'laplace.ramp-transformed-as-step',
        value: p.k / s0,
        tolerance: { rel: 0.02 },
        feedback:
          `$K/s$ is the transform of a **step** of height $K$. A ramp integrates that step, and integration in ` +
          `time divides by $s$ again: $K/s^{2}$.`,
      });
    }
    // Available for every pair, and the error it names is the one that makes
    // the whole chapter incoherent: reading F as though it were still f.
    traps.push({
      misconception: 'laplace.time-function-evaluated-in-s',
      value: (() => {
        switch (p.kind) {
          case 'exponential': return p.k * Math.exp(-p.a * s0);
          case 'ramp': return p.k * s0;
          case 'damped-ramp': return p.k * s0 * Math.exp(-p.a * s0);
          case 'cosine': return p.k * Math.cos(p.w * s0);
          case 'sine': return p.k * Math.sin(p.w * s0);
        }
      })(),
      tolerance: { rel: 0.02 },
      feedback:
        `That is $f$ evaluated at $t = ${s0}$, not $F$ evaluated at $s = ${s0}$. They are different functions ` +
        `of different variables; the transform is what relates them.`,
    });
    if (p.kind === 'cosine' || p.kind === 'sine') {
      const swapped = p.kind === 'cosine'
        ? (p.k * p.w) / (s0 * s0 + p.w * p.w)
        : (p.k * s0) / (s0 * s0 + p.w * p.w);
      traps.push({
        misconception: 'laplace.sine-cosine-numerator-swapped',
        value: swapped,
        tolerance: { rel: 0.02 },
        feedback:
          `The denominators are identical; only the numerator tells them apart. Cosine carries $s$ on top ` +
          `and sine carries $\\omega$. Check at $t = 0$: $\\cos 0 = 1$ and $\\sin 0 = 0$, and the ` +
          `initial-value theorem must agree.`,
      });
    }

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        p.kind === 'ramp' ? -0.7 : p.kind === 'damped-ramp' ? 0.5 : 0,
        mantissaDifficulty(Math.abs(answer)),
      ]),
      stem:
        `Let $f(t) = ${pairTime(p)}$ and let $F(s)$ be its Laplace transform.\n\n` +
        `What is $F(${s0})$?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          `From the table, $F(s) = ${pairLaplace(p)}$.`,
          `Substituting $s = ${s0}$ gives $F(${s0}) = ${sci(answer)}$.`,
        ],
        principle:
          'The table replaces the defining integral. Reading it correctly is mostly a matter of watching the sign in the pole and the numerator that separates sine from cosine.',
        hints: ['Find the matching row in the transform table first.', 'Check the sign of the pole against the sign in the exponent.'],
      },
    };
  },
};

/** Step and impulse: the sifting property, and pulses written with steps. */
export const stepImpulseFunctions: Generator = {
  id: 'ee3300.laplace.step-impulse',
  title: 'Step and impulse functions',
  kcRefs: [{ kc: 'ee3300.step-impulse-functions', weight: 1 }],
  difficultyB: -0.2,
  generate(rng: Rng) {
    const mode = pick(rng, ['sifting', 'pulse'] as const);

    if (mode === 'sifting') {
      const c2 = intBetween(rng, 1, 6);
      const c1 = intBetween(rng, 1, 9);
      const c0 = intBetween(rng, 1, 9);
      const a = pick(rng, [1, 2, 3, 4, 5]);
      const f = (t: number): number => c2 * t * t + c1 * t + c0;
      const answer = f(a);

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [-0.3, mantissaDifficulty(answer)]),
        stem:
          `Evaluate $\\displaystyle\\int_{-\\infty}^{\\infty} (${c2}t^{2} + ${c1}t + ${c0})\\,` +
          `\\delta(t - ${a})\\,dt$.`,
        answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
          {
            misconception: 'impulse.sifting-evaluated-at-origin',
            value: f(0),
            tolerance: { rel: 0.02 },
            feedback:
              `The impulse sits at $t = ${a}$, not at the origin. $\\delta(t - ${a})$ samples the function ` +
              `wherever its argument vanishes.`,
          },
          {
            misconception: 'impulse.sifting-treated-as-integration',
            value: (c2 * a ** 3) / 3 + (c1 * a * a) / 2 + c0 * a,
            tolerance: { rel: 0.02 },
            feedback:
              `Nothing is accumulated here. The impulse has unit area concentrated at a point, so the integral ` +
              `**samples** the other factor rather than integrating it.`,
          },
        ]),
        explanation: {
          steps: [
            `The sifting property: $\\int f(t)\\delta(t - a)\\,dt = f(a)$.`,
            `Here $a = ${a}$, so the integral is $${c2}(${a})^{2} + ${c1}(${a}) + ${c0} = ${answer}$.`,
          ],
          principle:
            'An impulse under an integral is a sampler, not an area. It returns the value of whatever it multiplies, at the one instant where its argument is zero.',
          hints: ['Where does the argument of the delta function vanish?', 'The result is a value of f, not an area under it.'],
        },
      };
    }

    const h1 = pick(rng, [2, 3, 4, 5, 6, 8, 10]);
    // Heights must differ, or the "both steps always on" trap lands exactly on
    // the answer for every evaluation point before the first switching instant.
    const h2 = resampleUntil(rng, (r) => pick(r, [1, 2, 3, 4, 5]), (v) => v !== h1);
    const t1 = pick(rng, [1, 2, 3]);
    const t2 = t1 + pick(rng, [2, 3, 4]);
    const tEval = pick(rng, [t1 - 1, (t1 + t2) / 2, t2 + 1] as const);
    const value = (t: number): number => (t >= t1 ? h1 : 0) - (t >= t2 ? h2 : 0);
    const answer = value(tEval);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        tEval > t2 ? 0.5 : tEval < t1 ? -0.6 : 0,
      ]),
      stem:
        `A signal is written as $g(t) = ${h1}u(t - ${t1}) - ${h2}u(t - ${t2})$, where $u$ is the unit step.\n\n` +
        `What is $g(${trimNumber(tEval, 3)})$?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(answer, { abs: 0.01 }, [
        {
          misconception: 'step.shift-direction-reversed',
          value: (tEval >= -t1 ? h1 : 0) - (tEval >= -t2 ? h2 : 0),
          tolerance: { abs: 0.01 },
          feedback:
            `$u(t - ${t1})$ switches on **at** $t = ${t1}$, not at $t = -${t1}$. The step turns on where its ` +
            `argument reaches zero.`,
        },
        {
          misconception: 'step.both-terms-always-active',
          value: h1 - h2,
          tolerance: { abs: 0.01 },
          feedback:
            `Each step contributes only after its own switching instant. Before $t = ${t2}$ the second term ` +
            `contributes nothing at all.`,
        },
        {
          misconception: 'step.later-step-ignored',
          value: h1,
          tolerance: { abs: 0.01 },
          feedback:
            `The second step has already switched on by $t = ${trimNumber(tEval, 3)}$, so it must be subtracted. ` +
            `A sum of steps is evaluated term by term, every time.`,
        },
      ]),
      explanation: {
        steps: [
          `$u(t - ${t1})$ is zero until $t = ${t1}$ and one after; $u(t - ${t2})$ is zero until $t = ${t2}$.`,
          tEval < t1
            ? `At $t = ${trimNumber(tEval, 3)}$ neither step has switched on, so $g = 0$.`
            : tEval < t2
              ? `At $t = ${trimNumber(tEval, 3)}$ only the first has switched on, so $g = ${h1}$.`
              : `At $t = ${trimNumber(tEval, 3)}$ both have switched on, so $g = ${h1} - ${h2} = ${answer}$.`,
        ],
        principle:
          'A sum of shifted steps is a piecewise constant signal, and each term contributes only after its own argument reaches zero.',
        hints: ['Find each switching instant first.', 'Evaluate term by term; a step is either 0 or 1.'],
      },
    };
  },
};

/** Translation in time and in frequency — the pair that gets swapped. */
export const laplaceShiftProperties: Generator = {
  id: 'ee3300.laplace.shift-properties',
  title: 'Translation in time and in frequency',
  kcRefs: [{ kc: 'ee3300.laplace-operational-properties', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const mode = pick(rng, ['time', 'frequency'] as const);
    const k = pick(rng, [1, 2, 3, 4, 5, 6]);
    const w = poleAt(rng);
    const a = pick(rng, [1, 2, 3, 4, 5]);
    const s0 = pick(rng, [2, 3, 4, 5, 6]);

    if (mode === 'time') {
      // L{f(t - a)u(t - a)} = e^{-as}F(s), with f(t) = k*e^{-bt}u(t) kept simple
      // so the shift is the only thing under test.
      //
      // The delay and the evaluation point are drawn small here on purpose.
      // Left to the wider ranges the other modes use, a*s reached 30 and the
      // stated answer was e^-30 times a fraction: correct, unreadable, and not
      // a question any exam would ask.
      const aDelay = pick(rng, [1, 2]);
      const sTime = pick(rng, [2, 3]);
      const b = pick(rng, [1, 2, 3, 4, 5, 6, 8]);
      const fAt = k / (sTime + b);
      const answer = Math.exp(-aDelay * sTime) * fAt;

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.2, mantissaDifficulty(Math.abs(answer))]),
        stem:
          `Let $f(t) = ${k}e^{-${b}t}u(t)$, and let $g(t) = f(t - ${aDelay})u(t - ${aDelay})$ be $f$ delayed by ` +
          `$${aDelay}\\,\\mathrm{s}$.\n\nIf $G(s)$ is the Laplace transform of $g$, what is $G(${sTime})$?`,
        answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
          {
            misconception: 'laplace.shift-applied-in-wrong-domain',
            value: k / (sTime + b + aDelay),
            tolerance: { rel: 0.02 },
            feedback:
              `That is a **frequency** shift, $F(s + ${aDelay})$, which is what multiplying $f(t)$ by an exponential ` +
              `in $t$ does. Delaying in time multiplies the transform by $e^{-${aDelay}s}$ instead.`,
          },
          {
            misconception: 'laplace.delay-factor-sign',
            value: Math.exp(aDelay * sTime) * fAt,
            tolerance: { rel: 0.02 },
            feedback:
              `The exponent is negative for a **delay**: $e^{-as}F(s)$. A positive exponent would advance the ` +
              `signal, making it non-zero before $t = 0$.`,
          },
        ]),
        explanation: {
          steps: [
            `$F(s) = \\dfrac{${k}}{s + ${b}}$, so $F(${sTime}) = ${sci(fAt)}$.`,
            `Delaying by $${aDelay}\\,\\mathrm{s}$ multiplies the transform by $e^{-${aDelay}s}$: $G(s) = e^{-${aDelay}s}F(s)$.`,
            `$G(${sTime}) = e^{-${aDelay * sTime}} \\times ${sci(fAt)} = ${sci(answer)}$.`,
          ],
          principle:
            'A shift in one domain is a multiplication by an exponential in the other. Time delay gives e^(-as) times F(s); multiplying by e^(-at) in time displaces s instead.',
          hints: ['Which domain is being shifted here?', 'A delay must make the transform smaller, not larger, for positive s.'],
        },
      };
    }

    // L{e^{-at} f(t)} = F(s + a), with f(t) = k*cos(wt).
    const answer = (k * (s0 + a)) / ((s0 + a) ** 2 + w * w);
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [0.4, mantissaDifficulty(Math.abs(answer))]),
      stem:
        `Let $f(t) = ${k}\\cos(${w}t)u(t)$ and $h(t) = e^{-${a}t}f(t)$.\n\n` +
        `If $H(s)$ is the Laplace transform of $h$, what is $H(${s0})$?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        {
          misconception: 'laplace.shift-applied-in-wrong-domain',
          value: Math.exp(-a * s0) * ((k * s0) / (s0 * s0 + w * w)),
          tolerance: { rel: 0.02 },
          feedback:
            `Multiplying by $e^{-at}$ in the time domain does **not** put an exponential in front of $F(s)$. ` +
            `It displaces the argument: $F(s + ${a})$. The $e^{-as}$ factor belongs to a time delay.`,
        },
        {
          misconception: 'laplace.frequency-shift-sign',
          value: (k * (s0 - a)) / ((s0 - a) ** 2 + w * w),
          tolerance: { rel: 0.02 },
          feedback:
            `The displacement runs the other way: $e^{-at}f(t)$ gives $F(s + a)$, moving the pole further into ` +
            `the left half plane, which is what extra damping should do.`,
        },
      ]),
      explanation: {
        steps: [
          `$F(s) = \\dfrac{${k}s}{s^{2} + ${w * w}}$.`,
          `Multiplying by $e^{-${a}t}$ replaces $s$ with $s + ${a}$: $H(s) = \\dfrac{${k}(s + ${a})}{(s + ${a})^{2} + ${w * w}}$.`,
          `$H(${s0}) = \\dfrac{${k}(${s0 + a})}{${(s0 + a) ** 2} + ${w * w}} = ${sci(answer)}$.`,
        ],
        principle:
          'Damping a signal in time shifts its transform in frequency. Every s in F becomes s + a, poles included.',
        hints: ['Write F(s) first, then substitute.', 'Extra damping should move the poles left, not right.'],
      },
    };
  },
};

/** Residues at simple real poles. */
export const pfeDistinctPoles: Generator = {
  id: 'ee3300.laplace.pfe-distinct',
  title: 'Partial fractions with distinct real poles',
  kcRefs: [{ kc: 'ee3300.pfe-distinct-poles', weight: 1 }],
  difficultyB: 0.3,
  generate(rng: Rng) {
    const { p1, p2, z, k } = resampleUntil(rng, (r) => ({
      p1: poleAt(r),
      p2: poleAt(r),
      z: pick(r, [0, 1, 2, 3, 4, 5, 6]),
      k: pick(r, [1, 2, 3, 4, 5, 10]),
    }), (d) => d.p1 !== d.p2 && d.z !== d.p1 && d.z !== d.p2);

    const asked = pick(rng, ['k1', 'k2'] as const);
    const k1 = (k * (z - p1)) / (p2 - p1);
    const k2 = (k * (z - p2)) / (p1 - p2);
    const answer = asked === 'k1' ? k1 : k2;
    const numerator = z === 0 ? `${k}s` : `${k}(s + ${z})`;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        z === 0 ? -0.3 : 0.2,
        mantissaDifficulty(Math.abs(answer)),
      ]),
      stem:
        `Expand $F(s) = \\dfrac{${numerator}}{(s + ${p1})(s + ${p2})}$ as ` +
        `$\\dfrac{K_1}{s + ${p1}} + \\dfrac{K_2}{s + ${p2}}$.\n\n` +
        `What is $${asked === 'k1' ? 'K_1' : 'K_2'}$?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        {
          misconception: 'pfe.residue-evaluated-at-wrong-sign',
          value: asked === 'k1' ? (k * (z + p1)) / (p2 + p1) : (k * (z + p2)) / (p1 + p2),
          tolerance: { rel: 0.02 },
          feedback:
            `The factor $(s + ${asked === 'k1' ? p1 : p2})$ vanishes at ` +
            `$s = -${asked === 'k1' ? p1 : p2}$, so that negative value is where the rest of $F$ is evaluated.`,
        },
        {
          misconception: 'pfe.numerator-zero-ignored',
          value: asked === 'k1' ? k / (p2 - p1) : k / (p1 - p2),
          tolerance: { rel: 0.02 },
          feedback:
            `The numerator is not just $${k}$ — it is $${numerator.replace(/\$/g, '')}$, and it has to be ` +
            `evaluated at the pole too. Covering up a factor removes that factor only.`,
        },
      ]),
      explanation: {
        steps: [
          `Multiply through by $(s + ${asked === 'k1' ? p1 : p2})$ and evaluate at $s = -${asked === 'k1' ? p1 : p2}$.`,
          asked === 'k1'
            ? `$K_1 = \\left.\\dfrac{${numerator}}{s + ${p2}}\\right|_{s = -${p1}} = \\dfrac{${k}(${z - p1})}{${p2 - p1}} = ${sci(k1)}$.`
            : `$K_2 = \\left.\\dfrac{${numerator}}{s + ${p1}}\\right|_{s = -${p2}} = \\dfrac{${k}(${z - p2})}{${p1 - p2}} = ${sci(k2)}$.`,
          `In the time domain this term becomes $${sci(answer)}e^{-${asked === 'k1' ? p1 : p2}t}$.`,
        ],
        principle:
          'A residue at a simple pole is found by covering up that pole\'s factor and evaluating everything else there. The pole of (s + p) is at s = -p.',
        hints: ['Cover up the factor whose residue you want.', 'Evaluate at the negative of the number in the factor.'],
      },
    };
  },
};

/** Repeated poles, where every coefficient below the top needs a derivative. */
export const pfeRepeatedPoles: Generator = {
  id: 'ee3300.laplace.pfe-repeated',
  title: 'Partial fractions with a repeated pole',
  kcRefs: [{ kc: 'ee3300.pfe-repeated-poles', weight: 1 }],
  difficultyB: 0.7,
  generate(rng: Rng) {
    const { p, q, a } = resampleUntil(rng, (r) => ({
      p: poleAt(r),
      q: poleAt(r),
      a: pick(r, [1, 2, 3, 4, 5, 6, 10, 12]),
    }), (d) => d.p !== d.q);

    // F(s) = a / ((s+p)^2 (s+q))
    //      = K2/(s+p)^2 + K1/(s+p) + K3/(s+q)
    const k2 = a / (q - p);
    const k1 = -a / (q - p) ** 2;
    const asked = pick(rng, ['k2', 'k1'] as const);
    const answer = asked === 'k2' ? k2 : k1;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        asked === 'k1' ? 0.6 : -0.5,
        mantissaDifficulty(Math.abs(answer)),
      ]),
      stem:
        `Expand $F(s) = \\dfrac{${a}}{(s + ${p})^{2}(s + ${q})}$ as ` +
        `$\\dfrac{K_2}{(s + ${p})^{2}} + \\dfrac{K_1}{s + ${p}} + \\dfrac{K_3}{s + ${q}}$.\n\n` +
        `What is $${asked === 'k2' ? 'K_2' : 'K_1'}$?`,
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        ...(asked === 'k1'
          ? [{
              misconception: 'pfe.repeated-pole-derivative-skipped',
              value: k2,
              tolerance: { rel: 0.02 },
              feedback:
                `That is $K_2$, the coefficient of the squared term. $K_1$ needs the **derivative** of ` +
                `$a/(s + ${q})$ before evaluating at $s = -${p}$ — without it the expansion cannot reproduce $F(s)$.`,
            }, {
              misconception: 'pfe.repeated-pole-derivative-sign',
              value: -k1,
              tolerance: { rel: 0.02 },
              feedback:
                `$\\dfrac{d}{ds}(s + ${q})^{-1} = -(s + ${q})^{-2}$. The minus sign comes from the power rule ` +
                `and it survives into the coefficient.`,
            }]
          : [{
              misconception: 'pfe.repeated-pole-treated-as-simple',
              value: a / (q - p) ** 2,
              tolerance: { rel: 0.02 },
              feedback:
                `Only the factor being covered up is removed, and here that is $(s + ${p})^{2}$ in full. ` +
                `What remains is $a/(s + ${q})$ evaluated at $s = -${p}$.`,
            }]),
      ]),
      explanation: {
        steps: [
          `Multiply by $(s + ${p})^{2}$: the result is $\\dfrac{${a}}{s + ${q}}$.`,
          `$K_2$ is that expression at $s = -${p}$: $\\dfrac{${a}}{${q - p}} = ${sci(k2)}$.`,
          asked === 'k1'
            ? `$K_1$ is its **derivative** at $s = -${p}$: $\\dfrac{d}{ds}\\dfrac{${a}}{s + ${q}} = ` +
              `\\dfrac{-${a}}{(s + ${q})^{2}}$, which at $s = -${p}$ is $${sci(k1)}$.`
            : `The answer is $K_2 = ${sci(k2)}$.`,
        ],
        principle:
          'A pole of multiplicity n contributes n terms. The top one is a plain evaluation; each one below it costs another derivative, and dropping them leaves an expansion that is not equal to F(s) at all.',
        hints: [
          'How many terms does a squared factor need?',
          'The coefficient below the top power comes from a derivative.',
        ],
      },
    };
  },
};

/** Complex conjugate poles, and the damped sinusoid they produce. */
export const pfeComplexPoles: Generator = {
  id: 'ee3300.laplace.pfe-complex',
  title: 'Partial fractions with complex conjugate poles',
  kcRefs: [{ kc: 'ee3300.pfe-complex-poles', weight: 1 }],
  difficultyB: 0.8,
  generate(rng: Rng) {
    const alpha = pick(rng, [1, 2, 3, 4, 5, 6]);
    const w = pick(rng, [2, 3, 4, 5, 6, 8, 10]);
    const a = pick(rng, [1, 2, 3, 4, 5, 10]);
    const b = resampleUntil(rng, (r) => pick(r, [0, 1, 2, 3, 6, 8, 12]), (v) => v !== alpha);

    // F(s) = a(s + b) / ((s + alpha)^2 + w^2)
    // Residue at s = -alpha + jw is K = a(b - alpha + jw) / (2jw).
    const kMag = (a * Math.hypot(b - alpha, w)) / (2 * w);
    const amplitude = 2 * kMag;
    const numerator = b === 0 ? `${a}s` : `${a}(s + ${b})`;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        b === 0 ? -0.3 : 0.2,
        mantissaDifficulty(amplitude),
      ]),
      stem:
        `$F(s) = \\dfrac{${numerator}}{(s + ${alpha})^{2} + ${w * w}}$ has complex conjugate poles at ` +
        `$s = -${alpha} \\pm j${w}$.\n\n` +
        `Its inverse transform has the form $f(t) = Me^{-${alpha}t}\\cos(${w}t + \\theta)u(t)$.\n\n` +
        `What is the amplitude $M$?`,
      answer: { kind: 'numeric' as const, value: amplitude, unit: '', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(amplitude, { rel: 0.02 }, [
        {
          misconception: 'pfe.complex-amplitude-missing-factor-two',
          value: kMag,
          tolerance: { rel: 0.02 },
          feedback:
            `That is $|K|$ for one pole. **Both** conjugate poles contribute, and their two terms add to ` +
            `$2|K|e^{-\\alpha t}\\cos(\\omega t + \\theta)$ — the factor of two is the conjugate partner.`,
        },
        {
          misconception: 'pfe.complex-denominator-uses-omega-squared',
          value: (a * Math.hypot(b - alpha, w)) / (2 * w * w),
          tolerance: { rel: 0.02 },
          feedback:
            `The residue denominator is $2j\\omega$, not $2\\omega^{2}$: it is the distance between the two ` +
            `poles, which is $2j\\omega$ regardless of how the denominator was written.`,
        },
      ]),
      explanation: {
        steps: [
          `The poles are at $s = -${alpha} \\pm j${w}$, so the factors are $(s + ${alpha} - j${w})$ and $(s + ${alpha} + j${w})$.`,
          `The residue at $s = -${alpha} + j${w}$ is $K = \\left.\\dfrac{${numerator}}{s + ${alpha} + j${w}}\\right|_{s = -${alpha} + j${w}} ` +
            `= \\dfrac{${a}(${b - alpha} + j${w})}{j${2 * w}}$.`,
          `$|K| = \\dfrac{${a}\\sqrt{${(b - alpha) ** 2} + ${w * w}}}{${2 * w}} = ${sci(kMag)}$.`,
          `The conjugate pair contributes $2|K| = ${sci(amplitude)}$ as the cosine amplitude.`,
        ],
        principle:
          'Conjugate poles have conjugate residues, so only one needs computing. In the time domain the pair collapses to a single damped cosine whose amplitude is twice the residue magnitude.',
        hints: [
          'Compute the residue at just one of the two poles.',
          'The difference between the two poles is 2*j*omega.',
        ],
      },
    };
  },
};

/** The value theorems, and the condition the final-value one carries. */
export const initialFinalValue: Generator = {
  id: 'ee3300.laplace.value-theorems',
  title: 'Initial- and final-value theorems',
  kcRefs: [{ kc: 'ee3300.initial-final-value', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng, seed: number) {
    const mode = pick(rng, ['initial', 'final', 'validity'] as const);
    const a = pick(rng, [1, 2, 3, 4, 5, 6]);
    const b = pick(rng, [2, 4, 6, 8, 10, 12]);
    const e = pick(rng, [5, 10, 15, 20, 24, 30]);
    // sF(s) = (a s^2 + b s + e) / (s^2 + c s + d); c > 0 and d > 0 keeps both
    // poles in the left half plane, which is what the final-value theorem needs.
    const c = pick(rng, [2, 3, 4, 5, 6, 8]);
    const d = pick(rng, [4, 6, 9, 12, 16, 25]);

    if (mode === 'validity') {
      // Half the draws are marginally stable, where the theorem says nothing.
      const stable = seed % 2 === 0;
      const cc = stable ? c : 0;
      const ids = ['a', 'b'] as const;
      const correct = stable ? 0 : 1;
      return {
        type: 'multiple-choice' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.7]),
        stem:
          `$F(s) = \\dfrac{${a}s^{2} + ${b}s + ${e}}{s(s^{2} + ${cc === 0 ? '' : `${cc}s + `}${d})}$.\n\n` +
          `Does the final-value theorem give a valid answer for $f(\\infty)$ here?`,
        answer: { kind: 'choice' as const, correctId: ids[correct]! },
        options: [
          {
            id: 'a',
            text: 'Yes — every pole of $sF(s)$ is in the left half plane.',
            ...(stable
              ? { rationale: `The quadratic $s^{2} + ${cc}s + ${d}$ has roots with negative real parts.` }
              : {
                  misconception: 'laplace.fvt-applied-to-marginal-poles',
                  rationale: 'With no s term the roots sit on the imaginary axis, not to the left of it.',
                }),
          },
          {
            id: 'b',
            text: 'No — $sF(s)$ has poles on the imaginary axis, so $f(t)$ has no final value.',
            ...(stable
              ? {
                  misconception: 'laplace.fvt-refused-when-valid',
                  rationale: `A positive $s$ coefficient and positive constant put both roots strictly in the left half plane.`,
                }
              : { rationale: `$s^{2} + ${d}$ has roots at $s = \\pm j${trimNumber(Math.sqrt(d), 3)}$, a pure oscillation.` }),
          },
        ],
        misconceptionTraps: [],
        explanation: {
          steps: [
            `$sF(s) = \\dfrac{${a}s^{2} + ${b}s + ${e}}{s^{2} + ${cc === 0 ? '' : `${cc}s + `}${d}}$.`,
            stable
              ? `Both roots of $s^{2} + ${cc}s + ${d}$ have negative real parts, so the theorem applies and ` +
                `$f(\\infty) = ${sci(e / d)}$.`
              : `$s^{2} + ${d}$ has roots at $s = \\pm j${trimNumber(Math.sqrt(d), 3)}$. Those describe an undamped ` +
                `oscillation, which has no limit — the theorem would still return $${sci(e / d)}$, confidently and wrongly.`,
          ],
          principle:
            'The final-value theorem is a conditional statement. Evaluating the limit is always possible; it means something only when every pole of sF(s) lies strictly in the left half plane.',
          hints: ['Where are the roots of the quadratic?', 'A pure oscillation never settles to anything.'],
        },
      };
    }

    const answer = mode === 'initial' ? a : e / d;
    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        mode === 'final' ? 0.2 : -0.2,
        mantissaDifficulty(Math.abs(answer)),
      ]),
      stem:
        `$F(s) = \\dfrac{${a}s^{2} + ${b}s + ${e}}{s(s^{2} + ${c}s + ${d})}$.\n\n` +
        (mode === 'initial'
          ? 'Use the initial-value theorem to find $f(0^{+})$.'
          : 'Use the final-value theorem to find $f(\\infty)$.'),
      answer: { kind: 'numeric' as const, value: answer, unit: '', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        {
          misconception: 'laplace.value-theorems-swapped',
          value: mode === 'initial' ? e / d : a,
          tolerance: { rel: 0.02 },
          feedback:
            `The two theorems take the same expression $sF(s)$ to opposite limits: $s \\to \\infty$ gives ` +
            `$f(0^{+})$ and $s \\to 0$ gives $f(\\infty)$. Large $s$ is short time.`,
        },
        ...(mode === 'initial'
          ? [{
              misconception: 'laplace.value-theorem-missing-s-factor',
              value: 0,
              tolerance: { abs: 1e-6 },
              feedback:
                `Both theorems act on $sF(s)$, not on $F(s)$. Without the factor of $s$ the limit collapses to ` +
                `zero, because $F(s)$ itself falls off as $1/s$.`,
            }]
          : []),
      ]),
      explanation: {
        steps: [
          `$sF(s) = \\dfrac{${a}s^{2} + ${b}s + ${e}}{s^{2} + ${c}s + ${d}}$.`,
          mode === 'initial'
            ? `As $s \\to \\infty$ the highest powers dominate: $\\dfrac{${a}s^{2}}{s^{2}} \\to ${a}$.`
            : `As $s \\to 0$ only the constants survive: $\\dfrac{${e}}{${d}} = ${sci(answer)}$.`,
          `Both roots of $s^{2} + ${c}s + ${d}$ are in the left half plane, so the final-value theorem is valid here.`,
        ],
        principle:
          'Both theorems read a time-domain limit off sF(s) without inverting it — which is exactly why they are the standard check on an s-domain result before the algebra goes any further.',
        hints: ['Form sF(s) first.', 'Large s corresponds to small t, and small s to large t.'],
      },
    };
  },
};

/** Elements in the s-domain: sL, 1/(sC), and where they are equal. */
export const sDomainElements: Generator = {
  id: 'ee3300.laplace.s-domain-elements',
  title: 'Circuit elements in the s-domain',
  kcRefs: [{ kc: 'ee3300.s-domain-elements', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    const mode = pick(rng, ['impedance', 'equal'] as const);
    const l = inductance(rng);
    const c = capacitance(rng);

    if (mode === 'equal') {
      const answer = 1 / Math.sqrt(l * c);
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.3, mantissaDifficulty(answer)]),
        stem:
          `An inductor $L = ${trimNumber(l * 1000, 3)}\\,\\mathrm{{m}H}$ and a capacitor ` +
          `$C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{{\\mu}F}$ are written in the s-domain as $sL$ and $1/(sC)$.\n\n` +
          `At what positive real value of $s$ do the two impedances have equal magnitude, in rad/s?`,
        answer: { kind: 'numeric' as const, value: answer, unit: 'rad/s', tolerance: DEFAULT_TOLERANCE },
        options: [],
        misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
          {
            misconception: 'sdomain.lc-product-not-rooted',
            value: 1 / (l * c),
            tolerance: { rel: 0.02 },
            feedback:
              `$sL = 1/(sC)$ gives $s^{2} = 1/(LC)$, so $s = 1/\\sqrt{LC}$. The square root is the whole point ` +
              `of solving a quadratic.`,
          },
          {
            misconception: 'sdomain.impedance-ratio-inverted',
            value: Math.sqrt(l * c),
            tolerance: { rel: 0.02 },
            feedback:
              `$\\sqrt{LC}$ is a time, not a frequency. Invert it.`,
          },
        ]),
        explanation: {
          steps: [
            `Set $sL = \\dfrac{1}{sC}$.`,
            `Then $s^{2}LC = 1$, so $s = \\dfrac{1}{\\sqrt{LC}} = ${trimNumber(answer, 4)}\\,\\mathrm{rad/s}$.`,
            `This is the same $\\omega_0$ that sets the resonant frequency of the pair.`,
          ],
          principle:
            'The s-domain impedances of L and C cross at 1/sqrt(LC) — the resonant frequency, arrived at without mentioning sinusoids at all.',
          hints: ['Set the two expressions equal and solve for s.', 'The result should have units of rad/s.'],
        },
      };
    }

    const element = pick(rng, ['inductor', 'capacitor'] as const);
    const s0 = pick(rng, [100, 250, 500, 1000, 2000, 5000]);
    const answer = element === 'inductor' ? s0 * l : 1 / (s0 * c);

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        element === 'capacitor' ? 0.3 : -0.3,
        mantissaDifficulty(answer),
      ]),
      stem:
        (element === 'inductor'
          ? `An inductor of $L = ${trimNumber(l * 1000, 3)}\\,\\mathrm{{m}H}$`
          : `A capacitor of $C = ${trimNumber(c * 1e6, 3)}\\,\\mathrm{{\\mu}F}$`) +
        ` carries no initial energy.\n\nWhat is the magnitude of its s-domain impedance at $s = ${s0}$, in ohms?`,
      answer: { kind: 'numeric' as const, value: answer, unit: 'ohm', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        {
          misconception: 'sdomain.impedance-inverted',
          value: element === 'inductor' ? 1 / (s0 * l) : s0 * c,
          tolerance: { rel: 0.02 },
          feedback:
            element === 'inductor'
              ? `The inductor is $sL$, not $1/(sL)$. An inductor opposes change, so its impedance **rises** with $s$.`
              : `The capacitor is $1/(sC)$, not $sC$. A capacitor passes fast signals, so its impedance **falls** as $s$ rises.`,
        },
        {
          misconception: 'sdomain.element-roles-swapped',
          value: element === 'inductor' ? 1 / (s0 * c) : s0 * l,
          tolerance: { rel: 0.02 },
          feedback:
            `That is the other element's form. $sL$ belongs to the inductor and $1/(sC)$ to the capacitor.`,
        },
      ]),
      explanation: {
        steps: [
          element === 'inductor'
            ? `With no initial current the inductor is simply $Z_L(s) = sL$.`
            : `With no initial charge the capacitor is simply $Z_C(s) = \\dfrac{1}{sC}$.`,
          element === 'inductor'
            ? `$Z_L(${s0}) = ${s0} \\times ${trimNumber(l, 3)} = ${ohms(answer)}$.`
            : `$Z_C(${s0}) = \\dfrac{1}{${s0} \\times ${trimNumber(c, 3)}} = ${ohms(answer)}$.`,
        ],
        principle:
          'In the s-domain the reactive elements are ordinary impedances, which is what lets a transient be solved by the same algebra as a resistive divider. Initial energy, when present, appears as an added independent source.',
        hints: ['Which element grows in impedance with frequency?', 'Check the units come out in ohms.'],
      },
    };
  },
};

/** Nilsson chapter 12, in the order the lectures build it. */
export const EE3300_LAPLACE_GENERATORS: readonly Generator[] = [
  laplaceTransformPairs,
  stepImpulseFunctions,
  laplaceShiftProperties,
  pfeDistinctPoles,
  pfeRepeatedPoles,
  pfeComplexPoles,
  initialFinalValue,
  sDomainElements,
];
