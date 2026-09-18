import type { MisconceptionId } from '../types.js';
import type { RankedMisconception } from './rank.js';

/**
 * Rolling individual errors up into habits.
 *
 * The dual-axis argument, applied to mistakes. Per-KC counts can say the
 * learner missed four op-amp questions and three ODE questions; only the
 * rollup can say they dropped a sign seven times. The second statement is
 * actionable and the first is not, and no view organised by course can produce
 * it — which is the same reason the competency radar exists.
 *
 * The family map arrives as data rather than an import: this package stays free
 * of content-schema (and of I/O generally) so the whole mastery model remains
 * verifiable without a bundler. The caller reads the catalog and hands over the
 * lookup.
 */

/** The minimum a family must state for the rollup to be useful. */
export interface FamilyRef {
  id: string;
  title: string;
  description: string;
  competency: string;
}

export interface MisconceptionFamilyRollup {
  family: FamilyRef;
  /** Members present in the log, ranked. */
  members: RankedMisconception[];
  /** Summed member scores. */
  score: number;
  totalHits: number;
  /** Distinct courses the family's errors appeared under. */
  courses: string[];
  /**
   * The finding worth surfacing: the same habit costing marks in more than one
   * course. A learner who drops signs in circuits *and* in differential
   * equations does not have two problems.
   */
  crossCourse: boolean;
  lastSeen: Date;
  /** True when any member has met its drill threshold. */
  drillDue: boolean;
}

export function rollUpFamilies(
  ranked: readonly RankedMisconception[],
  families: ReadonlyMap<MisconceptionId, FamilyRef>,
): MisconceptionFamilyRollup[] {
  const grouped = new Map<string, { family: FamilyRef; members: RankedMisconception[] }>();

  for (const entry of ranked) {
    const family = families.get(entry.misconceptionId);
    // An uncatalogued misconception is still real evidence; it simply has no
    // habit to roll into. Dropping it here would make the feed quietly
    // incomplete whenever content ships ahead of the catalog.
    if (!family) continue;

    const bucket = grouped.get(family.id);
    if (bucket) bucket.members.push(entry);
    else grouped.set(family.id, { family, members: [entry] });
  }

  const rollups: MisconceptionFamilyRollup[] = [];
  for (const { family, members } of grouped.values()) {
    const courses = [...new Set(members.flatMap((m) => m.courses))];
    rollups.push({
      family,
      members,
      score: members.reduce((sum, m) => sum + m.score, 0),
      totalHits: members.reduce((sum, m) => sum + m.totalHits, 0),
      courses,
      crossCourse: courses.length > 1,
      lastSeen: new Date(Math.max(...members.map((m) => m.lastSeen.getTime()))),
      drillDue: members.some((m) => m.drillDue),
    });
  }

  return rollups.sort((a, b) => b.score - a.score || a.family.id.localeCompare(b.family.id));
}

/** Misconceptions present in the log that the catalog does not describe. */
export function uncataloguedMisconceptions(
  ranked: readonly RankedMisconception[],
  families: ReadonlyMap<MisconceptionId, FamilyRef>,
): MisconceptionId[] {
  return ranked.filter((r) => !families.has(r.misconceptionId)).map((r) => r.misconceptionId);
}
