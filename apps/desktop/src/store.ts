import { create } from 'zustand';
import {
  DEFAULT_CAT_CONFIG,
  createCatSession,
  dailyQuest,
  finalizePlacement,
  gradeChallenge,
  recordActivity,
  recordResponse,
  selectNextItem,
  shouldStop,
  xpForAttempt,
  type CatItem,
  type CatSessionState,
  type ChallengeResponse,
  type ChallengeResult,
  type KcId,
  type PlacementResult,
  type Quest,
  type StreakUpdate,
} from '@et/domain';
import { checkAnswer, type CheckResult, type Response } from '@et/answer-engine';
import { gradeCircuit, parseNetlist, toNetlist, type GradeResult, type Schematic } from '@et/circuits';
import type { Item } from '@et/content-schema';
import { loadContent, itemsForCourses, itemsForKcs, type LoadedContent } from '@/content';
import { buildLearnerModel, type LearnerModel } from '@/features/learner-model';
import { WebStorageAdapter } from '@/storage/web';
import { TauriSqlAdapter, isTauri } from '@/storage/tauri';
import {
  emptyProfile,
  type AttemptRecord,
  type CircuitRecord,
  type CompletedCourse,
  type InferredPrior,
  type Profile,
  type SessionMode,
  type StorageAdapter,
} from '@/storage/types';

/**
 * Application state.
 *
 * The adaptive engine in @et/domain is pure and immutable, so the store holds
 * its state and threads each response through it. Nothing about the model lives
 * here - this is orchestration, and the mastery logic stays testable without a
 * browser.
 */

type Route = 'loading' | 'onboarding' | 'dashboard' | 'session' | 'report' | 'credentials' | 'skillTree' | 'circuitLab';

export interface ActiveItem {
  item: Item;
  catItem: CatItem;
  startedAt: number;
  /** FSRS retrievability before this attempt; drives the XP retrieval bonus. */
  retrievabilityBefore: number;
}

export interface Graded {
  result: CheckResult;
  item: Item;
  /** The learner's raw response, for showing what they entered. */
  submitted: string;
  xpAwarded: number;
  /** Per-measurement detail for a circuit-build item. */
  circuit?: GradeResult;
}

interface AppState {
  route: Route;
  content: LoadedContent | null;
  storage: StorageAdapter | null;
  profile: Profile;
  model: LearnerModel | null;
  circuits: CircuitRecord[];
  /**
   * Why startup failed, if it did. Without this a storage failure leaves the
   * app on "Loading..." forever with nothing on screen and nothing in the UI to
   * diagnose from - which is exactly how a broken desktop build looked.
   */
  bootError: string | null;

  // Active session
  mode: SessionMode;
  sessionId: string | null;
  cat: CatSessionState | null;
  bank: CatItem[];
  itemsById: Map<string, Item>;
  active: ActiveItem | null;
  graded: Graded | null;
  hintsShown: number;
  answered: number;
  correctCount: number;
  sessionXp: number;
  lastPlacement: PlacementResult | null;
  lastChallenge: ChallengeResult | null;
  lastStreak: StreakUpdate | null;
  /** Course under examination, for a challenge run. */
  challengeCourse: string | null;
  challengeResponses: ChallengeResponse[];
  /** Working schematic for a circuit-build item. */
  workingSchematic: Schematic | null;

  boot(): Promise<void>;
  completeOnboarding(courses: CompletedCourse[], targetTerm: string): Promise<void>;
  startPlacement(courseCodes: string[]): void;
  startQuest(): void;
  startChallenge(courseCode: string): void;
  submit(response: Response, raw: string): Promise<void>;
  submitCircuit(schematic: Schematic): Promise<void>;
  submitCircuitNetlist(deck: string): Promise<void>;
  setWorkingSchematic(schematic: Schematic): void;
  advance(): Promise<void>;
  showHint(): void;
  goTo(route: Route): void;
  saveCircuit(schematic: Schematic, netlist: string): Promise<void>;
  removeCircuit(id: string): Promise<void>;
  quest(): Quest | null;
  resetAll(): Promise<void>;
}

const uid = (): string => globalThis.crypto.randomUUID();

/** Items the adaptive engine can choose from, paired with their full content. */
function buildBank(items: readonly Item[]): { bank: CatItem[]; itemsById: Map<string, Item> } {
  return {
    bank: items.map((item) => ({
      id: item.id,
      kcRefs: item.kcRefs.map((r) => ({ kc: r.kc, weight: r.weight })),
      difficultyB: item.difficultyB,
    })),
    itemsById: new Map(items.map((item) => [item.id, item])),
  };
}

export const useApp = create<AppState>((set, get) => ({
  route: 'loading',
  content: null,
  storage: null,
  profile: emptyProfile(),
  model: null,
  circuits: [],
  bootError: null,

  mode: 'placement',
  sessionId: null,
  cat: null,
  bank: [],
  itemsById: new Map(),
  active: null,
  graded: null,
  hintsShown: 0,
  answered: 0,
  correctCount: 0,
  sessionXp: 0,
  lastPlacement: null,
  lastChallenge: null,
  lastStreak: null,
  challengeCourse: null,
  challengeResponses: [],
  workingSchematic: null,

  async boot() {
    // SQLite under the desktop shell, IndexedDB in a browser. The renderer
    // never learns which, so the same code path is exercised either way.
    const kind = isTauri() ? 'SQLite (desktop)' : 'IndexedDB (browser)';
    try {
      const content = loadContent();
      const storage: StorageAdapter = isTauri() ? new TauriSqlAdapter() : new WebStorageAdapter();
      await storage.init();

      const profile = await storage.getProfile();
      const [attempts, priors, circuits] = await Promise.all([
        storage.listAttempts(),
        storage.listPriors(),
        storage.listCircuits(),
      ]);
      const model = buildLearnerModel(content.graph, profile, attempts, priors);

      set({
        content,
        storage,
        profile,
        model,
        circuits,
        bootError: null,
        route: profile.onboarded ? 'dashboard' : 'onboarding',
      });
    } catch (error) {
      const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
      set({ bootError: `Storage backend: ${kind}\n\n${detail}` });
    }
  },

  async completeOnboarding(courses, targetTerm) {
    const { storage, content } = get();
    if (!storage || !content) return;

    const profile: Profile = {
      ...get().profile,
      completedCourses: courses,
      targetTerm,
      onboarded: true,
      lastActiveAt: new Date().toISOString(),
    };
    await storage.saveProfile(profile);

    const [attempts, priors] = await Promise.all([storage.listAttempts(), storage.listPriors()]);
    set({
      profile,
      model: buildLearnerModel(content.graph, profile, attempts, priors),
      route: 'dashboard',
    });
  },

  startPlacement(courseCodes) {
    const { content, model } = get();
    if (!content || !model) return;

    const items = itemsForCourses(content, courseCodes);
    const { bank, itemsById } = buildBank(items);

    const targetKcs: KcId[] = [...content.graph.kcs.values()]
      .filter((kc) => courseCodes.includes(kc.courseId))
      .map((kc) => kc.id);

    // Carry existing belief in as priors so a re-run refines rather than restarts.
    const priors = new Map(targetKcs.map((kc) => [kc, model.pMastery.get(kc) ?? DEFAULT_CAT_CONFIG.bkt.pInit]));
    beginSession(set, get, { mode: 'placement', cat: createCatSession(targetKcs, priors), bank, itemsById });
  },

  /**
   * Today's quest as a practice session.
   *
   * Scoped to the quest's KCs rather than a whole course, so the session is the
   * work the scheduler chose — due reviews plus material whose prerequisites
   * are actually in place.
   */
  startQuest() {
    const { content, model } = get();
    if (!content || !model) return;
    const quest = dailyQuest(content.graph, model.byKc);
    const kcIds = new Set([...quest.reviewKcs, ...quest.frontierKcs]);
    if (kcIds.size === 0) return;

    const { bank, itemsById } = buildBank(itemsForKcs(content.items, kcIds));
    const priors = new Map([...kcIds].map((kc) => [kc, model.pMastery.get(kc) ?? DEFAULT_CAT_CONFIG.bkt.pInit]));
    beginSession(set, get, {
      mode: 'practice',
      cat: createCatSession([...kcIds], priors),
      bank,
      itemsById,
    });
  },

  startChallenge(courseCode) {
    const { content, model } = get();
    if (!content || !model) return;

    const items = itemsForCourses(content, [courseCode]);
    const { bank, itemsById } = buildBank(items);
    const targetKcs = [...content.graph.kcs.values()]
      .filter((kc) => kc.courseId === courseCode)
      .map((kc) => kc.id);

    // A challenge exam starts from a neutral prior on purpose: it is an
    // examination, not a refinement of what the model already believes.
    const priors = new Map(targetKcs.map((kc) => [kc, DEFAULT_CAT_CONFIG.bkt.pInit]));
    beginSession(set, get, {
      mode: 'challenge',
      cat: createCatSession(targetKcs, priors),
      bank,
      itemsById,
      challengeCourse: courseCode,
    });
  },

  setWorkingSchematic(schematic) {
    set({ workingSchematic: schematic });
  },

  async submitCircuit(schematic) {
    const { active } = get();
    if (!active || active.item.answer.kind !== 'circuit' || get().graded) return;

    const built = toNetlist(schematic);
    const blocking = built.issues.filter((i) => /unconnected|No ground/.test(i.message));
    if (blocking.length > 0) {
      // Not a wrong answer: the circuit could not be evaluated at all, and
      // scoring it as incorrect would punish a drawing mistake as a physics one.
      set({
        graded: {
          result: { correct: false, outcome: 'unparseable', feedback: blocking[0]!.message },
          item: active.item,
          submitted: '',
          xpAwarded: 0,
        },
      });
      return;
    }
    await gradeAndRecord(set, get, built.netlist, built.netlist.elements.map((e) => e.id).join(' '));
  },

  /**
   * Answer a design task by typing a SPICE deck instead of drawing it.
   *
   * Kept as a first-class path rather than a debug affordance: writing a netlist
   * is how a great deal of real circuit work is actually done, and a learner who
   * can express a design that way has demonstrated the same understanding as one
   * who drew it. Both routes end at the same grader.
   */
  async submitCircuitNetlist(deck) {
    const { active } = get();
    if (!active || active.item.answer.kind !== 'circuit' || get().graded) return;

    const parsed = parseNetlist(deck);
    if (parsed.errors.length > 0) {
      set({
        graded: {
          result: { correct: false, outcome: 'unparseable', feedback: parsed.errors.join('; ') },
          item: active.item,
          submitted: deck,
          xpAwarded: 0,
        },
      });
      return;
    }
    await gradeAndRecord(set, get, parsed.netlist, deck);
  },

  async submit(response, raw) {
    const { active } = get();
    if (!active || get().graded) return;

    const result = checkAnswer(response, active.item);

    // A parse failure is not a wrong answer - the learner never got to be
    // right or wrong - so it is shown for correction and never recorded.
    if (result.outcome === 'unparseable' || result.outcome === 'wrong-dimension') {
      set({ graded: { result, item: active.item, submitted: raw, xpAwarded: 0 } });
      return;
    }

    await recordAttempt(set, get, result.correct, { result, submitted: raw });
  },

  async advance() {
    const { cat, bank, itemsById, content, storage, sessionId, mode } = get();
    if (!cat || !content || !storage || !sessionId) return;

    const decision = shouldStop(cat, bank, DEFAULT_CAT_CONFIG);
    if (!decision.stop) {
      const next = selectNextItem(cat, bank, DEFAULT_CAT_CONFIG);
      if (next) {
        set({
          active: activeItemFor(next, itemsById, get().model),
          graded: null,
          hintsShown: 0,
          workingSchematic: null,
        });
        return;
      }
    }

    const recordedAt = new Date().toISOString();
    const xp = get().sessionXp;

    // A day with a finished session counts toward the streak. Recorded here
    // rather than on the first answer so an abandoned session does not count.
    const streakUpdate = recordActivity(get().profile.streak, new Date());

    let placement: PlacementResult | null = null;
    let challenge: ChallengeResult | null = null;

    if (mode === 'challenge' && get().challengeCourse) {
      challenge = gradeChallenge(get().challengeCourse!, content.graph, get().challengeResponses);
    } else {
      // Mine the prerequisite graph for everything the responses imply, and
      // persist those inferences separately from the evidence.
      placement = finalizePlacement(cat, content.graph, decision.reason, DEFAULT_CAT_CONFIG);
      const priors: InferredPrior[] = [...placement.inferred.values()].map((adj) => ({
        kcId: adj.kcId,
        prior: adj.prior,
        sourceKcId: adj.source,
        distance: adj.distance,
        recordedAt,
      }));
      await storage.savePriors(priors);
    }

    await storage.saveSession({
      id: sessionId,
      mode,
      courseIds: get().challengeCourse ? [get().challengeCourse!] : [],
      startedAt: recordedAt,
      endedAt: recordedAt,
      xpEarned: xp,
      summary: placement
        ? { itemsAdministered: placement.itemsAdministered, stopReason: placement.stopReason }
        : { challenge },
    });

    const crests = new Set(get().profile.crests);
    if (challenge?.passed) crests.add(challenge.courseId);

    const profile: Profile = {
      ...get().profile,
      totalXp: get().profile.totalXp + xp,
      streak: streakUpdate.state,
      crests: [...crests],
      lastActiveAt: recordedAt,
    };
    await storage.saveProfile(profile);

    const [attempts, allPriors] = await Promise.all([storage.listAttempts(), storage.listPriors()]);
    set({
      profile,
      model: buildLearnerModel(content.graph, profile, attempts, allPriors),
      lastPlacement: placement,
      lastChallenge: challenge,
      lastStreak: streakUpdate,
      active: null,
      graded: null,
      workingSchematic: null,
      route: 'report',
    });
  },

  showHint() {
    set({ hintsShown: get().hintsShown + 1 });
  },

  goTo(route) {
    set({ route });
  },

  quest() {
    const { content, model } = get();
    if (!content || !model) return null;
    return dailyQuest(content.graph, model.byKc);
  },

  async saveCircuit(schematic, netlist) {
    const { storage } = get();
    if (!storage) return;
    const record: CircuitRecord = {
      id: uid(),
      name: schematic.title || 'untitled',
      schematic,
      netlist,
      updatedAt: new Date().toISOString(),
    };
    await storage.saveCircuit(record);
    set({ circuits: await storage.listCircuits() });
  },

  async removeCircuit(id) {
    const { storage } = get();
    if (!storage) return;
    await storage.deleteCircuit(id);
    set({ circuits: await storage.listCircuits() });
  },

  async resetAll() {
    const { storage, content } = get();
    if (!storage || !content) return;
    await storage.reset();
    const profile = emptyProfile();
    set({
      profile,
      model: buildLearnerModel(content.graph, profile, [], []),
      lastPlacement: null,
      lastChallenge: null,
      lastStreak: null,
      circuits: [],
      cat: null,
      active: null,
      graded: null,
      route: 'onboarding',
    });
  },
}));

// ---------------------------------------------------------------------------

type Setter = (partial: Partial<AppState>) => void;
type Getter = () => AppState;

/** Pair a selected item with its content and the retention state it is about to test. */
function activeItemFor(
  catItem: CatItem,
  itemsById: Map<string, Item>,
  model: LearnerModel | null,
): ActiveItem | null {
  const item = itemsById.get(catItem.id);
  if (!item) return null;
  // Retrievability *before* the attempt is what makes the XP bonus meaningful;
  // after the answer is recorded the model has already reset it toward 1.
  const retrievabilities = item.kcRefs.map((ref) => model?.byKc.get(ref.kc)?.retrievability ?? 1);
  return {
    item,
    catItem,
    startedAt: Date.now(),
    retrievabilityBefore: Math.min(1, ...retrievabilities),
  };
}

function beginSession(
  set: Setter,
  get: Getter,
  options: {
    mode: SessionMode;
    cat: CatSessionState;
    bank: CatItem[];
    itemsById: Map<string, Item>;
    challengeCourse?: string;
  },
): void {
  const first = selectNextItem(options.cat, options.bank, DEFAULT_CAT_CONFIG);
  set({
    mode: options.mode,
    sessionId: uid(),
    cat: options.cat,
    bank: options.bank,
    itemsById: options.itemsById,
    active: first ? activeItemFor(first, options.itemsById, get().model) : null,
    graded: null,
    hintsShown: 0,
    answered: 0,
    correctCount: 0,
    sessionXp: 0,
    challengeCourse: options.challengeCourse ?? null,
    challengeResponses: [],
    workingSchematic: null,
    route: 'session',
  });
}

/** Simulate a submitted circuit against the item's measurements and record it. */
async function gradeAndRecord(
  set: Setter,
  get: Getter,
  netlist: Parameters<typeof gradeCircuit>[0],
  submitted: string,
): Promise<void> {
  const active = get().active;
  if (!active || active.item.answer.kind !== 'circuit') return;

  const graded = gradeCircuit(netlist, active.item.answer.measurements);
  await recordAttempt(set, get, graded.correct, {
    result: {
      correct: graded.correct,
      outcome: graded.correct ? 'correct' : 'incorrect',
      ...(graded.error ? { feedback: graded.error } : {}),
    },
    submitted,
    circuit: graded,
  });
}

/** Log an attempt, advance the adaptive model, and award XP. */
async function recordAttempt(
  set: Setter,
  get: Getter,
  correct: boolean,
  outcome: { result: CheckResult; submitted: string; circuit?: GradeResult },
): Promise<void> {
  const { active, cat, storage, sessionId, hintsShown, mode } = get();
  if (!active || !cat || !storage || !sessionId) return;

  const attempt: AttemptRecord = {
    id: uid(),
    sessionId,
    itemId: active.item.id,
    kcRefs: active.item.kcRefs.map((r) => ({ kc: r.kc, weight: r.weight })),
    correct,
    latencyMs: Date.now() - active.startedAt,
    hintsUsed: hintsShown,
    misconceptions: outcome.result.misconception ? [outcome.result.misconception] : [],
    at: new Date(),
    ...(active.item.type === 'multiple-choice' ? { optionCount: active.item.options.length } : {}),
  };

  await storage.appendAttempt(attempt);
  if (outcome.result.misconception) {
    await storage.recordMisconceptions([
      {
        id: uid(),
        misconceptionId: outcome.result.misconception,
        kcId: active.item.kcRefs[0]!.kc,
        attemptId: attempt.id,
        at: attempt.at.toISOString(),
      },
    ]);
  }

  const award = xpForAttempt({
    correct,
    difficultyB: active.item.difficultyB,
    hintsUsed: hintsShown,
    retrievabilityBefore: active.retrievabilityBefore,
  });

  set({
    graded: {
      result: outcome.result,
      item: active.item,
      submitted: outcome.submitted,
      xpAwarded: award.total,
      ...(outcome.circuit ? { circuit: outcome.circuit } : {}),
    },
    cat: recordResponse(cat, active.catItem, correct, DEFAULT_CAT_CONFIG, {
      ...(attempt.optionCount !== undefined ? { optionCount: attempt.optionCount } : {}),
    }),
    answered: get().answered + 1,
    correctCount: get().correctCount + (correct ? 1 : 0),
    sessionXp: get().sessionXp + award.total,
    ...(mode === 'challenge'
      ? {
          challengeResponses: [
            ...get().challengeResponses,
            { kcIds: active.item.kcRefs.map((r) => r.kc), correct },
          ],
        }
      : {}),
  });
}

/** Re-exported so the circuit lab can parse a pasted deck without importing twice. */
export { parseNetlist };
