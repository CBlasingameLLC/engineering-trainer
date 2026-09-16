import { z } from 'zod';

/**
 * The content-pack contract.
 *
 * Every producer emits this shape: parameterized generators, scheduled Claude
 * Routines, LLM batches, hand-authored conceptual items, and book imports. One
 * schema means the pipelines compose instead of competing, and — critically —
 * one verification gate covers all of them. An item whose stated answer cannot
 * be independently reproduced never reaches the bank, whoever wrote it.
 */

export const COMPETENCIES = [
  'math-execution', 'concept', 'modeling', 'strategy', 'numeracy', 'visual',
] as const;

export const DOMAINS = [
  'math', 'physics', 'circuits', 'digital', 'signals', 'devices', 'em', 'programming',
] as const;

const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'must be lowercase dot/dash separated, e.g. "ee2300.thevenin"');

export const kcRefSchema = z.object({
  kc: slug,
  /** Share of this item attributable to the KC. Weights across an item sum to 1. */
  weight: z.number().gt(0).max(1),
});

/**
 * Where an item came from, and whether it may be redistributed.
 *
 * `licenseTier` is load-bearing for the commercial path. Anything derived from
 * a third-party textbook is tagged `personal-only`, lives in a gitignored pack
 * directory, and is excluded from release builds by the pack builder.
 */
export const provenanceSchema = z.object({
  producer: z.enum(['generator', 'claude-routine', 'llm-batch', 'hand', 'book']),
  /** Generator id, routine name, or a citation. Never a verbatim copy of source text. */
  sourceRef: z.string().min(1),
  licenseTier: z.enum(['redistributable', 'personal-only']),
  createdAt: z.string().datetime().optional(),
  /** Set by `pack verify` once the stated answer was independently reproduced. */
  verifiedAt: z.string().datetime().optional(),
});

/** A numeric answer carries a unit and a tolerance; engineering answers are not exact. */
export const numericAnswerSchema = z.object({
  kind: z.literal('numeric'),
  value: z.number().finite(),
  /** e.g. "V", "kohm", "mA". Parsed by mathjs; "" means dimensionless. */
  unit: z.string(),
  tolerance: z
    .object({ rel: z.number().positive().optional(), abs: z.number().positive().optional() })
    .refine((t) => t.rel !== undefined || t.abs !== undefined, 'specify rel or abs tolerance'),
});

/**
 * A relationship the stated symbolic answer must satisfy, checkable without
 * trusting the author.
 *
 * Symbolic items have a verification problem the numeric ones do not. The
 * self-consistency check feeds an item's own answer through the grader, which
 * for a symbolic answer compares the stored expression against itself and
 * therefore always passes; explanation-agreement only inspects numeric answer
 * keys. That leaves regeneration as the only real gate, and regeneration proves
 * a generator is deterministic, not that its calculus is right.
 *
 * Declaring the relationship closes it. An antiderivative can be differentiated
 * back, a derivative can be compared against a central difference of the
 * function it came from, and a claimed ODE solution can be substituted into the
 * equation to see whether the residual vanishes. Each is an independent
 * re-derivation by a different method than the one that produced the answer,
 * which is what makes it worth running — the calculus analogue of checking the
 * MNA solver against ngspice.
 */
export const symbolicResidualSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('derivative-of'),
    /** The function that was differentiated; the answer must equal its derivative. */
    expression: z.string().min(1),
    variable: z.string().min(1),
  }),
  z.object({
    kind: z.literal('antiderivative-of'),
    /** The integrand; the derivative of the answer must equal it. */
    expression: z.string().min(1),
    variable: z.string().min(1),
  }),
  z.object({
    kind: z.literal('ode-solution'),
    /**
     * Coefficients of `second*y'' + first*y' + zeroth*y = forcing`, each an
     * expression in `variable`. Constant coefficients are the common case, but
     * allowing expressions covers variable-coefficient equations for free.
     */
    variable: z.string().min(1),
    second: z.string().min(1).default('0'),
    first: z.string().min(1),
    zeroth: z.string().min(1),
    forcing: z.string().min(1).default('0'),
    /** Initial conditions the particular solution must also meet. */
    initial: z
      .array(z.object({ at: z.number().finite(), order: z.number().int().min(0).max(2), value: z.number().finite() }))
      .default([]),
  }),
]);

/** A symbolic answer is checked by sampling, not string comparison. */
export const symbolicAnswerSchema = z.object({
  kind: z.literal('symbolic'),
  /** Canonical expression, e.g. "V_s * R_2 / (R_1 + R_2)". */
  expression: z.string().min(1),
  variables: z.array(z.string().min(1)).min(1),
  /** Sampling domain per variable, so equivalence is tested where the expression is defined. */
  domain: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
  /**
   * How `pack verify` re-derives this answer independently. Optional because
   * not every symbolic answer is the result of a calculus operation - a closed
   * form for a divider ratio is just an expression - but a generator that can
   * supply one should, and `verify --strict` reports the ones that do not.
   */
  residual: symbolicResidualSchema.optional(),
});

export const choiceAnswerSchema = z.object({
  kind: z.literal('choice'),
  correctId: z.string().min(1),
});

export const truthTableAnswerSchema = z.object({
  kind: z.literal('truth-table'),
  inputs: z.array(z.string().min(1)).min(1).max(6),
  /** Output rows in ascending binary order of the input vector. */
  rows: z.array(z.boolean()).min(2),
});

/**
 * A circuit the learner must build to spec, graded by simulation rather than by
 * comparing netlists — there are many correct designs.
 *
 * `reference` is one deck that satisfies the spec. It is not the answer key —
 * there is no single answer — but it is what makes the item verifiable: an
 * unsatisfiable design task is the circuit equivalent of a wrong answer key,
 * and without a worked example nothing can detect one. `pack verify` grades the
 * reference against the measurements and rejects the item if it fails.
 */
export const circuitAnswerSchema = z.object({
  kind: z.literal('circuit'),
  /** A SPICE deck demonstrating the spec is achievable. Required. */
  reference: z.string().min(1),
  /** Nodes the learner's design must expose, e.g. ["in", "out"]. */
  requiredNodes: z.array(z.string().min(1)).default([]),
  measurements: z
    .array(
      z.object({
        /** Measurement expression, e.g. "v(out)", "i(v1)", "db(v(out))". */
        probe: z.string().min(1),
        analysis: z.enum(['op', 'dc', 'ac', 'tran']),
        expected: z.number().finite(),
        unit: z.string(),
        tolerance: z.object({ rel: z.number().positive().optional(), abs: z.number().positive().optional() }),
        /** Required for `ac`: a gain specification means nothing without a frequency. */
        frequencyHz: z.number().positive().optional(),
        /** Required for `tran`: likewise, a transient value needs an instant. */
        atTime: z.number().positive().optional(),
      }),
    )
    .min(1),
});

export const answerSchema = z.discriminatedUnion('kind', [
  numericAnswerSchema,
  symbolicAnswerSchema,
  choiceAnswerSchema,
  truthTableAnswerSchema,
  circuitAnswerSchema,
]);

/**
 * One selectable option on a multiple-choice item.
 *
 * Tagging wrong options with the misconception that produces them is what turns
 * a wrong answer into a diagnosis. An untagged option says only that the
 * learner missed the item; a tagged one says they suppressed the wrong source,
 * or dropped a sign in the KVL loop — and that is what targeted drills are
 * built from.
 */
export const optionSchema = z.object({
  id: z.string().min(1),
  /** Rendered choice text (KaTeX permitted). */
  text: z.string().min(1),
  /** Omitted on the correct option; set on every distractor worth diagnosing. */
  misconception: slug.optional(),
  /** Shown after answering: why this looks right and where it goes wrong. */
  rationale: z.string().optional(),
});

/**
 * A known wrong value for a free-response item, with the error that produces it.
 *
 * Multiple choice gets misconception diagnosis for free, because the learner
 * picks from a tagged list. Free response would otherwise lose it entirely —
 * yet that is where the richest evidence is, since the learner had to commit to
 * a number nobody offered them. Matching a typed answer against these traps
 * recovers it: "you entered 6.67 V, which is what you get if you leave the
 * current source in place while finding the Thevenin resistance."
 */
export const misconceptionTrapSchema = z
  .object({
    misconception: slug,
    /** The wrong value this error produces, in the same unit as the answer. */
    value: z.number().finite().optional(),
    /**
     * The wrong *expression* this error produces, for symbolic items.
     *
     * A calculus error does not land on a number, it lands on a form:
     * differentiating `sin(3x)` without the chain rule gives `cos(3x)`, and
     * that is a diagnosis rather than just a miss. Matching it uses the same
     * sampling equivalence that grades the item, so a learner who writes an
     * algebraically different spelling of the same mistake is still diagnosed.
     */
    expression: z.string().min(1).optional(),
    tolerance: z
      .object({ rel: z.number().positive().optional(), abs: z.number().positive().optional() })
      .refine((t) => t.rel !== undefined || t.abs !== undefined, 'specify rel or abs tolerance')
      .optional(),
    /** Shown when the learner lands on it. */
    feedback: z.string().min(1),
  })
  .superRefine((trap, ctx) => {
    const hasValue = trap.value !== undefined;
    const hasExpression = trap.expression !== undefined;
    if (hasValue === hasExpression) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'a trap sets exactly one of `value` (numeric items) or `expression` (symbolic items)',
      });
    }
    if (hasValue && trap.tolerance === undefined) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['tolerance'],
        message: 'a numeric trap needs a tolerance, or it can never match',
      });
    }
  });

export const explanationSchema = z.object({
  /** Worked solution, one step per entry. KaTeX permitted. */
  steps: z.array(z.string().min(1)).min(1),
  /** The transferable idea, stated in one line. */
  principle: z.string().min(1),
  /** Progressive hints, cheapest first. Using one downgrades the FSRS grade. */
  hints: z.array(z.string().min(1)).default([]),
});

export const ITEM_TYPES = [
  'numeric', 'symbolic', 'multiple-choice', 'truth-table',
  'circuit-build', 'derivation-order', 'short-answer',
] as const;

export const itemSchema = z
  .object({
    id: slug,
    type: z.enum(ITEM_TYPES),
    kcRefs: z.array(kcRefSchema).min(1),
    /** Difficulty on the logit scale, same units as learner ability. */
    difficultyB: z.number().min(-4).max(4),
    /** Question text. KaTeX permitted. */
    stem: z.string().min(1),
    /** Generator seed, so a parameterized variant can be reproduced exactly. */
    seed: z.number().int().optional(),
    answer: answerSchema,
    /** Full choice list for multiple-choice items; empty otherwise. */
    options: z.array(optionSchema).default([]),
    /** Known wrong values for free-response items; empty otherwise. */
    misconceptionTraps: z.array(misconceptionTrapSchema).default([]),
    explanation: explanationSchema,
    /** Optional schematic payload for circuit items. */
    schematic: z.unknown().optional(),
    provenance: provenanceSchema,
  })
  .superRefine((item, ctx) => {
    const total = item.kcRefs.reduce((s, r) => s + r.weight, 0);
    if (Math.abs(total - 1) > 1e-6) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['kcRefs'],
        message: `KC weights must sum to 1, got ${total.toFixed(4)}`,
      });
    }

    const kcs = item.kcRefs.map((r) => r.kc);
    if (new Set(kcs).size !== kcs.length) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['kcRefs'], message: 'duplicate KC reference' });
    }

    // Multiple choice needs a real option list containing the stated answer.
    if (item.type === 'multiple-choice') {
      if (item.answer.kind !== 'choice') {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'multiple-choice items need a choice answer' });
      } else {
        // Bind locally: narrowing on `item.answer` is lost inside callbacks.
        const answer = item.answer;
        if (item.options.length < 2) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'multiple-choice items need at least two options' });
        }
        const ids = item.options.map((o) => o.id);
        if (new Set(ids).size !== ids.length) {
          ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'duplicate option id' });
        }
        if (!ids.includes(answer.correctId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['answer', 'correctId'],
            message: `correctId "${answer.correctId}" is not among the options`,
          });
        }
        // A tagged correct option would register a misconception on a right answer.
        const correct = item.options.find((o) => o.id === answer.correctId);
        if (correct?.misconception) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['options'],
            message: 'the correct option must not carry a misconception tag',
          });
        }
      }
    } else if (item.options.length > 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['options'], message: 'only multiple-choice items may define options' });
    }

    // A trap that overlaps the correct answer would diagnose a correct response
    // as an error, which is worse than having no trap at all.
    if (item.answer.kind === 'numeric') {
      for (const [i, trap] of item.misconceptionTraps.entries()) {
        // Expression traps belong to symbolic answers and carry no value to
        // compare; overlap for those is checked by sampling, not arithmetic.
        if (trap.value === undefined || trap.tolerance === undefined) continue;
        const tol = Math.max(
          trap.tolerance.abs ?? 0,
          (trap.tolerance.rel ?? 0) * Math.abs(trap.value),
        );
        if (Math.abs(trap.value - item.answer.value) <= tol) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['misconceptionTraps', i],
            message: `trap value ${trap.value} is indistinguishable from the correct answer ${item.answer.value}`,
          });
        }
      }
    }

    if (item.type === 'truth-table' && item.answer.kind === 'truth-table') {
      const expected = 2 ** item.answer.inputs.length;
      if (item.answer.rows.length !== expected) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['answer', 'rows'],
          message: `expected ${expected} rows for ${item.answer.inputs.length} inputs, got ${item.answer.rows.length}`,
        });
      }
    }

    if (item.type === 'circuit-build' && item.answer.kind !== 'circuit') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'circuit-build items need a circuit answer' });
    }

    // An AC measurement without a frequency, or a transient one without a time,
    // cannot be evaluated at all - the grader would have to report the item as
    // broken to the learner, which is the worst place to discover it.
    if (item.answer.kind === 'circuit') {
      for (const [i, m] of item.answer.measurements.entries()) {
        if (m.analysis === 'ac' && m.frequencyHz === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['answer', 'measurements', i, 'frequencyHz'],
            message: 'an ac measurement must state its frequency',
          });
        }
        if (m.analysis === 'tran' && m.atTime === undefined) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['answer', 'measurements', i, 'atTime'],
            message: 'a tran measurement must state the time it is taken at',
          });
        }
      }
    }
  });

export type KcRefInput = z.infer<typeof kcRefSchema>;
export type Provenance = z.infer<typeof provenanceSchema>;
export type Answer = z.infer<typeof answerSchema>;
export type NumericAnswer = z.infer<typeof numericAnswerSchema>;
export type SymbolicAnswer = z.infer<typeof symbolicAnswerSchema>;
export type SymbolicResidual = z.infer<typeof symbolicResidualSchema>;
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export type TruthTableAnswer = z.infer<typeof truthTableAnswerSchema>;
export type CircuitAnswer = z.infer<typeof circuitAnswerSchema>;
export type Option = z.infer<typeof optionSchema>;
export type MisconceptionTrap = z.infer<typeof misconceptionTrapSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
export type Item = z.infer<typeof itemSchema>;
export type ItemType = (typeof ITEM_TYPES)[number];
