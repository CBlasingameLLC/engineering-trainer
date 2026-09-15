import type { KcId } from '../types.js';
import type { KcMastery } from '../mastery/composite.js';

/**
 * Credential recommendation.
 *
 * Ranks against the learner's *measured* gaps rather than against a generic
 * profile, and keeps signal and learning value as separate axes so the ranking
 * can be honest about the common case where they diverge: a 300-hour web
 * certificate that teaches real skills and moves no recruiter, next to a
 * two-hour vendor module that teaches little and clears a checkbox.
 *
 * The scoring deliberately divides by effort. Time is the binding constraint
 * for a full-time student, so a credential that takes thirty times as long has
 * to be worth thirty times as much, and most are not.
 */

export type CareerTrack =
  | 'semiconductor-vlsi'
  | 'analog-mixed-signal'
  | 'embedded-firmware'
  | 'power-energy'
  | 'rf-communications'
  | 'signal-processing'
  | 'ai-hardware'
  | 'general-engineering';

export interface CredentialInput {
  id: string;
  name: string;
  provider: string;
  effortHours: number;
  signalStrength: number;
  learningValue: number;
  tracks: { track: CareerTrack; relevance: number }[];
  reinforcesKcs: KcId[];
  assumesKcs: KcId[];
  cost: { tier: 'free' | 'free-for-students' | 'discounted-for-students' | 'paid'; usd?: number };
}

export interface RankOptions {
  /** The learner's chosen direction; drives the relevance term. */
  track: CareerTrack;
  /** Current mastery, keyed by KC. Drives the gap-fill term. */
  mastery: ReadonlyMap<KcId, KcMastery>;
  /** Exclude anything that costs money outright. */
  freeOnly?: boolean;
  /** Hours the learner actually has. Credentials beyond it are flagged, not hidden. */
  budgetHours?: number;
}

export interface RankedCredential {
  credential: CredentialInput;
  score: number;
  /** Track relevance, 0-1. */
  relevance: number;
  /** How much of what it reinforces is currently weak, 0-1. */
  gapFill: number;
  /** Whether its assumed prerequisites are in place. */
  readiness: 'ready' | 'stretch' | 'premature';
  /** Exceeds the stated hour budget. */
  overBudget: boolean;
  /** Plain-language reason this landed where it did. */
  rationale: string;
}

const MASTERY_FLOOR = 0.65;

/**
 * How much a credential would shore up currently weak material.
 *
 * Averaged over the KCs it touches, so a credential reinforcing one weak topic
 * does not outrank one reinforcing four. Credentials that reinforce nothing
 * measurable get a neutral value rather than zero — plenty are worth doing for
 * reasons the mastery model cannot see.
 */
export function gapFillValue(
  credential: CredentialInput,
  mastery: ReadonlyMap<KcId, KcMastery>,
): number {
  const measured = credential.reinforcesKcs
    .map((kc) => mastery.get(kc))
    .filter((m): m is KcMastery => m !== undefined && m.attempts > 0);

  if (measured.length === 0) return 0.5; // nothing measured; neither reward nor punish

  const deficit =
    measured.reduce((sum, m) => sum + Math.max(0, MASTERY_FLOOR - m.composite), 0) / measured.length;
  return Math.min(1, 0.5 + deficit / MASTERY_FLOOR);
}

/**
 * Whether the learner is ready to start.
 *
 * Recommending CUDA to someone who has not finished their first programming
 * course wastes the one resource the ranking is trying to protect.
 */
export function readinessFor(
  credential: CredentialInput,
  mastery: ReadonlyMap<KcId, KcMastery>,
): RankedCredential['readiness'] {
  const assumed = credential.assumesKcs
    .map((kc) => mastery.get(kc))
    .filter((m): m is KcMastery => m !== undefined && m.attempts > 0);

  if (assumed.length === 0) return 'ready';
  const weakest = Math.min(...assumed.map((m) => m.composite));
  if (weakest >= MASTERY_FLOOR) return 'ready';
  if (weakest >= 0.4) return 'stretch';
  return 'premature';
}

/**
 * Relevance of a credential to a track.
 *
 * `general-engineering` is a floor under every track rather than a track of its
 * own — that is what "general" means. Without this, a credential tagged only as
 * generally useful scores exactly zero against any specific track and vanishes
 * from the ranking, which is how MATLAB Onramp came to be rated as irrelevant
 * to a semiconductor student. It is discounted against an exact match, because
 * on-track material should still win.
 */
const GENERAL_DISCOUNT = 0.7;

const relevanceFor = (credential: CredentialInput, track: CareerTrack): number => {
  const exact = credential.tracks.find((t) => t.track === track)?.relevance ?? 0;
  if (track === 'general-engineering') return exact;

  const general = credential.tracks.find((t) => t.track === 'general-engineering')?.relevance ?? 0;
  return Math.max(exact, general * GENERAL_DISCOUNT);
};

/** Effort discount. Square-root so long programmes are penalised but not erased. */
const effortPenalty = (hours: number): number => Math.sqrt(Math.max(hours, 1));

function rationaleFor(
  credential: CredentialInput,
  relevance: number,
  gapFill: number,
  readiness: RankedCredential['readiness'],
): string {
  const parts: string[] = [];

  if (relevance >= 0.85) parts.push('squarely on your track');
  else if (relevance >= 0.5) parts.push('partly relevant to your track');
  else parts.push('largely off-track');

  if (credential.signalStrength >= 0.7) parts.push('carries real weight with employers');
  else if (credential.signalStrength <= 0.3) parts.push('adds little to a resume');

  if (gapFill >= 0.75) parts.push('targets material you are currently weak on');

  if (credential.effortHours >= 100) {
    parts.push(`but costs ${credential.effortHours} hours`);
  } else if (credential.effortHours <= 5) {
    parts.push(`and takes only ${credential.effortHours} hours`);
  }

  if (readiness === 'premature') parts.push('— prerequisites not yet in place');
  else if (readiness === 'stretch') parts.push('— a stretch at your current level');

  return parts.join(', ').replace(/, —/g, ' —');
}

export function rankCredentials(
  credentials: readonly CredentialInput[],
  options: RankOptions,
): RankedCredential[] {
  const eligible = options.freeOnly
    ? credentials.filter((c) => c.cost.tier === 'free' || c.cost.tier === 'free-for-students')
    : credentials;

  return eligible
    .map((credential) => {
      const relevance = relevanceFor(credential, options.track);
      const gapFill = gapFillValue(credential, options.mastery);
      const readiness = readinessFor(credential, options.mastery);

      // Value is the better of what it signals and what it teaches, not their
      // average: a credential that is outstanding on either axis is worth
      // doing, and averaging would bury both kinds under the mediocre middle.
      const value = Math.max(credential.signalStrength, credential.learningValue * 0.9);
      const readinessFactor = readiness === 'ready' ? 1 : readiness === 'stretch' ? 0.7 : 0.35;

      const score = (relevance * value * gapFill * readinessFactor * 10) / effortPenalty(credential.effortHours);

      return {
        credential,
        score,
        relevance,
        gapFill,
        readiness,
        overBudget: options.budgetHours !== undefined && credential.effortHours > options.budgetHours,
        rationale: rationaleFor(credential, relevance, gapFill, readiness),
      };
    })
    .sort((a, b) => b.score - a.score || a.credential.id.localeCompare(b.credential.id));
}

/**
 * The subset worth doing first: high score, ready to start, and inside budget.
 * Kept short on purpose — a list of twenty recommendations is not a plan.
 */
export const shortlist = (ranked: readonly RankedCredential[], limit = 5): RankedCredential[] =>
  ranked.filter((r) => r.readiness === 'ready' && !r.overBudget).slice(0, limit);
