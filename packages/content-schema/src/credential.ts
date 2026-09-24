import { z } from 'zod';

/**
 * Extracurricular credentials.
 *
 * The catalog exists to answer one question honestly: given limited hours and a
 * specific degree track, what is actually worth doing? That requires recording
 * what a credential signals to an employer *separately* from what it teaches,
 * because the two diverge sharply. A 300-hour web-development certificate
 * teaches real skills and signals almost nothing to a semiconductor recruiter;
 * a two-hour MATLAB module teaches little and clears a box that a great many
 * engineering job descriptions still list.
 *
 * Every entry carries a `checkedOn` date. Credential programmes change their
 * pricing, retire exams and withdraw student offers constantly, so an entry
 * without a date is a claim nobody has stood behind.
 */

const slug = z
  .string()
  .min(1)
  .regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/, 'lowercase dot/dash separated slug');

/** Career directions within electrical engineering that a credential can serve. */
export const CAREER_TRACKS = [
  'semiconductor-vlsi',
  'analog-mixed-signal',
  'embedded-firmware',
  'power-energy',
  'rf-communications',
  'signal-processing',
  'ai-hardware',
  'general-engineering',
] as const;
export type CareerTrack = (typeof CAREER_TRACKS)[number];

/**
 * What it actually costs the learner.
 *
 * `free-for-students` is kept distinct from `free` because student offers
 * expire, get withdrawn, and frequently break — see the GitHub Foundations
 * voucher entry. Collapsing the two would hide a real risk.
 */
export const COST_TIERS = ['free', 'free-for-students', 'discounted-for-students', 'paid'] as const;
export type CostTier = (typeof COST_TIERS)[number];

/**
 * What the credential is, mechanically. A proctored exam and a
 * watch-the-videos completion certificate are not the same object and should
 * never rank as though they were.
 */
export const CREDENTIAL_KINDS = [
  'proctored-exam',
  'assessed-certificate',
  'completion-certificate',
  'course-only',
] as const;
export type CredentialKind = (typeof CREDENTIAL_KINDS)[number];

export const credentialSchema = z.object({
  id: slug,
  name: z.string().min(1),
  provider: z.string().min(1),
  url: z.string().url(),
  kind: z.enum(CREDENTIAL_KINDS),

  cost: z.object({
    tier: z.enum(COST_TIERS),
    /** List price in USD, before any student offer. */
    usd: z.number().min(0).optional(),
    /** How the free or reduced price is actually obtained, and what can go wrong. */
    note: z.string().optional(),
  }),

  /** Realistic hours to completion, not the marketing figure. */
  effortHours: z.number().positive(),

  /**
   * How much this moves a recruiter or interviewer for the stated tracks, 0-1.
   *
   * Deliberately separate from how much it teaches. Industry training from a
   * vendor whose parts you will actually use signals more than a generic
   * completion badge, whatever the hour count.
   */
  signalStrength: z.number().min(0).max(1),

  /** How much it genuinely teaches, 0-1. Ranked alongside signal, not merged. */
  learningValue: z.number().min(0).max(1),

  /** Tracks this serves, with a relevance weight each. */
  tracks: z.array(z.object({ track: z.enum(CAREER_TRACKS), relevance: z.number().min(0).max(1) })).min(1),

  /** Knowledge components it reinforces, so recommendations can target real gaps. */
  reinforcesKcs: z.array(slug).default([]),

  /** Knowledge components worth having before starting. */
  assumesKcs: z.array(slug).default([]),

  /** One line on why it signals what it signals. */
  why: z.string().min(1),

  /** The honest downside. Required — every credential has one. */
  caveat: z.string().min(1),

  /** When these facts were last checked against the provider. */
  checkedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ISO date'),
});

export type Credential = z.infer<typeof credentialSchema>;

export const credentialCatalogSchema = z.object({
  schemaVersion: z.literal('1.0.0'),
  title: z.string().min(1),
  credentials: z.array(credentialSchema).min(1),
});

export type CredentialCatalog = z.infer<typeof credentialCatalogSchema>;

export interface CatalogIssue {
  path: string;
  message: string;
}

export function parseCredentialCatalog(input: unknown): {
  catalog?: CredentialCatalog;
  issues: CatalogIssue[];
} {
  const result = credentialCatalogSchema.safeParse(input);
  if (!result.success) {
    return {
      issues: result.error.issues.map((i) => ({ path: i.path.join('.') || '(root)', message: i.message })),
    };
  }

  const issues: CatalogIssue[] = [];
  const seen = new Set<string>();
  for (const [index, credential] of result.data.credentials.entries()) {
    if (seen.has(credential.id)) {
      issues.push({ path: `credentials.${index}.id`, message: `duplicate credential id "${credential.id}"` });
    }
    seen.add(credential.id);
  }

  return issues.length > 0 ? { issues } : { catalog: result.data, issues: [] };
}
