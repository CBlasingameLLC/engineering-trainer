import type { Generator } from '../types.js';
import { adjustDifficulty, intBetween, pick, type Rng } from '../rng.js';
import { separatedTraps } from '../traps.js';
import { rowsOf, texTable } from '../logic-common.js';

/**
 * EE 2320, Unit 5 — sequential logic.
 *
 * The next-state items are truth tables with one input column that is not an
 * input at all: the present state. That is the whole conceptual step of the
 * unit, and stating it as a table makes it gradeable by the same widget as
 * everything else — the flip-flop's characteristic table *is* a truth table
 * over (inputs, current state).
 */

export const latchBehaviour: Generator = {
  id: 'ee2320.sequential.latch',
  title: 'SR latch next state',
  kcRefs: [{ kc: 'ee2320.latches', weight: 1 }],
  difficultyB: 0.4,
  generate(rng: Rng) {
    // Q+ = S + R'Q, with S=R=1 forbidden. The forbidden row is asked about
    // separately rather than encoded, because there is no correct output.
    const variables = ['S', 'R', 'Q'];
    const expression = "S + R'*Q";
    const rows = rowsOf(expression, variables);
    const askForbidden = rng() < 0.35;

    if (askForbidden) {
      return {
        type: 'multiple-choice' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [1]),
        stem: `In an active-high SR latch, what happens when $S = R = 1$?`,
        answer: { kind: 'choice' as const, correctId: 'a' },
        options: [
          {
            id: 'a',
            text: 'It is a forbidden input — both outputs go to the same level, and the next state is unpredictable when the inputs are released together',
            rationale: 'Q and Q̄ stop being complements, and the state settled on afterwards depends on which input falls first.',
          },
          {
            id: 'b', text: 'The latch holds its previous state', misconception: 'latch.forbidden-treated-as-hold',
            rationale: 'Holding is $S = R = 0$. Asserting both drives both outputs, it does not idle.',
          },
          {
            id: 'c', text: 'The latch toggles', misconception: 'latch.forbidden-treated-as-toggle',
            rationale: 'Toggling is the JK flip-flop behaviour with both inputs high, not an SR latch.',
          },
          {
            id: 'd', text: 'Set wins and the output goes to 1', misconception: 'latch.priority-assumed',
            rationale: 'Neither input has priority in a symmetric SR latch.',
          },
        ],
        misconceptionTraps: [],
        explanation: {
          steps: [
            `$S = R = 0$ holds, $S = 1$ sets, $R = 1$ resets.`,
            `With both asserted, the cross-coupled gates drive $Q$ and $\\overline{Q}$ to the same level — they are no longer complements.`,
            `Releasing both at once leaves the outcome decided by propagation delays, which is why the combination is excluded by design.`,
          ],
          principle:
            'The forbidden state is forbidden because the latch stops being a memory: its two outputs no longer encode one bit.',
          hints: ['What are Q and Q̄ supposed to be relative to each other?', 'What happens when both inputs go away simultaneously?'],
        },
      };
    }

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [-1]),
      stem:
        `Complete the next-state table for an active-high SR latch, where $Q$ is the present state and ` +
        `$Q^+$ the next state.\n\n` +
        `Ignore the forbidden combination $S = R = 1$ — enter the value the expression $Q^+ = S + \\overline{R}Q$ gives.`,
      answer: { kind: 'truth-table' as const, inputs: variables, output: 'Q+', rows },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Set forces $Q^+ = 1$; reset forces $Q^+ = 0$; with neither asserted the latch holds $Q$.`,
          `That is exactly $Q^+ = S + \\overline{R}Q$.`,
          `The completed table is $${texTable(variables, rows, 'Q+')}$.`,
        ],
        principle:
          'A sequential element is combinational logic whose inputs include its own output — the present state is just another column.',
        hints: ['What should the output be when neither input is asserted?', 'Treat Q as a third input.'],
      },
    };
  },
};

export const flipFlopNextState: Generator = {
  id: 'ee2320.sequential.flip-flop',
  title: 'Flip-flop characteristic table',
  kcRefs: [{ kc: 'ee2320.flip-flops', weight: 1 }],
  difficultyB: 0.6,
  generate(rng: Rng) {
    const kind = pick(rng, ['D', 'T', 'JK'] as const);

    if (kind === 'JK') {
      const variables = ['J', 'K', 'Q'];
      const expression = "J*Q' + K'*Q";
      const rows = rowsOf(expression, variables);
      return {
        type: 'truth-table' as const,
        kcRefs: this.kcRefs,
        difficultyB: adjustDifficulty(this.difficultyB, [0.8]),
        stem: `Complete the characteristic table for a JK flip-flop: $Q^+$ in terms of $J$, $K$ and the present state $Q$.`,
        answer: { kind: 'truth-table' as const, inputs: variables, output: 'Q+', rows },
        options: [],
        misconceptionTraps: [],
        explanation: {
          steps: [
            `$J=K=0$ holds, $J=1,K=0$ sets, $J=0,K=1$ resets, and $J=K=1$ **toggles**.`,
            `Algebraically $Q^+ = J\\overline{Q} + \\overline{K}Q$.`,
            `The table is $${texTable(variables, rows, 'Q+')}$.`,
          ],
          principle:
            'JK is SR with the forbidden combination redefined as toggle, which is what makes it universal among flip-flops.',
          hints: ['What does JK do that SR cannot?', 'Work out the J=K=1 rows first.'],
        },
      };
    }

    const variables = kind === 'D' ? ['D', 'Q'] : ['T', 'Q'];
    const expression = kind === 'D' ? 'D' : 'T ^ Q';
    const rows = rowsOf(expression, variables);

    return {
      type: 'truth-table' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [kind === 'D' ? -1 : 0]),
      stem:
        `Complete the characteristic table for a ${kind} flip-flop: $Q^+$ in terms of ` +
        `$${kind}$ and the present state $Q$.`,
      answer: { kind: 'truth-table' as const, inputs: variables, output: 'Q+', rows },
      options: [],
      misconceptionTraps: [],
      explanation: {
        steps: [
          kind === 'D'
            ? `A D flip-flop simply captures its input: $Q^+ = D$, whatever $Q$ was.`
            : `A T flip-flop toggles when $T = 1$ and holds when $T = 0$: $Q^+ = T \\oplus Q$.`,
          `The table is $${texTable(variables, rows, 'Q+')}$.`,
        ],
        principle:
          kind === 'D'
            ? 'D is the flip-flop whose next state ignores its present state — which is exactly why it is the easy one to design with.'
            : 'T is the flip-flop whose next state depends on its present state, which makes it the natural counter element.',
        hints: [
          kind === 'D' ? 'Does the present state matter at all?' : 'What does T = 1 do to the stored bit?',
          'The present state is an input column here.',
        ],
      },
    };
  },
};

export const flipFlopTiming: Generator = {
  id: 'ee2320.sequential.timing',
  title: 'Maximum clock frequency',
  kcRefs: [{ kc: 'ee2320.flip-flop-timing', weight: 1 }],
  difficultyB: 0.9,
  generate(rng: Rng) {
    const clockToQ = pick(rng, [1, 1.5, 2, 2.5]);
    const logic = pick(rng, [3, 4, 5, 6, 8]);
    const setup = pick(rng, [0.5, 1, 1.5, 2]);

    const period = clockToQ + logic + setup;
    const value = 1000 / period; // MHz, with times in ns

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [logic > 5 ? -0.3 : 0.3]),
      stem:
        `In a synchronous design, clock-to-Q is ${clockToQ} ns, the worst-case combinational path is ` +
        `${logic} ns, and the setup time is ${setup} ns.\n\n` +
        `What is the maximum clock frequency, in MHz?`,
      answer: { kind: 'numeric' as const, value, unit: 'MHz', tolerance: { rel: 0.02 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { rel: 0.02 }, [
        {
          misconception: 'timing.setup-omitted',
          value: 1000 / (clockToQ + logic),
          tolerance: { rel: 0.015 },
          feedback:
            `Setup time was left out. Data must be **stable before** the next edge, not merely arrive at it, so setup ` +
            `adds to the required period just as logic delay does.`,
        },
        {
          misconception: 'timing.logic-delay-only',
          value: 1000 / logic,
          tolerance: { rel: 0.015 },
          feedback:
            `Only the combinational path was counted. The clock-to-Q delay happens before the logic even starts, and ` +
            `setup must be satisfied after it finishes.`,
        },
      ]),
      explanation: {
        steps: [
          `The clock period must cover the whole path: $t_{cq} + t_{logic} + t_{setup}$.`,
          `$${clockToQ} + ${logic} + ${setup} = ${period}$ ns.`,
          `$f_{max} = 1 / ${period}\\,\\text{ns} = ${value.toFixed(1)}$ MHz.`,
        ],
        principle:
          'Maximum frequency is set by the slowest register-to-register path, and every one of its three components counts.',
        hints: ['What must happen between one clock edge and the next?', 'Setup is a requirement before the edge, not after.'],
      },
    };
  },
};

export const counterModulo: Generator = {
  id: 'ee2320.sequential.counter',
  title: 'Counter modulus and flip-flop count',
  kcRefs: [
    { kc: 'ee2320.counters', weight: 0.7 },
    { kc: 'ee2320.registers', weight: 0.3 },
  ],
  difficultyB: 0.5,
  generate(rng: Rng) {
    const askBits = rng() < 0.5;
    const modulus = pick(rng, [5, 6, 9, 10, 12, 20, 24, 60]);
    const bits = Math.ceil(Math.log2(modulus));

    const value = askBits ? bits : 2 ** bits;

    return {
      type: 'numeric' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [
        modulus <= 10 ? -1 : 1,
        askBits ? -0.6 : 0.6,
      ]),
      stem: askBits
        ? `How many flip-flops are needed for a modulo-${modulus} counter?`
        : `A modulo-${modulus} counter is built from the minimum number of flip-flops. How many distinct states could those flip-flops represent if unconstrained?`,
      answer: { kind: 'numeric' as const, value, unit: '', tolerance: { abs: 0.01 } },
      options: [],
      misconceptionTraps: separatedTraps(value, { abs: 0.01 }, [
        {
          misconception: 'counters.modulus-equals-flip-flops',
          value: modulus,
          tolerance: { abs: 0.01 },
          feedback:
            `That is the modulus itself. $n$ flip-flops hold $2^n$ states, so counting to ${modulus} needs ` +
            `$\\lceil \\log_2 ${modulus} \\rceil = ${bits}$ of them, not ${modulus}.`,
        },
        {
          misconception: 'counters.ceiling-not-applied',
          value: askBits ? Math.floor(Math.log2(modulus)) : 2 ** Math.floor(Math.log2(modulus)),
          tolerance: { abs: 0.01 },
          feedback:
            `You rounded down. $2^{${Math.floor(Math.log2(modulus))}} = ${2 ** Math.floor(Math.log2(modulus))}$ states is not enough for ${modulus}, so round **up**.`,
        },
      ]),
      explanation: {
        steps: [
          `$n$ flip-flops give $2^n$ states.`,
          `$2^{${bits - 1}} = ${2 ** (bits - 1)} < ${modulus} \\le 2^{${bits}} = ${2 ** bits}$.`,
          askBits
            ? `So ${bits} flip-flops are needed, and ${2 ** bits - modulus} states go unused.`
            : `So those ${bits} flip-flops span ${2 ** bits} states.`,
        ],
        principle:
          'State count is exponential in flip-flop count, and a modulus that is not a power of two always leaves unused states to be handled.',
        hints: ['How many states does each extra flip-flop add?', 'Round up, never down.'],
      },
    };
  },
};

export const stateMachineNext: Generator = {
  id: 'ee2320.sequential.state-machine',
  title: 'State machine next state',
  kcRefs: [
    { kc: 'ee2320.state-diagrams', weight: 0.6 },
    { kc: 'ee2320.fsm-design', weight: 0.4 },
  ],
  difficultyB: 0.9,
  generate(rng: Rng) {
    // A three-state sequence detector, described by its transition table.
    const states = ['S0', 'S1', 'S2'];
    const target = pick(rng, ['110', '101', '011'] as const);

    // Transitions for a Moore detector of `target`, built from the pattern so
    // the stem and the key cannot diverge.
    const next = (state: number, input: number): number => {
      const seen = states.length;
      const bit = String(input);
      if (bit === target[state]) return Math.min(state + 1, seen - 1);
      return bit === target[0] ? 1 : 0;
    };

    const startState = intBetween(rng, 0, 2);
    const inputBits = Array.from({ length: 3 }, () => intBetween(rng, 0, 1));

    let current = startState;
    const trace: number[] = [current];
    for (const bit of inputBits) {
      current = next(current, bit);
      trace.push(current);
    }

    const value = current;

    return {
      type: 'multiple-choice' as const,
      kcRefs: this.kcRefs,
      difficultyB: adjustDifficulty(this.difficultyB, [startState === 0 ? -0.4 : 0.4]),
      stem:
        `A Moore machine detects the pattern **${target}** and has states ${states.join(', ')}, where ` +
        `$S_k$ means "the first $k$ bits of the pattern have just been seen".\n\n` +
        `Starting in $${states[startState]}$, the input sequence ${inputBits.join('')} arrives. ` +
        `Which state is the machine in afterwards?`,
      answer: { kind: 'choice' as const, correctId: ['a', 'b', 'c'][value]! },
      options: states.map((name, index) => ({
        id: ['a', 'b', 'c'][index]!,
        text: `$${name}$`,
        ...(index === value ? {} : { misconception: 'fsm.transition-traced-incorrectly' }),
        rationale:
          index === value
            ? `Trace: ${trace.map((s) => states[s]).join(' → ')}.`
            : 'Follow one input bit at a time and write the state down after each.',
      })),
      misconceptionTraps: [],
      explanation: {
        steps: [
          `Apply one input bit at a time, reading the transition for the current state.`,
          `A mismatched bit does not always return to $S_0$ — if it could itself start the pattern, the machine goes to $S_1$.`,
          `Trace: ${trace.map((s) => states[s]).join(' → ')}, ending in $${states[value]}$.`,
        ],
        principle:
          'The subtlety in a sequence detector is the failure transition: a mismatch may still be the start of the next match, and assuming a reset to S0 is the standard bug.',
        hints: ['Process the bits one at a time.', 'On a mismatch, could that bit begin the pattern?'],
      },
    };
  },
};

export const EE2320_SEQUENTIAL_GENERATORS: readonly Generator[] = [
  latchBehaviour,
  flipFlopNextState,
  flipFlopTiming,
  counterModulo,
  stateMachineNext,
];
