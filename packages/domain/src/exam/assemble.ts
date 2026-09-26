import type { ItemId, KcId } from '../types.js';
import type { ExamBlueprint, ExamUnitRef } from './blueprint.js';

/**
 * Assembling a practice exam.
 *
 * This is deliberately *not* adaptive, and that is the whole distinction from
 * `cat/session.ts`. Adaptive selection maximises Fisher information by putting
 * every question near the learner's current ability, which is the right way to
 * *measure an ability* in the fewest items. An exam asks a different question —
 * "could you do this paper on Monday" — and the answer depends on the paper
 * being a fixed instrument. A CAT that quietly stops asking about chapter 12
 * because the first two answers were wrong has measured the learner accurately
 * and told them nothing about the exam.
 *
 * So the rules here are coverage rules:
 *
 * - Every unit in scope appears, or is named as having no content.
 * - Every knowledge component in a unit is asked before any is asked twice.
 * - Difficulty spans the available range rather than tracking ability.
 *
 * A scope entry with nothing behind it is reported rather than skipped. An
 * exam that silently omits a chapter because nobody has written items for it
 * is indistinguishable, from the inside, from an exam the learner passed.
 */

/** The minimum an item must expose to sit on a paper. */
export interface ExamCandidate {
  itemId: ItemId;
  /** Primary knowledge component — the one the item is filed under. */
  kcId: KcId;
  difficultyB: number;
}

export interface ExamCoverage {
  course: string;
  unit: string;
  /** Components in this unit that had any item at all. */
  kcsCovered: number;
  /** Components in this unit, whether or not anything was available. */
  kcsInScope: number;
  itemCount: number;
}

export interface ExamPaper {
  blueprint: ExamBlueprint;
  /** Items in the order they are served. */
  items: ExamCandidate[];
  coverage: ExamCoverage[];
  /** Scope entries that produced no items, so the paper cannot examine them. */
  unitsWithoutItems: ExamUnitRef[];
  /**
   * True when the paper is shorter than asked for because the bank ran out.
   * A 45-item request answered with 31 items is not a 45-item exam and the
   * result should not be read as one.
   */
  short: boolean;
}

export interface AssembleOptions {
  /** How many items the paper should hold. */
  size?: number;
  /** Items to prefer not to repeat. Fresh questions first, always. */
  attempted?: ReadonlySet<ItemId>;
  /** Varies the paper between sittings. The same seed gives the same paper. */
  seed?: number;
}

export const DEFAULT_EXAM_SIZE = 30;

/** xorshift32 — deterministic, tiny, and enough to shuffle a question order. */
function makeRng(seed: number): () => number {
  let state = (seed | 0) === 0 ? 0x9e3779b9 : seed | 0;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    return ((state >>> 0) % 0x100000000) / 0x100000000;
  };
}

/**
 * Pick `n` items from a component's pool, spanning its difficulty range.
 *
 * Sorting by difficulty and taking evenly spaced positions gives a spread
 * without needing the bank to declare bands. Taking the `n` easiest — which is
 * what any "closest to target" rule degenerates to when the target is low —
 * would let a learner pass a component they cannot actually do at exam
 * difficulty.
 */
function spread(pool: readonly ExamCandidate[], n: number): ExamCandidate[] {
  if (n >= pool.length) return [...pool];
  const sorted = [...pool].sort((a, b) => a.difficultyB - b.difficultyB || a.itemId.localeCompare(b.itemId));
  const picked: ExamCandidate[] = [];
  for (let i = 0; i < n; i += 1) {
    // Evenly spaced across the sorted pool, endpoints included.
    const index = n === 1 ? Math.floor(sorted.length / 2) : Math.round((i * (sorted.length - 1)) / (n - 1));
    const item = sorted[index];
    if (item && !picked.includes(item)) picked.push(item);
  }
  // Rounding can collide on short pools; top up in order rather than returning
  // fewer items than the allocation asked for.
  for (const item of sorted) {
    if (picked.length >= n) break;
    if (!picked.includes(item)) picked.push(item);
  }
  return picked;
}

/**
 * Span difficulty *within* the unseen part of the pool where that is possible.
 *
 * Doing the two steps in the other order silently loses one of them: spanning
 * difficulty across the whole pool re-sorts it and discards the fresh-first
 * ordering entirely, so a paper drawn from a pool with one previously seen
 * item will happily serve that item back while unseen ones of the same
 * difficulty sit unused. Both properties are wanted and only this order keeps
 * them — repeats are drawn on only when there genuinely are not enough fresh
 * questions, and then they still span the range rather than clustering.
 */
function spanDifficulty(
  pool: readonly ExamCandidate[],
  n: number,
  attempted: ReadonlySet<ItemId>,
): ExamCandidate[] {
  const unseen = pool.filter((c) => !attempted.has(c.itemId));
  if (unseen.length >= n) return spread(unseen, n);
  const seen = pool.filter((c) => attempted.has(c.itemId));
  return [...unseen, ...spread(seen, n - unseen.length)];
}

export function assembleExam(
  blueprint: ExamBlueprint,
  candidates: readonly ExamCandidate[],
  /** Which unit each component belongs to. */
  unitOfKc: ReadonlyMap<KcId, ExamUnitRef>,
  options: AssembleOptions = {},
): ExamPaper {
  const size = options.size ?? DEFAULT_EXAM_SIZE;
  const attempted = options.attempted ?? new Set<ItemId>();
  const rng = makeRng(options.seed ?? 1);

  const inScope = new Set(blueprint.kcIds);
  const unitId = (ref: ExamUnitRef): string => `${ref.course}\u0000${ref.unit}`;

  // Components in scope, grouped by their unit. Every component is listed even
  // when nothing has been authored for it, because "no items exist" and "this
  // unit is not on the exam" have to stay distinguishable.
  const kcsByUnit = new Map<string, KcId[]>();
  for (const kcId of blueprint.kcIds) {
    const ref = unitOfKc.get(kcId);
    if (!ref) continue;
    const list = kcsByUnit.get(unitId(ref));
    if (list) list.push(kcId);
    else kcsByUnit.set(unitId(ref), [kcId]);
  }

  const poolByKc = new Map<KcId, ExamCandidate[]>();
  for (const candidate of candidates) {
    if (!inScope.has(candidate.kcId)) continue;
    const list = poolByKc.get(candidate.kcId);
    if (list) list.push(candidate);
    else poolByKc.set(candidate.kcId, [candidate]);
  }
  // Unseen questions before repeats, then a stable order so a seed reproduces
  // a paper exactly.
  for (const pool of poolByKc.values()) {
    pool.sort((a, b) => {
      const seenA = attempted.has(a.itemId) ? 1 : 0;
      const seenB = attempted.has(b.itemId) ? 1 : 0;
      return seenA - seenB || a.itemId.localeCompare(b.itemId);
    });
  }

  // Slots are shared out between units in proportion to how many components
  // each contains. Weighting by *item* count instead would hand the paper to
  // whichever chapter happened to get the most authoring attention, which is a
  // fact about this repository rather than about the exam.
  const units = blueprint.units.filter((ref) => (kcsByUnit.get(unitId(ref)) ?? []).length > 0);
  const weightOf = (ref: ExamUnitRef): number =>
    (kcsByUnit.get(unitId(ref)) ?? []).filter((kc) => (poolByKc.get(kc) ?? []).length > 0).length;
  const totalWeight = units.reduce((sum, ref) => sum + weightOf(ref), 0);

  const perUnit: { ref: ExamUnitRef; slots: number }[] = [];
  let allocated = 0;
  for (const ref of units) {
    const weight = weightOf(ref);
    if (weight === 0) continue;
    const slots = Math.max(1, Math.floor((size * weight) / Math.max(1, totalWeight)));
    perUnit.push({ ref, slots });
    allocated += slots;
  }
  // Hand the rounding remainder to the largest units first.
  const ordered = [...perUnit].sort((a, b) => weightOf(b.ref) - weightOf(a.ref));
  let remainder = size - allocated;
  for (let i = 0; remainder > 0 && ordered.length > 0; i += 1) {
    const entry = ordered[i % ordered.length];
    if (entry) {
      entry.slots += 1;
      remainder -= 1;
    }
  }

  const coverage: ExamCoverage[] = [];
  const unitsWithoutItems: ExamUnitRef[] = [];
  const picksByUnit: ExamCandidate[][] = [];

  for (const ref of blueprint.units) {
    const kcs = kcsByUnit.get(unitId(ref)) ?? [];
    const withItems = kcs.filter((kc) => (poolByKc.get(kc) ?? []).length > 0);
    if (withItems.length === 0) {
      unitsWithoutItems.push(ref);
      coverage.push({ course: ref.course, unit: ref.unit, kcsCovered: 0, kcsInScope: kcs.length, itemCount: 0 });
      continue;
    }

    const slots = perUnit.find((p) => unitId(p.ref) === unitId(ref))?.slots ?? 0;

    // Round-robin: every component is asked once before any is asked twice, so
    // a unit's slots cannot all land on a single topic within it.
    const quota = new Map<KcId, number>(withItems.map((kc) => [kc, 0]));
    for (let given = 0; given < slots; given += 1) {
      const kc = withItems[given % withItems.length];
      if (kc === undefined) break;
      const pool = poolByKc.get(kc) ?? [];
      const already = quota.get(kc) ?? 0;
      if (already >= pool.length) continue;
      quota.set(kc, already + 1);
    }

    const picks: ExamCandidate[] = [];
    for (const kc of withItems) {
      const want = quota.get(kc) ?? 0;
      if (want > 0) picks.push(...spanDifficulty(poolByKc.get(kc) ?? [], want, attempted));
    }

    picksByUnit.push(picks);
    coverage.push({
      course: ref.course,
      unit: ref.unit,
      kcsCovered: new Set(picks.map((p) => p.kcId)).size,
      kcsInScope: kcs.length,
      itemCount: picks.length,
    });
  }

  // Interleave the units rather than running through them one at a time.
  //
  // A real paper groups by topic, and copying that here would bias the
  // diagnosis: whatever sits last gets answered in a hurry or not at all, so
  // "ran out of time" and "does not know chapter 12" produce identical data.
  // Spreading the units means the time-management finding and the per-component
  // scores stay independent, which is the only way both can be trusted.
  const items: ExamCandidate[] = [];
  const cursors = picksByUnit.map(() => 0);
  let remaining = picksByUnit.reduce((sum, p) => sum + p.length, 0);
  while (remaining > 0 && items.length < size) {
    for (let u = 0; u < picksByUnit.length; u += 1) {
      const pool = picksByUnit[u];
      const cursor = cursors[u];
      if (pool === undefined || cursor === undefined || cursor >= pool.length) continue;
      const item = pool[cursor];
      cursors[u] = cursor + 1;
      remaining -= 1;
      if (item) items.push(item);
      if (items.length >= size) break;
    }
  }

  // A light shuffle inside the interleave, so two sittings of the same paper
  // are not answered in the same order from memory.
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    const a = items[i];
    const b = items[j];
    if (a !== undefined && b !== undefined) {
      items[i] = b;
      items[j] = a;
    }
  }

  return { blueprint, items, coverage, unitsWithoutItems, short: items.length < size };
}
