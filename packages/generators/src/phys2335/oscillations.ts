import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, mantissaDifficulty, pick, ratioDifficulty, trimNumber, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';
import { G_EARTH, q, tidy } from './common.js';

/**
 * Oscillations.
 *
 * Every generator in this file is really one question — what is the angular
 * frequency of this system — asked from a different direction. That is not a
 * lack of variety, it is the structure of the unit: a mass on a spring, a
 * pendulum and a driven RLC circuit are the same second-order equation, and a
 * learner who can extract omega from any of them can extract it from all three.
 *
 * So the traps are shared deliberately. Dropping the 2*pi between frequency and
 * angular frequency is the same slip whether it happens in SHM kinematics or in
 * a pendulum, and tagging it identically is what lets the misconception feed
 * report it once instead of twice.
 */

/** Amplitudes a laboratory problem actually uses, in metres. */
const amplitude = (rng: Rng): number => pick(rng, [0.02, 0.03, 0.05, 0.08, 0.1, 0.12, 0.15, 0.2, 0.25]);

export const shmKinematics: Generator = {
  id: 'phys2335.simple-harmonic-motion.extremes',
  title: 'Maximum speed and acceleration in SHM',
  kcRefs: [{ kc: 'phys2335.simple-harmonic-motion', weight: 1.0 }],
  difficultyB: -0.9,
  generate(rng: Rng) {
    const a = amplitude(rng);
    const f = pick(rng, [0.5, 0.8, 1.2, 1.5, 2, 2.5, 3, 4, 5]);
    const omega = 2 * Math.PI * f;
    const wantsSpeed = rng() < 0.5;

    const vMax = a * omega;
    const aMax = a * omega * omega;
    const answer = wantsSpeed ? vMax : aMax;
    const other = wantsSpeed ? aMax : vMax;
    // Using the ordinary frequency where the angular one belongs.
    const withoutTwoPi = wantsSpeed ? a * f : a * f * f;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(f), wantsSpeed ? -0.6 : 0.6]),
      stem:
        `A particle in simple harmonic motion has amplitude $${q(a, 'm')}$ and frequency $${q(f, 'Hz')}$. ` +
        `Find its maximum ${wantsSpeed ? 'speed' : 'acceleration'}.`,
      answer: {
        kind: 'numeric' as const,
        value: answer,
        unit: wantsSpeed ? 'm/s' : 'm/s^2',
        tolerance: DEFAULT_TOLERANCE,
      },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, [
        {
          misconception: 'shm.angular-frequency-dropped',
          value: withoutTwoPi,
          tolerance: { rel: 0.015 },
          feedback:
            `You used $f$ where $\\omega$ belongs. The motion is $x = A\\cos(\\omega t)$ with ` +
            `$\\omega = 2\\pi f = ${trimNumber(omega)}\\,\\mathrm{rad/s}$, so every derivative brings down ` +
            `$\\omega$, not $f$.`,
        },
        {
          misconception: 'shm.speed-acceleration-confused',
          value: other,
          tolerance: { rel: 0.015 },
          feedback:
            wantsSpeed
              ? `That is the maximum **acceleration**, $A\\omega^2$. Speed is the first derivative, so it carries one factor of $\\omega$.`
              : `That is the maximum **speed**, $A\\omega$. Acceleration is the second derivative, so it carries $\\omega$ twice.`,
        },
      ]),
      explanation: {
        steps: [
          `Write the motion as $x(t) = A\\cos(\\omega t)$ with $\\omega = 2\\pi f = 2\\pi(${trimNumber(f)}) = ${trimNumber(omega)}\\,\\mathrm{rad/s}$.`,
          `Differentiating once gives $v = -A\\omega\\sin(\\omega t)$ and again gives $a = -A\\omega^2\\cos(\\omega t)$.`,
          `Each extreme is the coefficient in front: $v_{max} = A\\omega$ and $a_{max} = A\\omega^2$.`,
          wantsSpeed
            ? `$v_{max} = (${trimNumber(a)})(${trimNumber(omega)}) = ${q(vMax, 'm/s')}$.`
            : `$a_{max} = (${trimNumber(a)})(${trimNumber(omega)})^2 = ${q(aMax, 'm/s^2')}$.`,
        ],
        principle:
          'Speed and acceleration extremes differ by one factor of the angular frequency, because each is one more derivative of the same cosine.',
        hints: [
          'What is $\\omega$ in terms of $f$?',
          'How many times do you differentiate to reach the quantity asked for?',
        ],
      },
    };
  },
};

export const oscillatorFrequency: Generator = {
  id: 'phys2335.oscillator-systems.frequency',
  title: 'Frequency of a spring or pendulum',
  kcRefs: [
    { kc: 'phys2335.oscillator-systems', weight: 0.8 },
    { kc: 'phys2335.simple-harmonic-motion', weight: 0.2 },
  ],
  difficultyB: -0.5,
  generate(rng: Rng) {
    const spring = rng() < 0.55;
    const k = pick(rng, [8, 12, 20, 25, 40, 50, 80, 120, 200]);
    const m = pick(rng, [0.1, 0.2, 0.25, 0.4, 0.5, 0.8, 1.2, 2]);
    const length = pick(rng, [0.15, 0.25, 0.4, 0.5, 0.75, 1, 1.5, 2]);

    const omega = spring ? Math.sqrt(k / m) : Math.sqrt(G_EARTH / length);
    const f = omega / (2 * Math.PI);
    // The ratio the wrong way up, and the root never taken.
    const inverted = spring ? Math.sqrt(m / k) / (2 * Math.PI) : Math.sqrt(length / G_EARTH) / (2 * Math.PI);
    const noRoot = spring ? k / m / (2 * Math.PI) : G_EARTH / length / (2 * Math.PI);

    const description = spring
      ? `A block of mass $${q(m, 'kg')}$ oscillates on a spring of stiffness $${q(k, 'N/m')}$.`
      : `A simple pendulum has length $${q(length, 'm')}$ and swings through a small angle.`;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        spring ? ratioDifficulty(k, m) : mantissaDifficulty(length),
        spring ? -0.3 : 0.3,
      ]),
      stem: `${description} Find the frequency of the oscillation.`,
      answer: { kind: 'numeric' as const, value: f, unit: 'Hz', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(f, DEFAULT_TOLERANCE, [
        {
          misconception: 'oscillator.stiffness-inertia-inverted',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback:
            spring
              ? `The ratio is upside down. $\\omega = \\sqrt{k/m}$: stiffer means faster, heavier means slower, and your expression says the opposite.`
              : `The ratio is upside down. $\\omega = \\sqrt{g/L}$: a longer pendulum swings **more slowly**, and your expression makes it faster.`,
        },
        {
          misconception: 'oscillator.root-dropped',
          value: noRoot,
          tolerance: { rel: 0.015 },
          feedback:
            `The square root is missing. $\\omega^2$ is what the equation of motion gives you directly ` +
            `($\\ddot{x} = -\\omega^2 x$), so $\\omega$ is its root.`,
        },
        {
          misconception: 'shm.angular-frequency-dropped',
          value: omega,
          tolerance: { rel: 0.015 },
          feedback:
            `That is $\\omega$ in $\\mathrm{rad/s}$, not $f$ in $\\mathrm{Hz}$. Divide by $2\\pi$: ` +
            `$f = \\omega/2\\pi = ${q(f, 'Hz')}$.`,
        },
      ]),
      explanation: {
        steps: [
          spring
            ? `Newton's second law with a restoring force $F = -kx$ gives $m\\ddot{x} = -kx$, so $\\ddot{x} = -(k/m)x$.`
            : `For small angles the restoring torque gives $\\ddot{\\theta} = -(g/L)\\theta$.`,
          `Comparing with $\\ddot{x} = -\\omega^2 x$ identifies ${spring ? '$\\omega^2 = k/m$' : '$\\omega^2 = g/L$'}.`,
          spring
            ? `$\\omega = \\sqrt{${trimNumber(k)}/${trimNumber(m)}} = ${trimNumber(omega)}\\,\\mathrm{rad/s}$.`
            : `$\\omega = \\sqrt{${trimNumber(G_EARTH)}/${trimNumber(length)}} = ${trimNumber(omega)}\\,\\mathrm{rad/s}$.`,
          `$f = \\dfrac{\\omega}{2\\pi} = ${q(f, 'Hz')}$.`,
          spring
            ? `Note the amplitude never entered: the frequency of an ideal spring oscillator does not depend on how far it is pulled.`
            : `Note the mass never entered: a pendulum's period depends on its length and on gravity, not on what is hanging from it.`,
        ],
        principle:
          'The angular frequency is always the square root of a restoring coefficient over an inertia, whatever the system is made of.',
        hints: [
          spring ? 'Write the equation of motion and compare it with $\\ddot{x} = -\\omega^2 x$.' : 'What does the small-angle approximation do to $\\sin\\theta$?',
          'Is the question asking for $\\omega$ or for $f$?',
        ],
      },
    };
  },
};

export const criticalDamping: Generator = {
  id: 'phys2335.damped-driven-oscillation.critical',
  title: 'Critical damping and resonance',
  kcRefs: [
    { kc: 'phys2335.damped-driven-oscillation', weight: 0.85 },
    { kc: 'phys2335.oscillator-systems', weight: 0.15 },
  ],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const m = pick(rng, [0.2, 0.5, 0.8, 1, 1.5, 2, 2.5, 4]);
    const k = pick(rng, [20, 40, 50, 80, 100, 150, 200, 320]);
    const wantsCritical = rng() < 0.5;

    const bCritical = 2 * Math.sqrt(m * k);
    // A damping well below critical, so the driven peak sits close to omega_0.
    const b = tidy(bCritical * pick(rng, [0.08, 0.12, 0.16, 0.2, 0.25]), 0.05);
    const omega0 = Math.sqrt(k / m);
    const omegaD = Math.sqrt(omega0 * omega0 - (b / (2 * m)) ** 2);

    const answer = wantsCritical ? bCritical : omegaD;
    const question = wantsCritical
      ? `A mass of $${q(m, 'kg')}$ hangs from a spring of stiffness $${q(k, 'N/m')}$. What damping coefficient $b$ would make the system **critically damped**?`
      : `A mass of $${q(m, 'kg')}$ on a spring of stiffness $${q(k, 'N/m')}$ is damped with $b = ${q(b, 'N \\cdot s/m')}$. ` +
        `Find the damped angular frequency $\\omega_d$.`;

    const traps = wantsCritical
      ? [
          {
            misconception: 'damping.critical-factor-dropped',
            value: Math.sqrt(m * k),
            tolerance: { rel: 0.015 },
            feedback:
              `The factor of 2 is missing. Critical damping is the repeated-root condition $b^2 = 4mk$, ` +
              `so $b_c = 2\\sqrt{mk}$ — the discriminant, not the product.`,
          },
          {
            misconception: 'oscillator.root-dropped',
            value: 2 * m * k,
            tolerance: { rel: 0.015 },
            feedback: `The square root is missing. $b_c = 2\\sqrt{mk}$, and $mk$ has units of $\\mathrm{kg^2/s^2}$ — its root is what carries $\\mathrm{N \\cdot s/m}$.`,
          },
        ]
      : [
          {
            misconception: 'damping.undamped-frequency-reported',
            value: omega0,
            tolerance: { rel: 0.004 },
            feedback:
              `That is the **undamped** natural frequency $\\omega_0 = \\sqrt{k/m}$. Damping always lowers it: ` +
              `$\\omega_d = \\sqrt{\\omega_0^2 - (b/2m)^2}$.`,
          },
          {
            misconception: 'damping.linear-subtraction',
            value: Math.abs(omega0 - b / (2 * m)),
            tolerance: { rel: 0.015 },
            feedback:
              `You subtracted the damping term from $\\omega_0$ directly. The two combine **in quadrature** — ` +
              `it is $\\omega_0^2 - (b/2m)^2$ under one root, not a difference of frequencies.`,
          },
        ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        ratioDifficulty(k, m),
        wantsCritical ? -0.4 : 0.5,
        mantissaDifficulty(k),
      ]),
      stem: question,
      answer: {
        kind: 'numeric' as const,
        value: answer,
        unit: wantsCritical ? 'N*s/m' : 'rad/s',
        tolerance: DEFAULT_TOLERANCE,
      },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          `The damped oscillator obeys $m\\ddot{x} + b\\dot{x} + kx = 0$, whose characteristic roots are $s = \\dfrac{-b \\pm \\sqrt{b^2 - 4mk}}{2m}$.`,
          `The discriminant $b^2 - 4mk$ decides the regime: negative oscillates, zero is critical, positive crawls back without overshooting.`,
          wantsCritical
            ? `Setting it to zero: $b_c = 2\\sqrt{mk} = 2\\sqrt{(${trimNumber(m)})(${trimNumber(k)})} = ${q(bCritical, 'N \\cdot s/m')}$.`
            : `With $b^2 < 4mk$ the roots are complex and their imaginary part is $\\omega_d = \\sqrt{\\dfrac{k}{m} - \\left(\\dfrac{b}{2m}\\right)^2}$.`,
          wantsCritical
            ? `Below $${q(bCritical, 'N \\cdot s/m')}$ the mass overshoots and rings; above it, it returns slowly without crossing. Critical damping is the fastest return with no overshoot, which is why door closers and galvanometers are built to it.`
            : `$\\omega_d = \\sqrt{${trimNumber(omega0 * omega0)} - ${trimNumber((b / (2 * m)) ** 2)}} = ${q(omegaD, 'rad/s')}$, just below $\\omega_0 = ${q(omega0, 'rad/s')}$ as light damping requires.`,
        ],
        principle:
          'The three damping regimes are the three signs of one discriminant — the same classification as an RLC circuit, because it is the same equation.',
        hints: [
          'Write the characteristic equation of $m\\ddot{x} + b\\dot{x} + kx = 0$.',
          wantsCritical ? 'What has to be true of the discriminant for a repeated root?' : 'Damping shifts the frequency: does it raise or lower it?',
        ],
      },
    };
  },
};

export const PHYS2335_OSCILLATION_GENERATORS: readonly Generator[] = [
  shmKinematics, oscillatorFrequency, criticalDamping,
];