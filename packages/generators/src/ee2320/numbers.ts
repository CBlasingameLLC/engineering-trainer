import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';

/**
 * EE 2320, Unit 1 — number systems.
 *
 * Two's complement is where this unit earns its place in a gap finder. The
 * flip-and-add-one recipe is easy to retain and easy to apply to the wrong
 * thing, so the traps here target the two errors that survive a semester:
 * treating the MSB as a sign flag rather than a negative place value, and
 * reading a carry out of the MSB as overflow.
 */

const toBin = (value: number, width: number): string =>
  (value >>> 0).toString(2).padStart(width, '0').slice(-width);

export const baseConversion: Generator = {
  id: 'ee2320.numbers.conversion',
  title: 'Convert between bases',
  kcRefs: [{ kc: 'ee2320.number-systems', weight: 1 }],
  difficultyB: -1.2,
  generate(rng: Rng) {
    const value = intBetween(rng, 18, 255);
    const from = pick(rng, [2, 16] as const);

    const render = (v: number, base: number): string =>
      base === 2 ? toBin(v, v > 15 ? 8 : 4) : v.toString(16).toUpperCase();
    const label = (base: number): string => (base === 2 ? 'binary' : 'hexadecimal');

    // Converting *to* decimal, always. A hexadecimal answer cannot be a numeric
    // answer: "7A" is not a number, and encoding its digits as one produced
    // keys like 710 that agreed with nothing. Targets other than decimal are
    // asked as multiple choice below instead.
    const toDecimal = rng() < 0.6;

    if (toDecimal) {
      // Reading the digits as though they were already decimal.
      const misread = from === 16 ? Number(value.toString(16).replace(/[a-f]/g, '')) : Number(toBin(value, 8));

      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [value > 128 ? 0.6 : -0.4, from === 16 ? 0.4 : -0.4]),
        stem: `Convert $${render(value, from)}_{${from}}$ to decimal.`,
        answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
        options: [],
        misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
          ...(Number.isFinite(misread) && misread > 0
            ? [{
                misconception: 'numbers.digits-read-in-wrong-base',
                value: misread,
                tolerance: { abs: 0.01 },
                feedback:
                  `The digits were carried across unchanged. Each position is worth a power of its **own** base, so ` +
                  `converting is re-weighting the places, not relabelling the digits.`,
              }]
            : []),
          {
            misconception: 'numbers.place-value-off-by-one',
            value: from === 2 ? value * 2 : value * 16,
            tolerance: { abs: 0.01 },
            feedback:
              `Every place is weighted one power too high. The rightmost digit has weight $${from}^0 = 1$, not $${from}$.`,
          },
        ]),
        explanation: {
          steps: [
            `Weight each digit by a power of ${from}, starting at $${from}^0$ on the right.`,
            from === 2
              ? `$${toBin(value, 8)}_2 = ${toBin(value, 8).split('').map((b, i, a) => (b === '1' ? 2 ** (a.length - 1 - i) : 0)).filter((x) => x > 0).join(' + ')}$.`
              : `$${value.toString(16).toUpperCase()}_{16}$: each hex digit is worth 16 times the one to its right.`,
            `The total is ${value}.`,
          ],
          principle:
            'A base conversion is a change of place values; hexadecimal is shorthand for groups of four bits and nothing more.',
          hints: ['Write the place values above the digits first.', 'The rightmost place is always worth 1.'],
        },
      };
    }

    const to = from === 2 ? 16 : 2;
    const correct = render(value, to);
    // Plausible wrong renderings: off by one in the last place, and the
    // nibble-grouping error that shifts everything by a bit.
    const wrong1 = render(value + 1, to);
    const wrong2 = render(value >> 1, to);
    const wrong3 = render(((value & 0x0f) << 4) | (value >> 4), to);

    const seen = new Set([correct]);
    const distractors = [wrong1, wrong2, wrong3].filter((w) => !seen.has(w) && seen.add(w));

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [from === 16 ? 0.5 : -0.5]),
      stem: `Convert $${render(value, from)}_{${from}}$ to ${label(to)}.`,
      answer: { kind: 'choice' as const, correctId: 'a' },
      options: [
        { id: 'a', text: `$${correct}_{${to}}$`, rationale: `The value is ${value} in decimal.` },
        ...distractors.slice(0, 3).map((text, i) => ({
          id: ['b', 'c', 'd'][i]!,
          text: `$${text}_{${to}}$`,
          misconception: 'numbers.nibble-grouping-error',
          rationale: 'Convert via decimal, or group the bits into nibbles from the right, and compare.',
        })),
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `$${render(value, from)}_{${from}}$ is ${value} in decimal.`,
          to === 16
            ? `Group the bits into nibbles **from the right** and convert each: $${correct}_{16}$.`
            : `Expand each hex digit into four bits: $${correct}_2$.`,
        ],
        principle:
          'Binary and hexadecimal convert by grouping, not by arithmetic — four bits is exactly one hex digit, counted from the right.',
        hints: ['Group from the right, never the left.', 'Go via decimal if grouping is unclear.'],
      },
    };
  },
};

export const twosComplement: Generator = {
  id: 'ee2320.numbers.twos-complement',
  title: "Two's complement representation",
  kcRefs: [{ kc: 'ee2320.signed-numbers', weight: 1 }],
  difficultyB: -0.4,
  generate(rng: Rng) {
    const width = pick(rng, [4, 8] as const);
    const magnitude = intBetween(rng, 1, 2 ** (width - 1) - 1);
    const negative = rng() < 0.6;
    const value = negative ? -magnitude : magnitude;

    const pattern = toBin(negative ? 2 ** width + value : value, width);
    const asUnsigned = Number.parseInt(pattern, 2);
    // Sign-magnitude reading: MSB as a flag, remaining bits as the magnitude.
    const signMagnitude = negative ? -(asUnsigned - 2 ** (width - 1)) : asUnsigned;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [negative ? 0.7 : -0.7, width === 8 ? 0.3 : -0.3]),
      stem:
        `Interpret the ${width}-bit two's complement pattern $${pattern}_2$ as a signed decimal value.`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'numbers.unsigned-reading',
          value: asUnsigned,
          tolerance: { abs: 0.01 },
          feedback:
            `You read it as unsigned. In two's complement the top bit carries a **negative** weight of ` +
            `$-2^{${width - 1}} = -${2 ** (width - 1)}$, so a leading 1 makes the value negative.`,
        },
        ...(negative
          ? [{
              misconception: 'numbers.sign-magnitude-assumed',
              value: signMagnitude,
              tolerance: { abs: 0.01 },
              feedback:
                `That is the sign-magnitude reading: MSB as a flag, the rest as a plain magnitude. Two's complement is ` +
                `different — invert all the bits and add one, or weight the MSB negatively.`,
            }]
          : [{
              // For a positive pattern the unsigned reading *is* the answer, so
              // that trap collapses and is filtered out — leaving the item with
              // no diagnosis at all. This one is always distinct: it is the
              // error of assuming the value must be negative because the
              // encoding is called two's complement.
              misconception: 'numbers.sign-assumed-from-encoding',
              value: value - 2 ** width,
              tolerance: { abs: 0.01 },
              feedback:
                `You treated the pattern as negative. The leading bit is 0, so this value is positive — two's ` +
                `complement only makes a number negative when the MSB is set.`,
            }]),
      ]),
      explanation: {
        steps: [
          `The MSB of a ${width}-bit two's complement number has weight $-2^{${width - 1}}$.`,
          negative
            ? `Leading bit is 1, so the value is negative. Invert and add one: the magnitude is ${magnitude}.`
            : `Leading bit is 0, so the value is just the unsigned reading.`,
          `So $${pattern}_2 = ${value}$.`,
        ],
        principle:
          "Two's complement is not a sign flag — it is ordinary binary with the top place value made negative, which is why addition needs no special case.",
        hints: ['What is the weight of the leading bit?', 'Invert and add one to read a negative magnitude.'],
      },
    };
  },
};

export const binaryOverflow: Generator = {
  id: 'ee2320.numbers.overflow',
  title: 'Signed overflow detection',
  kcRefs: [{ kc: 'ee2320.binary-arithmetic', weight: 1 }],
  difficultyB: 0.2,
  generate(rng: Rng) {
    const width = 4;
    const limit = 2 ** (width - 1);

    // Draw a pair that either does or does not overflow, deliberately.
    const wantOverflow = rng() < 0.5;
    let a = intBetween(rng, -limit, limit - 1);
    let b = intBetween(rng, -limit, limit - 1);
    for (let i = 0; i < 40; i++) {
      const sum = a + b;
      if ((sum < -limit || sum > limit - 1) === wantOverflow) break;
      a = intBetween(rng, -limit, limit - 1);
      b = intBetween(rng, -limit, limit - 1);
    }

    const sum = a + b;
    const overflow = sum < -limit || sum > limit - 1;
    const patternA = toBin(a < 0 ? 2 ** width + a : a, width);
    const patternB = toBin(b < 0 ? 2 ** width + b : b, width);
    const rawSum = (Number.parseInt(patternA, 2) + Number.parseInt(patternB, 2)) % 2 ** width;
    const carryOut = Number.parseInt(patternA, 2) + Number.parseInt(patternB, 2) >= 2 ** width;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [carryOut !== overflow ? 1 : -0.6]),
      stem:
        `Add the ${width}-bit two's complement numbers $${patternA}_2$ and $${patternB}_2$ ` +
        `(that is, ${a} and ${b}).\\n\\nDoes signed overflow occur?`,
      answer: { kind: 'choice' as const, correctId: overflow ? 'a' : 'b' },
      options: [
        {
          id: 'a', text: 'Yes — the result is outside the representable range',
          ...(overflow ? {} : { misconception: 'numbers.carry-read-as-overflow' }),
          rationale: overflow
            ? `${a} + ${b} = ${sum}, outside $[-${limit}, ${limit - 1}]$, so the stored result $${toBin(rawSum, width)}_2$ is wrong.`
            : `${a} + ${b} = ${sum}, which fits in $[-${limit}, ${limit - 1}]$. ${carryOut ? 'There is a carry out of the MSB, but that is not overflow.' : ''}`,
        },
        {
          id: 'b', text: 'No — the result is representable',
          ...(overflow ? { misconception: 'numbers.overflow-missed' } : {}),
          rationale: overflow
            ? `It is not: ${sum} lies outside $[-${limit}, ${limit - 1}]$.`
            : `Correct — ${sum} is in range.`,
        },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `A ${width}-bit signed value ranges over $[-${limit}, ${limit - 1}]$.`,
          `${a} + ${b} = ${sum}.`,
          overflow
            ? `That is outside the range, so overflow occurs and the stored pattern $${toBin(rawSum, width)}_2$ does not represent the true sum.`
            : `That is inside the range, so there is no overflow${carryOut ? ' — even though a carry leaves the MSB, which is a different thing entirely' : ''}.`,
          `Overflow happens exactly when two operands of the **same** sign produce a result of the opposite sign.`,
        ],
        principle:
          'Carry out of the MSB and signed overflow are different signals; adding a positive and a negative number can never overflow, however much carry it produces.',
        hints: ['What is the representable range?', 'Do the two operands share a sign?'],
      },
    };
  },
};

export const binaryCodes: Generator = {
  id: 'ee2320.numbers.codes',
  title: 'BCD, Gray code and parity',
  kcRefs: [{ kc: 'ee2320.binary-codes', weight: 1 }],
  difficultyB: -0.3,
  generate(rng: Rng) {
    const mode = pick(rng, ['gray', 'bcd', 'parity'] as const);
    const width = 4;

    if (mode === 'gray') {
      const value = intBetween(rng, 0, 15);
      const gray = value ^ (value >> 1);
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.4]),
        stem: `Convert the ${width}-bit binary value $${toBin(value, width)}_2$ to Gray code. Enter the result as a binary number.`,
        answer: { kind: 'numeric' as const, value: Number(toBin(gray, width)), unit: '', tolerance: { abs: 0.01 } },
        options: [],
        misconceptionTraps: separatedTraps(Number(toBin(gray, width)), { abs: 0.01 }, [
          {
            misconception: 'codes.gray-conversion-reversed',
            value: Number(toBin(value, width)),
            tolerance: { abs: 0.01 },
            feedback: `That is the original binary. Gray code XORs each bit with the one above it, so consecutive values differ in exactly one bit.`,
          },
        ]),
        explanation: {
          steps: [
            `Gray code: keep the MSB, then XOR each bit with the bit to its left.`,
            `$${toBin(value, width)} \\rightarrow ${toBin(gray, width)}$.`,
            `Enter ${toBin(gray, width)}.`,
          ],
          principle:
            'Gray code changes one bit between adjacent values, which is exactly why Karnaugh map rows and columns are labelled with it.',
          hints: ['The MSB never changes.', 'XOR each bit with its left neighbour.'],
        },
      };
    }

    if (mode === 'bcd') {
      const value = intBetween(rng, 10, 99);
      const bcd = `${toBin(Math.floor(value / 10), 4)} ${toBin(value % 10, 4)}`;
      const plainBinary = Number(toBin(value, 8));
      return {
        type: 'numeric' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [-0.3]),
        stem: `Encode the decimal number ${value} in 8-bit BCD. Enter the eight bits with no space.`,
        answer: { kind: 'numeric' as const, value: Number(bcd.replace(' ', '')), unit: '', tolerance: { abs: 0.01 } },
        options: [],
        misconceptionTraps: separatedTraps(Number(bcd.replace(' ', '')), { abs: 0.01 }, [
          {
            misconception: 'codes.bcd-vs-binary',
            value: plainBinary,
            tolerance: { abs: 0.01 },
            feedback:
              `That is the plain binary value of ${value}. BCD encodes each **decimal digit** separately in four bits, ` +
              `which is why it wastes the six patterns above 1001.`,
          },
        ]),
        explanation: {
          steps: [
            `BCD encodes each decimal digit in its own nibble.`,
            `${Math.floor(value / 10)} → ${toBin(Math.floor(value / 10), 4)}, ${value % 10} → ${toBin(value % 10, 4)}.`,
            `So ${value} is ${bcd.replace(' ', '')}.`,
          ],
          principle: 'BCD trades density for direct decimal readout — each digit stands alone rather than contributing to one binary value.',
          hints: ['Encode each decimal digit separately.', 'Each digit needs exactly four bits.'],
        },
      };
    }

    const value = intBetween(rng, 0, 127);
    const bits = toBin(value, 7);
    const ones = bits.split('').filter((b) => b === '1').length;
    const even = rng() < 0.5;
    const parityBit = even ? ones % 2 : 1 - (ones % 2);

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [even ? -0.4 : 0.4]),
      stem: `The 7-bit word $${bits}_2$ is sent with **${even ? 'even' : 'odd'}** parity. What is the parity bit?`,
      answer: { kind: 'choice' as const, correctId: parityBit === 1 ? 'a' : 'b' },
      options: [
        { id: 'a', text: '1', ...(parityBit === 1 ? {} : { misconception: 'codes.parity-sense-inverted' }), rationale: `The word has ${ones} ones.` },
        { id: 'b', text: '0', ...(parityBit === 0 ? {} : { misconception: 'codes.parity-sense-inverted' }), rationale: `The word has ${ones} ones.` },
      ],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Count the ones in the data: ${ones}.`,
          `${even ? 'Even' : 'Odd'} parity means the **total** including the parity bit must be ${even ? 'even' : 'odd'}.`,
          `So the parity bit is ${parityBit}.`,
        ],
        principle: 'Parity detects any odd number of bit errors and no even number — cheap, and exactly that strong.',
        hints: ['Count the ones in the data bits.', 'Include the parity bit in the total.'],
      },
    };
  },
};

export const EE2320_NUMBER_GENERATORS: readonly Generator[] = [
  baseConversion,
  twosComplement,
  binaryOverflow,
  binaryCodes,
];
