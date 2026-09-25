import { z } from 'zod';
import { figureSchema, measurementSchema } from './figure.js';

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

/**
 * A Boolean expression, graded by exhaustive truth-table comparison.
 *
 * Separate from `symbolic` because the domain is finite. Symbolic equivalence
 * over the reals is settled by sampling and is therefore a very strong
 * inference; Boolean equivalence over `n` variables enumerates all `2^n`
 * assignments and is a proof. For a course whose subject *is* when two
 * expressions are equal, grading by inference would be the wrong tool.
 *
 * `variables` is stored rather than inferred, because a correct answer may
 * legitimately use fewer: `AB + AB'` reduces to `A`, and comparing over the
 * variables that survive would call the right answer wrong.
 */
export const booleanAnswerSchema = z.object({
  kind: z.literal('boolean'),
  /** A correct expression. Any equivalent form is accepted. */
  expression: z.string().min(1),
  /** Variables the truth table ranges over, most significant first. */
  variables: z.array(z.string().min(1)).min(1).max(6),
  /**
   * Literal budget for "simplify" questions.
   *
   * Without it a minimisation task grades its own input as correct — the
   * unsimplified expression is, after all, equivalent to itself. Setting a
   * budget is what turns "is this the same function" into "is this the same
   * function *and* actually reduced".
   */
  maxLiterals: z.number().int().positive().optional(),
});

export const choiceAnswerSchema = z.object({
  kind: z.literal('choice'),
  correctId: z.string().min(1),
});

export const truthTableAnswerSchema = z.object({
  kind: z.literal('truth-table'),
  inputs: z.array(z.string().min(1)).min(1).max(6),
  /** Column heading for the output, e.g. "F" or "Q(next)". */
  output: z.string().min(1).default('F'),
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
  measurements: z.array(measurementSchema).min(1),
});

/**
 * A complex-valued answer: a phasor, an impedance, a transfer function at a
 * frequency.
 *
 * Stored in rectangular form because that is canonical — polar carries an
 * ambiguity at the wrap point and another at zero magnitude — but graded in
 * polar, because that is the form the error lives in. A learner who computes
 * the right magnitude and puts the phase the wrong way round has made one
 * specific, nameable mistake, and a rectangular comparison would report it as
 * simply wrong.
 *
 * Tolerance is therefore two-part and the parts are not interchangeable: a
 * relative one on magnitude, an absolute one on angle in degrees. Five percent
 * of an angle means nothing — five percent of 2 degrees and five percent of
 * 170 degrees are different demands on the same answer.
 */
export const complexAnswerSchema = z.object({
  kind: z.literal('complex'),
  real: z.number().finite(),
  imag: z.number().finite(),
  /** e.g. "V", "A", "ohm". "" means dimensionless, as for a transfer function. */
  unit: z.string(),
  tolerance: z
    .object({
      magRel: z.number().positive().optional(),
      magAbs: z.number().positive().optional(),
      /** Absolute, in degrees. Compared with wrapping, so +179 and -179 are 2 apart. */
      angleDeg: z.number().positive().optional(),
    })
    .refine(
      (t) => (t.magRel !== undefined || t.magAbs !== undefined) && t.angleDeg !== undefined,
      'specify a magnitude tolerance and an angle tolerance',
    ),
});

/**
 * Three answer kinds for proof, which the engine previously could not grade at
 * all.
 *
 * MATH 2358 is assessed almost entirely by writing proofs — its weekly quizzes
 * ask for an induction, an irrationality argument, a conjecture formulated and
 * then proved — and the bank's response to that was eight multiple-choice
 * items asking which strategy "is the natural first choice". That measures
 * recognising a proof's shape, which is a real thing and is not the thing the
 * course examines. No number of further such items would have closed the gap,
 * because the gap is in the answer kinds.
 *
 * The three below trade off the same way any assessment does. Ordering and
 * skeleton are deterministically gradeable and so produce hard evidence, at
 * the cost of supplying scaffolding the real exam does not. The rubric kind
 * removes the scaffolding and accepts softer evidence in exchange, which is
 * why rubric items are authored with a reduced `kcRefs` weight: that weight
 * already scales both the Elo update and the BKT blend, so a self-scored
 * attempt moves the model less than a graded one without any special case in
 * the mastery code.
 */

/** Arrange shuffled lines into a valid proof. */
export const orderingAnswerSchema = z.object({
  kind: z.literal('ordering'),
  /** The lines, stored in their correct order. */
  lines: z.array(z.object({ id: slug, text: z.string().min(1) })).min(3).max(12),
  /**
   * Lines that belong to no correct proof of this claim. Including one is the
   * interesting failure — assuming what is to be proved, or appealing to the
   * inductive hypothesis at n + 1 rather than at n — so each names the
   * misconception it encodes.
   */
  distractors: z
    .array(z.object({ id: slug, text: z.string().min(1), misconception: z.string().min(1) }))
    .default([]),
});

/** A proof broken into separately graded parts. */
export const proofSkeletonAnswerSchema = z.object({
  kind: z.literal('proof-skeleton'),
  steps: z
    .array(
      z.object({
        id: slug,
        /** What this step asks for, e.g. "State the inductive hypothesis". */
        prompt: z.string().min(1),
        expect: z.discriminatedUnion('kind', [
          z.object({
            kind: z.literal('expression'),
            /** Graded by the symbolic sampler, so any equivalent form passes. */
            expression: z.string().min(1),
            variables: z.array(z.string().min(1)).min(1),
            domain: z.record(z.string(), z.tuple([z.number(), z.number()])).optional(),
          }),
          z.object({
            kind: z.literal('choice'),
            correctId: z.string().min(1),
            options: z
              .array(z.object({ id: slug, text: z.string().min(1), misconception: z.string().optional() }))
              .min(2)
              .max(5),
          }),
        ]),
      }),
    )
    .min(2)
    .max(6),
});

/** A written proof, scored by the learner against a published rubric. */
export const proofRubricAnswerSchema = z.object({
  kind: z.literal('proof-rubric'),
  /** Shown only after submitting, so it cannot be copied into the answer. */
  model: z.string().min(1),
  criteria: z
    .array(z.object({ id: slug, text: z.string().min(1), weight: z.number().positive().default(1) }))
    .min(2)
    .max(8),
  /** Weighted fraction of criteria needed for the attempt to count as correct. */
  passingScore: z.number().min(0).max(1).default(0.75),
});

export const answerSchema = z.discriminatedUnion('kind', [
  numericAnswerSchema,
  symbolicAnswerSchema,
  booleanAnswerSchema,
  choiceAnswerSchema,
  truthTableAnswerSchema,
  circuitAnswerSchema,
  complexAnswerSchema,
  orderingAnswerSchema,
  proofSkeletonAnswerSchema,
  proofRubricAnswerSchema,
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
    /**
     * Known wrong phasor. The classic errors here are not wrong numbers but
     * wrong *forms* of the right number: the angle in radians, the conjugate,
     * the reciprocal of the impedance. Each is a diagnosis; together they are
     * most of what goes wrong in an AC course.
     */
    complex: z.object({ real: z.number().finite(), imag: z.number().finite() }).optional(),
    tolerance: z
      .object({ rel: z.number().positive().optional(), abs: z.number().positive().optional() })
      .refine((t) => t.rel !== undefined || t.abs !== undefined, 'specify rel or abs tolerance')
      .optional(),
    /** Shown when the learner lands on it. */
    feedback: z.string().min(1),
  })
  .superRefine((trap, ctx) => {
    const forms = [trap.value !== undefined, trap.expression !== undefined, trap.complex !== undefined];
    if (forms.filter(Boolean).length !== 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          'a trap sets exactly one of `value` (numeric), `expression` (symbolic) or `complex` (phasor)',
      });
    }
    const hasValue = trap.value !== undefined;
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
  'numeric', 'symbolic', 'boolean', 'multiple-choice', 'truth-table',
  'circuit-build', 'derivation-order', 'short-answer', 'phasor',
  'proof-skeleton', 'proof-rubric',
] as const;

export const itemSchema = z
  .object({
    id: slug,
    type: z.enum(ITEM_TYPES),
    kcRefs: z.array(kcRefSchema).min(1),
    /** Difficulty on the logit scale, same units as learner ability. */
    difficultyB: z.number().min(-4).max(4),
    /**
     * How far an attempt on this item may move the mastery model, 0 to 1.
     *
     * Absent means one, which is everything that is graded. Below one only
     * where the grade is self-reported, which today means `proof-rubric`
     * items: they ask for the real task and accept the learner's own scoring
     * of it, so they should register without being able to certify mastery on
     * their own.
     *
     * Optional rather than defaulted so the field appears only on the items
     * that actually carry it — a default would write `evidenceWeight: 1` into
     * all 2862 items in the bank and make every future diff noisier for no
     * information.
     */
    evidenceWeight: z.number().gt(0).max(1).optional(),
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
    /**
     * Drawn circuit accompanying the question.
     *
     * Emitted by the generator from the same parameters that produce the
     * answer, so the drawing and the answer cannot disagree by construction —
     * and `pack verify` simulates it to prove they do not.
     */
    figure: figureSchema.optional(),
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

    if (item.type === 'derivation-order' && item.answer.kind !== 'ordering') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'derivation-order items need an ordering answer' });
    }
    if (item.type === 'proof-skeleton' && item.answer.kind !== 'proof-skeleton') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'proof-skeleton items need a proof-skeleton answer' });
    }
    if (item.type === 'proof-rubric' && item.answer.kind !== 'proof-rubric') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer'], message: 'proof-rubric items need a proof-rubric answer' });
    }

    // Line ids must be unique across the lines and the distractors, or a
    // submitted order cannot be read back unambiguously.
    if (item.answer.kind === 'ordering') {
      const ids = [...item.answer.lines, ...item.answer.distractors].map((l) => l.id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['answer', 'lines'], message: 'line and distractor ids must be unique' });
      }
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
export type OrderingAnswer = z.infer<typeof orderingAnswerSchema>;
export type ProofSkeletonAnswer = z.infer<typeof proofSkeletonAnswerSchema>;
export type ProofRubricAnswer = z.infer<typeof proofRubricAnswerSchema>;
export type NumericAnswer = z.infer<typeof numericAnswerSchema>;
export type SymbolicAnswer = z.infer<typeof symbolicAnswerSchema>;
export type ComplexAnswer = z.infer<typeof complexAnswerSchema>;
export type BooleanAnswer = z.infer<typeof booleanAnswerSchema>;
export type SymbolicResidual = z.infer<typeof symbolicResidualSchema>;
export type ChoiceAnswer = z.infer<typeof choiceAnswerSchema>;
export type TruthTableAnswer = z.infer<typeof truthTableAnswerSchema>;
export type CircuitAnswer = z.infer<typeof circuitAnswerSchema>;
export type Option = z.infer<typeof optionSchema>;
export type MisconceptionTrap = z.infer<typeof misconceptionTrapSchema>;
export type Explanation = z.infer<typeof explanationSchema>;
export type Item = z.infer<typeof itemSchema>;
export type ItemType = (typeof ITEM_TYPES)[number];
