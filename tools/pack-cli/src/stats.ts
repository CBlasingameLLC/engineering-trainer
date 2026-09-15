import type { Item, Pack } from '@et/content-schema';

/**
 * Coverage analysis.
 *
 * The adaptive engine can only ask what the bank contains. If a KC has items at
 * only one difficulty, placement cannot measure a learner whose ability sits
 * elsewhere - it will keep administering questions that are far too easy or far
 * too hard, extract almost no information, and burn the item budget doing it.
 * Thin cells are a defect in the bank, not a cosmetic gap.
 */

export const DIFFICULTY_BANDS = [
  { label: 'intro', min: -4, max: -1 },
  { label: 'basic', min: -1, max: 0 },
  { label: 'core', min: 0, max: 1 },
  { label: 'advanced', min: 1, max: 4 },
] as const;

export type BandLabel = (typeof DIFFICULTY_BANDS)[number]['label'];

export const bandFor = (difficultyB: number): BandLabel =>
  (DIFFICULTY_BANDS.find((b) => difficultyB >= b.min && difficultyB < b.max) ?? DIFFICULTY_BANDS.at(-1)!).label;

export interface KcCoverage {
  kc: string;
  total: number;
  byBand: Record<BandLabel, number>;
  /** Bands with fewer items than the minimum. */
  emptyBands: BandLabel[];
  /** Distinct bands that actually hold items. */
  spannedBands: number;
}

export interface PackStats {
  packId: string;
  itemCount: number;
  kcCount: number;
  byType: Record<string, number>;
  coverage: KcCoverage[];
  /** KCs the adaptive engine cannot bracket across a useful ability range. */
  thinKcs: string[];
  misconceptionCount: number;
}

export function computeStats(packs: readonly Pack[], minPerBand = 1): PackStats {
  const items: Item[] = packs.flatMap((p) => p.items);
  const byKc = new Map<string, Item[]>();
  const byType: Record<string, number> = {};
  const misconceptions = new Set<string>();

  for (const item of items) {
    byType[item.type] = (byType[item.type] ?? 0) + 1;
    for (const ref of item.kcRefs) {
      const bucket = byKc.get(ref.kc);
      if (bucket) bucket.push(item);
      else byKc.set(ref.kc, [item]);
    }
    for (const trap of item.misconceptionTraps) misconceptions.add(trap.misconception);
    for (const option of item.options) if (option.misconception) misconceptions.add(option.misconception);
  }

  const coverage: KcCoverage[] = [...byKc]
    .map(([kc, kcItems]) => {
      const byBand = Object.fromEntries(DIFFICULTY_BANDS.map((b) => [b.label, 0])) as Record<BandLabel, number>;
      for (const item of kcItems) byBand[bandFor(item.difficultyB)]++;
      return {
        kc,
        total: kcItems.length,
        byBand,
        emptyBands: DIFFICULTY_BANDS.filter((b) => byBand[b.label] < minPerBand).map((b) => b.label),
        spannedBands: DIFFICULTY_BANDS.filter((b) => byBand[b.label] > 0).length,
      };
    })
    .sort((a, b) => a.kc.localeCompare(b.kc));

  return {
    packId: packs.length === 1 ? packs[0]!.packId : `${packs.length} packs`,
    itemCount: items.length,
    kcCount: byKc.size,
    byType,
    coverage,
    // Spanning fewer than two bands is the real defect: the engine needs at
    // least two difficulty points to bracket an ability estimate. Filling all
    // four is not the goal - a foundational KC like Ohm's law legitimately has
    // no advanced items, and demanding some would mean inventing bad content.
    thinKcs: coverage.filter((c) => c.spannedBands < 2).map((c) => c.kc),
    misconceptionCount: misconceptions.size,
  };
}

/** KCs defined in the curriculum that no item exercises at all. */
export function uncoveredKcs(stats: PackStats, allKcs: readonly string[]): string[] {
  const covered = new Set(stats.coverage.map((c) => c.kc));
  return allKcs.filter((kc) => !covered.has(kc)).sort();
}
