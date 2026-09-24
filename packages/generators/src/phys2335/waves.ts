import type { Generator } from '../types.js';
import { DEFAULT_TOLERANCE } from '../types.js';
import {
  adjustDifficulty, engineering, intBetween, mantissaDifficulty, pick, ratioDifficulty,
  resampleUntil, trimNumber, type Rng,
} from '../rng.js';
import { separatedTraps } from '../traps.js';
import { I_REFERENCE, V_SOUND, q, tidy } from './common.js';

/**
 * Mechanical waves and sound.
 *
 * The unit's recurring error is not a formula anyone has forgotten. It is
 * deciding which quantity the medium fixes and which the source fixes, and
 * every generator here traps some form of that: a wavelength computed as
 * `f/v`, a closed pipe given even harmonics, a moving observer analysed with
 * the moving-source formula. All of them produce a plausible number, which is
 * why a learner's own check does not catch them.
 */

export const waveOnString: Generator = {
  id: 'phys2335.wave-speed.string',
  title: 'Wave speed and wavelength on a string',
  kcRefs: [{ kc: 'phys2335.wave-speed', weight: 1.0 }],
  difficultyB: -1.0,
  generate(rng: Rng) {
    const tension = pick(rng, [20, 40, 60, 80, 100, 150, 200, 250, 400]);
    const mu = pick(rng, [0.002, 0.004, 0.005, 0.008, 0.01, 0.016, 0.025, 0.04]);
    const f = pick(rng, [40, 60, 80, 100, 120, 150, 200, 250, 300]);

    const v = Math.sqrt(tension / mu);
    const lambda = v / f;
    const noRoot = tension / mu / f;
    const inverted = f / v;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(tension), ratioDifficulty(tension, 1 / mu)]),
      stem:
        `A string under a tension of $${q(tension, 'N')}$ has a linear mass density of ` +
        `$${q(mu, 'kg/m')}$. A wave of frequency $${q(f, 'Hz')}$ travels along it. Find the wavelength.`,
      answer: { kind: 'numeric' as const, value: lambda, unit: 'm', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(lambda, DEFAULT_TOLERANCE, [
        {
          misconception: 'wave.speed-root-dropped',
          value: noRoot,
          tolerance: { rel: 0.015 },
          feedback:
            `The square root is missing from the wave speed. $v = \\sqrt{T/\\mu}$ — check the units: ` +
            `$\\mathrm{N}/(\\mathrm{kg/m})$ is $\\mathrm{m^2/s^2}$, so a speed is its root.`,
        },
        {
          misconception: 'wave.frequency-wavelength-inverted',
          value: inverted,
          tolerance: { rel: 0.015 },
          feedback:
            `The ratio is upside down. $v = f\\lambda$, so $\\lambda = v/f$. A quick check: a higher ` +
            `frequency on the same string must give a **shorter** wavelength.`,
        },
        {
          misconception: 'wave.speed-frequency-multiplied',
          value: v * f,
          tolerance: { rel: 0.015 },
          feedback: `You multiplied where $v = f\\lambda$ divides. Rearranged, $\\lambda = v/f$.`,
        },
      ]),
      explanation: {
        steps: [
          `The medium sets the speed. For a string it is the tension against the inertia per unit length: $v = \\sqrt{T/\\mu}$.`,
          `$v = \\sqrt{${trimNumber(tension)}/${trimNumber(mu)}} = ${q(v, 'm/s')}$.`,
          `The source sets the frequency, and $v = f\\lambda$ links the two.`,
          `$\\lambda = \\dfrac{v}{f} = \\dfrac{${trimNumber(v)}}{${trimNumber(f)}} = ${q(lambda, 'm')}$.`,
        ],
        principle:
          'The medium fixes the speed and the source fixes the frequency, so the wavelength is whatever those two force it to be.',
        hints: ['What property of the string determines how fast a disturbance travels?', 'Which of $v$, $f$, $\\lambda$ is set by the string and which by the oscillator driving it?'],
      },
    };
  },
};

export const waveFunction: Generator = {
  id: 'phys2335.travelling-wave-function.parameters',
  title: 'Reading a travelling wave function',
  kcRefs: [
    { kc: 'phys2335.travelling-wave-function', weight: 0.8 },
    { kc: 'phys2335.wave-speed', weight: 0.2 },
  ],
  difficultyB: -0.3,
  generate(rng: Rng) {
    const amp = pick(rng, [0.01, 0.02, 0.03, 0.05, 0.08, 0.12]);
    const k = pick(rng, [2, 2.5, 4, 5, 6, 8, 10, 12.5]);
    const omega = pick(rng, [30, 45, 60, 80, 120, 150, 200, 240]);
    const wantsSpeed = rng() < 0.5;

    const v = omega / k;
    const lambda = (2 * Math.PI) / k;
    const answer = wantsSpeed ? v : lambda;

    const traps = wantsSpeed
      ? [
          {
            misconception: 'wave.frequency-wavelength-inverted',
            value: k / omega,
            tolerance: { rel: 0.015 },
            feedback:
              `Inverted. $v = \\omega/k$: the phase $kx - \\omega t$ stays constant when $x$ advances at ` +
              `$\\omega/k$, which is what "speed of the wave" means.`,
          },
          {
            misconception: 'wave.speed-frequency-multiplied',
            value: omega * k,
            tolerance: { rel: 0.015 },
            feedback: `A product has units of $\\mathrm{rad^2/(m \\cdot s)}$, not a speed. $v = \\omega/k$.`,
          },
        ]
      : [
          {
            misconception: 'wave.two-pi-dropped',
            value: 1 / k,
            tolerance: { rel: 0.015 },
            feedback:
              `The $2\\pi$ is missing. $k$ is radians per metre, and a full cycle is $2\\pi$ radians, ` +
              `so $\\lambda = 2\\pi/k$.`,
          },
          {
            misconception: 'wave.frequency-wavelength-inverted',
            value: k / (2 * Math.PI),
            tolerance: { rel: 0.015 },
            feedback: `Inverted. $k = 2\\pi/\\lambda$, so $\\lambda = 2\\pi/k$ — a larger wave number means a shorter wave.`,
          },
        ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(omega), wantsSpeed ? -0.4 : 0.4]),
      stem:
        `A wave on a string is described by $y(x,t) = ${trimNumber(amp)}\\sin(${trimNumber(k)}x - ${trimNumber(omega)}t)$, ` +
        `with $x$ and $y$ in metres and $t$ in seconds. Find the ${wantsSpeed ? 'speed of the wave' : 'wavelength'}.`,
      answer: {
        kind: 'numeric' as const,
        value: answer,
        unit: wantsSpeed ? 'm/s' : 'm',
        tolerance: DEFAULT_TOLERANCE,
      },
      options: [],
      misconceptionTraps: separatedTraps(answer, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          `Match the given form against $y = A\\sin(kx - \\omega t)$: the wave number is $k = ${trimNumber(k)}\\,\\mathrm{rad/m}$ and the angular frequency is $\\omega = ${trimNumber(omega)}\\,\\mathrm{rad/s}$.`,
          `The minus sign between the two terms means the wave travels in the $+x$ direction — a point of fixed phase needs $x$ to grow as $t$ does.`,
          wantsSpeed
            ? `Holding the phase constant, $kx - \\omega t = \\text{const}$, so $\\dfrac{dx}{dt} = \\dfrac{\\omega}{k}$.`
            : `A full spatial cycle is $2\\pi$ radians of phase, so $k\\lambda = 2\\pi$.`,
          wantsSpeed
            ? `$v = \\dfrac{${trimNumber(omega)}}{${trimNumber(k)}} = ${q(v, 'm/s')}$.`
            : `$\\lambda = \\dfrac{2\\pi}{${trimNumber(k)}} = ${q(lambda, 'm')}$.`,
        ],
        principle:
          'Everything about a travelling wave is read off its phase: $k$ is radians per metre, $\\omega$ is radians per second, and their ratio is metres per second.',
        hints: ['What does it mean for a point on the wave to keep the same phase?', 'How many radians of phase fit into one wavelength?'],
      },
    };
  },
};

export const interferencePhase: Generator = {
  id: 'phys2335.superposition-interference.phase',
  title: 'Phase difference from a path difference',
  kcRefs: [{ kc: 'phys2335.superposition-interference', weight: 1.0 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const f = pick(rng, [340, 425, 500, 686, 800, 1000, 1200, 1372]);
    const lambda = V_SOUND / f;
    // Path difference kept away from whole and half wavelengths, so the phase
    // answer is not a number the learner can recognise without computing it.
    const deltaD = resampleUntil(
      rng,
      (r) => tidy(lambda * (0.2 + 2.6 * r()), 0.01),
      (d) => {
        const cycles = d / lambda;
        const fromWhole = Math.abs(cycles - Math.round(cycles));
        return fromWhole > 0.12 && Math.abs(fromWhole - 0.5) > 0.12 && d > 0.05;
      },
    );

    const phase = (2 * Math.PI * deltaD) / lambda;
    const degrees = (360 * deltaD) / lambda;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(f), ratioDifficulty(deltaD, lambda)]),
      stem:
        `Two loudspeakers emit the same $${q(f, 'Hz')}$ tone in phase. At one listening position the path ` +
        `lengths from the two speakers differ by $${q(deltaD, 'm')}$. Taking the speed of sound as ` +
        `$${q(V_SOUND, 'm/s')}$, find the phase difference between the two arriving waves, in radians.`,
      answer: { kind: 'numeric' as const, value: phase, unit: 'rad', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(phase, DEFAULT_TOLERANCE, [
        {
          misconception: 'wave.two-pi-dropped',
          value: deltaD / lambda,
          tolerance: { rel: 0.015 },
          feedback:
            `That is the path difference **in wavelengths**, which is a count of cycles rather than a phase. ` +
            `Each whole wavelength is $2\\pi$ radians of phase, so multiply by $2\\pi$.`,
        },
        {
          misconception: 'phase.degrees-for-radians',
          value: degrees,
          tolerance: { rel: 0.015 },
          feedback:
            `That is the phase in degrees. The question asks for radians: ` +
            `$${trimNumber(degrees)}^{\\circ} \\times \\dfrac{\\pi}{180} = ${trimNumber(phase)}\\,\\mathrm{rad}$.`,
        },
        {
          misconception: 'wave.frequency-wavelength-inverted',
          value: (2 * Math.PI * lambda) / deltaD,
          tolerance: { rel: 0.015 },
          feedback: `The ratio is upside down. A path difference of one wavelength is one full cycle, so the fraction is $\\Delta d/\\lambda$.`,
        },
      ]),
      explanation: {
        steps: [
          `Both speakers are driven together, so all the phase difference at the listener comes from the extra distance one wave travelled.`,
          `$\\lambda = \\dfrac{v}{f} = \\dfrac{${trimNumber(V_SOUND)}}{${trimNumber(f)}} = ${q(lambda, 'm')}$.`,
          `One whole wavelength of extra path is one whole cycle, or $2\\pi$ radians, so $\\Delta\\phi = 2\\pi\\dfrac{\\Delta d}{\\lambda}$.`,
          `$\\Delta\\phi = 2\\pi\\dfrac{${trimNumber(deltaD)}}{${trimNumber(lambda)}} = ${trimNumber(phase)}\\,\\mathrm{rad}$, which is ${trimNumber(deltaD / lambda)} of a cycle — neither fully constructive nor fully destructive.`,
        ],
        principle:
          'Path difference and phase difference are the same statement in different units, and the conversion factor is $2\\pi$ per wavelength.',
        hints: ['How much phase does one whole wavelength of extra path add?', 'Work out the wavelength first.'],
      },
    };
  },
};

export const standingWaves: Generator = {
  id: 'phys2335.standing-waves.harmonic',
  title: 'Harmonics of a string or pipe',
  kcRefs: [
    { kc: 'phys2335.standing-waves', weight: 0.85 },
    { kc: 'phys2335.wave-speed', weight: 0.15 },
  ],
  difficultyB: 0.25,
  generate(rng: Rng) {
    const kind = pick(rng, ['string', 'open', 'closed'] as const);
    const length = pick(rng, [0.25, 0.3, 0.4, 0.5, 0.6, 0.75, 0.8, 1.0, 1.2]);
    // A closed pipe supports only odd harmonics, so asking for the second one
    // would have no answer. The index is drawn from what the system can do.
    const n = kind === 'closed' ? pick(rng, [1, 3, 5, 7]) : intBetween(rng, 1, 5);
    const v = kind === 'string' ? pick(rng, [120, 180, 240, 300, 360, 420]) : V_SOUND;

    const fundamental = kind === 'closed' ? v / (4 * length) : v / (2 * length);
    const f = n * fundamental;
    // The closed pipe treated as though both ends behaved alike.
    const asOpen = (n * v) / (2 * length);

    const described = {
      string: `A string of length $${q(length, 'm')}$ is fixed at both ends and carries waves at $${q(v, 'm/s')}$.`,
      open: `An organ pipe of length $${q(length, 'm')}$ is open at both ends. Take the speed of sound as $${q(V_SOUND, 'm/s')}$.`,
      closed: `An organ pipe of length $${q(length, 'm')}$ is closed at one end and open at the other. Take the speed of sound as $${q(V_SOUND, 'm/s')}$.`,
    }[kind];

    const ordinal = n === 1 ? 'fundamental' : `$n = ${n}$ harmonic`;

    const traps = [
      {
        misconception: 'standing.boundary-condition-ignored',
        value: kind === 'closed' ? asOpen : (n * v) / (4 * length),
        tolerance: { rel: 0.015 },
        feedback:
          kind === 'closed'
            ? `You used $f_n = nv/2L$, which is the **both-ends-alike** result. A pipe closed at one end has a ` +
              `node there and an antinode at the open end, so only a quarter wavelength fits in the fundamental: ` +
              `$f_n = nv/4L$ with $n$ odd.`
            : `You used $f_n = nv/4L$, which belongs to a pipe closed at one end. With both ends alike a ` +
              `**half** wavelength fits the fundamental, so $f_n = nv/2L$.`,
      },
      {
        misconception: 'standing.fundamental-for-harmonic',
        value: fundamental,
        tolerance: { rel: 0.015 },
        feedback: `That is the fundamental. The ${ordinal} is $n$ times it: $f_{${n}} = ${n}f_1$.`,
      },
    ];

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        kind === 'closed' ? 0.8 : -0.2,
        n === 1 ? -0.6 : 0.3,
        mantissaDifficulty(length),
      ]),
      stem: `${described} Find the frequency of its ${ordinal}.`,
      answer: { kind: 'numeric' as const, value: f, unit: 'Hz', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(f, DEFAULT_TOLERANCE, traps),
      explanation: {
        steps: [
          kind === 'closed'
            ? `A closed end must be a displacement node and an open end an antinode, so the shortest standing wave that fits is a **quarter** wavelength: $L = \\lambda_1/4$.`
            : `Both ends are alike — two nodes for the fixed string, two antinodes for the open pipe — so the shortest standing wave that fits is a **half** wavelength: $L = \\lambda_1/2$.`,
          kind === 'closed'
            ? `Adding half a wavelength at a time keeps both boundary conditions, which is why only odd multiples exist: $f_n = \\dfrac{nv}{4L}$, $n = 1, 3, 5, \\ldots$`
            : `Each extra half wavelength gives the next harmonic: $f_n = \\dfrac{nv}{2L}$, $n = 1, 2, 3, \\ldots$`,
          `$f_1 = ${q(fundamental, 'Hz')}$.`,
          `$f_{${n}} = ${n} \\times ${trimNumber(fundamental)} = ${q(f, 'Hz')}$.`,
        ],
        principle:
          'The boundary conditions decide which fractions of a wavelength fit, and everything else follows from that one picture.',
        hints: [
          'Sketch the standing wave: is each end a node or an antinode?',
          'How much of a wavelength fits between them in the fundamental?',
        ],
      },
    };
  },
};

export const beatFrequency: Generator = {
  id: 'phys2335.beats.frequency',
  title: 'Beat frequency',
  kcRefs: [
    { kc: 'phys2335.beats', weight: 0.8 },
    { kc: 'phys2335.superposition-interference', weight: 0.2 },
  ],
  difficultyB: -0.6,
  generate(rng: Rng) {
    const reference = pick(rng, [220, 256, 330, 392, 440, 494, 523]);
    const beat = pick(rng, [1.5, 2, 2.5, 3, 4, 5, 6, 7]);
    const sharp = rng() < 0.5;
    const other = sharp ? reference + beat : reference - beat;

    const answer = beat;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(reference), beat < 3 ? 0.4 : -0.4]),
      stem:
        `A tuning fork at $${q(reference, 'Hz')}$ is sounded together with a string vibrating at ` +
        `$${q(other, 'Hz')}$. How many beats per second are heard?`,
      answer: { kind: 'numeric' as const, value: answer, unit: 'Hz', tolerance: { abs: 0.05 } },
      options: [],
      misconceptionTraps: separatedTraps(answer, { abs: 0.05 }, [
        {
          misconception: 'beats.half-difference-reported',
          value: beat / 2,
          tolerance: { rel: 0.02 },
          feedback:
            `That is half the difference — the frequency of the **envelope's** cosine term, ` +
            `$\\cos(2\\pi\\frac{\\Delta f}{2}t)$. The ear hears a loudness maximum twice per cycle of that ` +
            `envelope, once at each extreme, so the beat rate is the full $|f_1 - f_2|$.`,
        },
        {
          misconception: 'beats.average-reported',
          value: (reference + other) / 2,
          tolerance: { rel: 0.02 },
          feedback:
            `That is the average of the two, which is the **pitch** you hear, not the beat rate. ` +
            `The superposition is a tone at the mean frequency whose amplitude pulses at the difference.`,
        },
        {
          misconception: 'beats.sum-reported',
          value: reference + other,
          tolerance: { rel: 0.02 },
          feedback: `Beats come from the **difference** of the two frequencies. Their sum has no audible meaning here.`,
        },
      ]),
      explanation: {
        steps: [
          `Adding two cosines gives $2\\cos\\!\\left(2\\pi\\frac{f_1-f_2}{2}t\\right)\\cos\\!\\left(2\\pi\\frac{f_1+f_2}{2}t\\right)$: a tone at the **mean** frequency inside an envelope at the **half-difference**.`,
          `Loudness follows the size of the envelope, not its sign, so a maximum occurs twice per envelope cycle.`,
          `The beat rate is therefore the full difference: $f_{beat} = |f_1 - f_2| = |${trimNumber(reference)} - ${trimNumber(other)}|$.`,
          `$f_{beat} = ${q(beat, 'Hz')}$.`,
        ],
        principle:
          'Beats are the envelope of a superposition, and the ear responds to its magnitude — which is why the rate is the difference rather than half of it.',
        hints: ['Write the sum of two cosines as a product.', 'How many times per envelope cycle is the sound loudest?'],
      },
    };
  },
};

export const soundIntensityLevel: Generator = {
  id: 'phys2335.sound-intensity.decibels',
  title: 'Sound intensity level',
  kcRefs: [{ kc: 'phys2335.sound-intensity', weight: 1.0 }],
  difficultyB: 0.1,
  generate(rng: Rng) {
    const power = pick(rng, [0.002, 0.005, 0.01, 0.02, 0.05, 0.1, 0.25, 0.5]);
    const r = pick(rng, [2, 3, 4, 5, 8, 10, 12, 15, 20]);
    // Asking for the distance inverts the whole chain — a logarithm and a
    // square root, both undone — which is a genuinely different ability point
    // from evaluating it forwards. Without the second mode every item in this
    // KC lands in one difficulty band and adaptive selection has nothing to
    // choose between.
    const forward = rng() < 0.55;

    const intensity = power / (4 * Math.PI * r * r);
    const db = 10 * Math.log10(intensity / I_REFERENCE);

    if (forward) {
      const amplitudeFactor = 20 * Math.log10(intensity / I_REFERENCE);
      const linearFalloff = power / (4 * Math.PI * r);

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(power), -0.7, r > 10 ? 0.2 : -0.2]),
        stem:
          `A small loudspeaker radiates $${engineering(power, 'W')}$ of sound power uniformly in all directions. ` +
          `Find the sound intensity level at a distance of $${q(r, 'm')}$, taking the reference intensity as ` +
          `$10^{-12}\\,\\mathrm{W/m^2}$.`,
        answer: { kind: 'numeric' as const, value: db, unit: 'dB', tolerance: { abs: 0.4 } },
        options: [],
        misconceptionTraps: separatedTraps(db, { abs: 0.4 }, [
          {
            misconception: 'decibel.amplitude-factor-used',
            value: amplitudeFactor,
            tolerance: { rel: 0.02 },
            feedback:
              `You used the factor 20, which belongs to a ratio of **amplitudes** (or pressures). Intensity is ` +
              `already a power quantity, so the factor is 10: $\\beta = 10\\log_{10}(I/I_0)$.`,
          },
          {
            misconception: 'intensity.inverse-square-dropped',
            value: 10 * Math.log10(linearFalloff / I_REFERENCE),
            tolerance: { rel: 0.02 },
            feedback:
              `The area of the sphere goes as $r^2$, not $r$. The same power spread over $4\\pi r^2$ gives ` +
              `$I = P/4\\pi r^2$ — which is why doubling the distance costs about 6 dB, not 3.`,
          },
        ]),
        explanation: {
          steps: [
            `The power spreads uniformly over a sphere, so the intensity is the power divided by that sphere's area: $I = \\dfrac{P}{4\\pi r^2}$.`,
            `$I = \\dfrac{${trimNumber(power)}}{4\\pi(${trimNumber(r)})^2} = ${trimNumber(intensity, 3)}\\,\\mathrm{W/m^2}$.`,
            `The decibel scale compares that against the reference intensity logarithmically: $\\beta = 10\\log_{10}(I/I_0)$.`,
            `$\\beta = 10\\log_{10}\\!\\left(\\dfrac{${trimNumber(intensity, 3)}}{10^{-12}}\\right) = ${trimNumber(db, 4)}\\,\\mathrm{dB}$.`,
          ],
          principle:
            'Intensity falls as the inverse square because a sphere\'s area does, and the decibel is a ratio — so distance and level are linked by a logarithm of a square.',
          hints: ['Over what surface is the power spread at distance $r$?', 'Is intensity an amplitude quantity or a power quantity?'],
        },
      };
    }

    // Inverse: a target level is given and the distance is the unknown.
    const target = tidy(db - pick(rng, [6, 10, 12, 15, 20, 25]), 0.5);
    const targetIntensity = I_REFERENCE * 10 ** (target / 10);
    const distance = Math.sqrt(power / (4 * Math.PI * targetIntensity));
    const rootDropped = power / (4 * Math.PI * targetIntensity);
    const amplitudeFactor = Math.sqrt(power / (4 * Math.PI * I_REFERENCE * 10 ** (target / 20)));

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [mantissaDifficulty(power), 0.9, 0.5]),
      stem:
        `A small loudspeaker radiates $${engineering(power, 'W')}$ of sound power uniformly in all directions. ` +
        `At what distance does the sound intensity level fall to $${q(target, 'dB')}$? Take the reference ` +
        `intensity as $10^{-12}\\,\\mathrm{W/m^2}$.`,
      answer: { kind: 'numeric' as const, value: distance, unit: 'm', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(distance, DEFAULT_TOLERANCE, [
        {
          misconception: 'intensity.inverse-square-dropped',
          value: rootDropped,
          tolerance: { rel: 0.02 },
          feedback:
            `You stopped at $r^2$. Undoing the logarithm gives the intensity, and $I = P/4\\pi r^2$ then has ` +
            `to be solved for $r$ — which needs the square root.`,
        },
        {
          misconception: 'decibel.amplitude-factor-used',
          value: amplitudeFactor,
          tolerance: { rel: 0.02 },
          feedback:
            `You inverted with a factor of 20. Intensity is a power quantity, so the level is ` +
            `$10\\log_{10}(I/I_0)$ and undoing it is $I = I_0 \\cdot 10^{\\beta/10}$.`,
        },
      ]),
      explanation: {
        steps: [
          `Undo the decibel definition first: $\\beta = 10\\log_{10}(I/I_0)$ gives $I = I_0 \\cdot 10^{\\beta/10}$.`,
          `$I = 10^{-12} \\cdot 10^{${trimNumber(target / 10, 4)}} = ${trimNumber(targetIntensity, 3)}\\,\\mathrm{W/m^2}$.`,
          `Then invert the spreading: $I = \\dfrac{P}{4\\pi r^2}$ rearranges to $r = \\sqrt{\\dfrac{P}{4\\pi I}}$.`,
          `$r = \\sqrt{\\dfrac{${trimNumber(power)}}{4\\pi(${trimNumber(targetIntensity, 3)})}} = ${q(distance, 'm')}$.`,
        ],
        principle:
          'Working backwards through a level is two inversions in sequence — a logarithm and a square — and dropping either one leaves a plausible number.',
        hints: ['What intensity does that level correspond to?', 'Once you have the intensity, what does $I = P/4\\pi r^2$ give you?'],
      },
    };
  },
};

export const dopplerShift: Generator = {
  id: 'phys2335.doppler-effect.observed',
  title: 'Doppler-shifted frequency',
  kcRefs: [{ kc: 'phys2335.doppler-effect', weight: 1.0 }],
  difficultyB: 0.55,
  generate(rng: Rng) {
    const f = pick(rng, [200, 300, 400, 440, 500, 660, 800, 1000]);
    const speed = pick(rng, [12, 15, 20, 25, 30, 34, 40, 45]);
    const sourceMoves = rng() < 0.5;
    const approaching = rng() < 0.5;
    const v = V_SOUND;

    // Source moving: the wavelength ahead of it is compressed.
    // Observer moving: the wavelength is untouched, the arrival rate changes.
    const observed = sourceMoves
      ? (f * v) / (approaching ? v - speed : v + speed)
      : (f * (approaching ? v + speed : v - speed)) / v;
    // The other mechanism's formula, applied to this situation.
    const wrongMechanism = sourceMoves
      ? (f * (approaching ? v + speed : v - speed)) / v
      : (f * v) / (approaching ? v - speed : v + speed);
    // The right mechanism with the sign reversed.
    const signFlipped = sourceMoves
      ? (f * v) / (approaching ? v + speed : v - speed)
      : (f * (approaching ? v - speed : v + speed)) / v;

    const scene = sourceMoves
      ? `An ambulance sounding a $${q(f, 'Hz')}$ siren travels at $${q(speed, 'm/s')}$ ${approaching ? 'towards' : 'away from'} a stationary listener.`
      : `A listener travels at $${q(speed, 'm/s')}$ ${approaching ? 'towards' : 'away from'} a stationary $${q(f, 'Hz')}$ siren.`;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        sourceMoves ? -0.2 : 0.4,
        approaching ? -0.3 : 0.5,
        mantissaDifficulty(f),
      ]),
      stem: `${scene} Take the speed of sound as $${q(v, 'm/s')}$. Find the frequency the listener hears.`,
      answer: { kind: 'numeric' as const, value: observed, unit: 'Hz', tolerance: DEFAULT_TOLERANCE },
      options: [],
      misconceptionTraps: separatedTraps(observed, DEFAULT_TOLERANCE, [
        {
          misconception: 'doppler.wrong-mechanism',
          value: wrongMechanism,
          tolerance: { rel: 0.01 },
          feedback:
            sourceMoves
              ? `You put the speed in the numerator, which is the **moving observer** formula. A moving source ` +
                `changes the wavelength it emits, so its speed belongs in the denominator: $f' = f\\dfrac{v}{v \\mp v_s}$.`
              : `You put the speed in the denominator, which is the **moving source** formula. A moving observer ` +
                `meets an unchanged wavelength at a different rate, so the speed belongs in the numerator: ` +
                `$f' = f\\dfrac{v \\pm v_o}{v}$.`,
        },
        {
          misconception: 'doppler.sign-reversed',
          value: signFlipped,
          tolerance: { rel: 0.01 },
          feedback:
            `The sign is the wrong way round. ${approaching ? 'Approaching' : 'Receding'} must give a ` +
            `${approaching ? '**higher**' : '**lower**'} frequency than $${q(f, 'Hz')}$, and your value goes the other way. ` +
            `Fix the sign by asking which way the pitch should move before touching the algebra.`,
        },
      ]),
      explanation: {
        steps: [
          sourceMoves
            ? `A moving source emits each successive crest from a different place, so the wavelength itself is altered: ahead of the source it is compressed to $\\lambda' = (v - v_s)/f$.`
            : `A moving observer meets a wavelength that is unchanged — the source is still — but sweeps through it faster or slower, so the **rate of arrival** changes.`,
          sourceMoves
            ? `$f' = \\dfrac{v}{\\lambda'} = f\\dfrac{v}{v ${approaching ? '-' : '+'} v_s}$.`
            : `$f' = \\dfrac{v ${approaching ? '+' : '-'} v_o}{\\lambda} = f\\dfrac{v ${approaching ? '+' : '-'} v_o}{v}$.`,
          sourceMoves
            ? `$f' = ${trimNumber(f)}\\dfrac{${trimNumber(v)}}{${trimNumber(v)} ${approaching ? '-' : '+'} ${trimNumber(speed)}} = ${q(observed, 'Hz')}$.`
            : `$f' = ${trimNumber(f)}\\dfrac{${trimNumber(v)} ${approaching ? '+' : '-'} ${trimNumber(speed)}}{${trimNumber(v)}} = ${q(observed, 'Hz')}$.`,
          `Sanity check: ${approaching ? 'approaching raises the pitch' : 'receding lowers the pitch'}, and $${q(observed, 'Hz')}$ is ${approaching ? 'above' : 'below'} $${q(f, 'Hz')}$ as it must be.`,
        ],
        principle:
          'A moving source changes the wavelength; a moving observer changes the rate of arrival. They are different mechanisms, so their algebra differs — and the direction of the shift is the check that catches a sign error.',
        hints: [
          'Which is moving: the thing making the waves, or the thing counting them?',
          'Before computing: should the pitch come out higher or lower?',
        ],
      },
    };
  },
};

export const PHYS2335_WAVE_GENERATORS: readonly Generator[] = [
  waveOnString, waveFunction, interferencePhase, standingWaves,
  beatFrequency, soundIntensityLevel, dopplerShift,
];
