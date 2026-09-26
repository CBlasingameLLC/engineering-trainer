import { create } from 'zustand';
import {
  DEFAULT_CAT_CONFIG,
  assembleDrill,
  createCatSession,
  dailyQuest,
  finalizePlacement,
  gradeChallenge,
  recordActivity,
  recordResponse,
  selectNextItem,
  shouldStop,
  xpForAttempt,
  assembleExam,
  examShares,
  gradeExam,
  upcomingExams,
  type CatItem,
  type CatSessionState,
  type ChallengeResponse,
  type ChallengeResult,
  type KcId,
  type PlacementResult,
  type ExamBlueprint,
  type ExamCoverage,
  type ExamResponse,
  type ExamResult,
  type ExamUnitRef,
  type Quest,
  type StreakUpdate,
} from '@et/domain';
import { checkAnswer, type CheckResult, type Response } from '@et/answer-engine';
import { gradeCircuit, parseNetlist, toNetlist, type GradeResult, type Schematic } from '@et/circuits';
import type { Item } from '@et/content-schema';
import { loadContent, currentTerm, drillCandidates, itemsForCourses, itemsForKcs, type LoadedContent } from '@/content';
import { examCandidates, examsForTerm, unitOfKcMap } from '@/content/exams';
import { buildLearnerModel, type LearnerModel } from '@/features/learner-model';
import { WebStorageAdapter } from '@/storage/web';
import { TauriSqlAdapter, isTauri } from '@/storage/tauri';
import {
  emptyProfile,
  type AttemptRecord,
  type CircuitRecord,
  type CompletedCourse,
  type InferredPrior,
  type MisconceptionEvent,
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

type Route =
  | 'loading' | 'onboarding' | 'dashboard' | 'session' | 'report'
  | 'credentials' | 'skillTree' | 'circuitLab' | 'misconceptions' | 'term'
  | 'diagnostics' | 'examReport';

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

/**
 * How a targeted drill went.
 *
 * `refired` is the number that matters. Getting items right is encouraging but
 * ambiguous — the learner may have avoided the trap by luck or by working more
 * slowly than they will next week. A drill built only from items that *can*
 * catch the error turns "the misconception did not fire once across five
 * questions and three topics" into the real evidence that the habit is gone.
 */
export interface DrillResult {
  misconceptionId: string;
  asked: number;
  correct: number;
  /** Times the same misconception fired again during the drill. */
  refired: number;
}

/**
 * A fixed-form sitting: an exam, or a triage run across several of them.
 *
 * Distinct from a CAT session, and it has to be. Adaptive selection puts every
 * question near the learner's current ability, which measures that ability in
 * the fewest items and is exactly wrong here — an adaptive run that stops
 * asking about chapter 12 after two wrong answers has measured accurately and
 * said nothing about Monday's paper. So the queue is built once, up front, with
 * coverage guaranteed, and served in order.
 *
 * `allowedMs` being null is what separates the two uses. An exam is sealed and
 * timed; a triage run is neither, because its job is to find gaps rather than
 * to reproduce exam conditions.
 */
export interface PaperSession {
  kind: 'exam' | 'triage';
  /** One for an exam; every exam covered, for a triage run. */
  blueprints: ExamBlueprint[];
  /** The whole paper, in serve order, including items not yet reached. */
  served: { itemId: string; kcId: KcId }[];
  cursor: number;
  startedAt: number;
  /** null when untimed. */
  allowedMs: number | null;
  responses: ExamResponse[];
  /** True once the learner has chosen to work past the bell. */
  continuedPastBell: boolean;
  coverage: ExamCoverage[];
  unitsWithoutItems: ExamUnitRef[];
  short: boolean;
}

export interface PaperOutcome {
  kind: 'exam' | 'triage';
  /** One result per blueprint, so a triage run reports each exam separately. */
  results: ExamResult[];
}

interface AppState {
  route: Route;
  content: LoadedContent | null;
  storage: StorageAdapter | null;
  profile: Profile;
  model: LearnerModel | null;
  circuits: CircuitRecord[];
  /**
   * Every recorded misconception hit. Held in state rather than re-read per
   * render because the feed is a pure projection over the whole log, the same
   * way the learner model is.
   */
  misconceptionEvents: MisconceptionEvent[];
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
  /** Which error a drill is remediating, and how it went. */
  drillTarget: string | null;
  lastDrill: DrillResult | null;
  /** Course under examination, for a challenge run. */
  challengeCourse: string | null;
  challengeResponses: ChallengeResponse[];
  /** Working schematic for a circuit-build item. */
  workingSchematic: Schematic | null;

  paper: PaperSession | null;
  lastPaper: PaperOutcome | null;

  boot(): Promise<void>;
  completeOnboarding(courses: CompletedCourse[], targetTerm: string): Promise<void>;
  startPlacement(courseCodes: string[]): void;
  startQuest(): void;
  startChallenge(courseCode: string): void;
  startDrill(misconceptionId: string): void;
  /** Practise one scheduled unit of one course. */
  startUnit(courseCode: string, unit: string): void;
  /** Practise a named set of KCs — what the term view hands back. */
  startKcs(kcIds: readonly string[]): void;
  startExam(examId: string, options?: { size?: number }): void;
  startTriage(options?: { size?: number }): void;
  continuePastBell(): void;
  finishPaper(): Promise<void>;
  examBlueprints(): ExamBlueprint[];
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
  misconceptionEvents: [],
  drillTarget: null,
  lastDrill: null,
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
  paper: null,
  lastPaper: null,

  async boot() {
    // SQLite under the desktop shell, IndexedDB in a browser. The renderer
    // never learns which, so the same code path is exercised either way.
    const kind = isTauri() ? 'SQLite (desktop)' : 'IndexedDB (browser)';
    try {
      const content = loadContent();
      const storage: StorageAdapter = isTauri() ? new TauriSqlAdapter() : new WebStorageAdapter();
      await storage.init();

      const profile = await storage.getProfile();
      const [attempts, priors, circuits, misconceptionEvents] = await Promise.all([
        storage.listAttempts(),
        storage.listPriors(),
        storage.listCircuits(),
        storage.listMisconceptionEvents(),
      ]);
      const model = buildLearnerModel(content.graph, profile, attempts, priors);

      set({
        content,
        storage,
        profile,
        model,
        circuits,
        misconceptionEvents,
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

  /**
   * Practise exactly one unit of one course.
   *
   * Scoped by the unit the term says is live rather than by the whole course,
   * because "study what I am covering this week" is the request, and a session
   * drawn from the whole of Circuits II would spend most of its items measuring
   * material the learner has not been taught yet.
   */
  startUnit(courseCode, unit) {
    const { content } = get();
    if (!content) return;
    const kcIds = [...content.graph.kcs.values()]
      .filter((kc) => kc.courseId === courseCode && kc.unit === unit)
      .map((kc) => kc.id);
    get().startKcs(kcIds);
  },

  startKcs(kcIds) {
    const { content, model } = get();
    if (!content || !model || kcIds.length === 0) return;
    const wanted = new Set(kcIds);
    const items = itemsForKcs(content.items, wanted);
    if (items.length === 0) return;

    const { bank, itemsById } = buildBank(items);
    const priors = new Map(
      [...wanted].map((kc) => [kc, model.pMastery.get(kc) ?? DEFAULT_CAT_CONFIG.bkt.pInit]),
    );
    beginSession(set, get, {
      mode: 'practice',
      cat: createCatSession([...wanted], priors),
      bank,
      itemsById,
    });
  },

  /**
   * Every exam the current term declares, resolved against the graph.
   *
   * Recomputed on call rather than cached: `daysAway` is the field everything
   * else is ranked by, and a cached copy is wrong the moment the clock passes
   * midnight — on the one screen where being a day out matters most.
   */
  examBlueprints() {
    const { content } = get();
    if (!content) return [];
    return examsForTerm(content, currentTerm(content));
  },

  /**
   * Sit one exam under its own conditions.
   *
   * The paper is assembled before the clock starts and never changes, which is
   * the point: the learner is measured against the exam's scope rather than
   * against their own current ability.
   */
  startExam(examId, options = {}) {
    const { content, model } = get();
    if (!content || !model) return;

    const blueprint = get().examBlueprints().find((b) => b.id === examId);
    if (!blueprint) return;

    const unitOfKc = unitOfKcMap(content);
    const inScope = new Set(blueprint.kcIds);
    const paper = assembleExam(
      blueprint,
      examCandidates(content.items, inScope),
      unitOfKc,
      {
        size: options.size ?? examSizeFor(blueprint.minutes),
        seed: (Date.now() & 0x7fffffff) || 1,
        attempted: new Set(model.attemptedItemIds),
      },
    );
    if (paper.items.length === 0) return;

    const { bank, itemsById } = buildBank(
      paper.items.map((i) => content.items.find((item) => item.id === i.itemId)).filter(isItem),
    );
    const targetKcs = [...inScope];
    const priors = new Map(
      targetKcs.map((kc) => [kc, model.pMastery.get(kc) ?? DEFAULT_CAT_CONFIG.bkt.pInit]),
    );

    beginSession(set, get, {
      mode: 'exam',
      cat: createCatSession(targetKcs, priors),
      bank,
      itemsById,
      paper: {
        kind: 'exam',
        blueprints: [blueprint],
        served: paper.items.map((i) => ({ itemId: i.itemId, kcId: i.kcId })),
        cursor: 0,
        startedAt: Date.now(),
        allowedMs: blueprint.minutes * 60_000,
        responses: [],
        continuedPastBell: false,
        coverage: paper.coverage,
        unitsWithoutItems: paper.unitsWithoutItems,
        short: paper.short,
      },
    });
  },

  /**
   * One run across every exam still ahead, weighted by how soon each is sat.
   *
   * Untimed and unsealed, because this is a gap-finder rather than a rehearsal:
   * the question it answers is "which of the papers I sit this week is in the
   * worst shape", and hiding the explanations would make it a worse answer
   * without making it a more honest one. Every upcoming exam gets items —
   * an exam with none produces no evidence, which defeats the run.
   */
  startTriage(options = {}) {
    const { content, model } = get();
    if (!content || !model) return;

    const ahead = upcomingExams(get().examBlueprints()).filter((b) => b.kcIds.length > 0);
    if (ahead.length === 0) return;

    const unitOfKc = unitOfKcMap(content);
    const total = options.size ?? DEFAULT_TRIAGE_SIZE;
    const seed = (Date.now() & 0x7fffffff) || 1;

    const served: { itemId: string; kcId: KcId }[] = [];
    const coverage: ExamCoverage[] = [];
    const unitsWithoutItems: ExamUnitRef[] = [];
    let short = false;

    for (const share of examShares(ahead, total)) {
      const paper = assembleExam(
        share.exam,
        examCandidates(content.items, new Set(share.exam.kcIds)),
        unitOfKc,
        { size: share.items, seed, attempted: new Set(model.attemptedItemIds) },
      );
      // One item cannot sit on two exams' papers in the same run, and a
      // cumulative exam overlaps its predecessors heavily.
      for (const item of paper.items) {
        if (served.some((s) => s.itemId === item.itemId)) continue;
        served.push({ itemId: item.itemId, kcId: item.kcId });
      }
      coverage.push(...paper.coverage);
      unitsWithoutItems.push(...paper.unitsWithoutItems);
      short = short || paper.short;
    }
    if (served.length === 0) return;

    const { bank, itemsById } = buildBank(
      served.map((s) => content.items.find((item) => item.id === s.itemId)).filter(isItem),
    );
    const targetKcs = [...new Set(ahead.flatMap((b) => b.kcIds))];
    const priors = new Map(
      targetKcs.map((kc) => [kc, model.pMastery.get(kc) ?? DEFAULT_CAT_CONFIG.bkt.pInit]),
    );

    beginSession(set, get, {
      mode: 'placement',
      cat: createCatSession(targetKcs, priors),
      bank,
      itemsById,
      paper: {
        kind: 'triage',
        blueprints: ahead,
        served,
        cursor: 0,
        startedAt: Date.now(),
        allowedMs: null,
        responses: [],
        continuedPastBell: false,
        coverage,
        unitsWithoutItems,
        short,
      },
    });
  },

  continuePastBell() {
    const { paper } = get();
    if (!paper) return;
    set({ paper: { ...paper, continuedPastBell: true } });
  },

  /**
   * Close the paper and grade it.
   *
   * Reachable two ways — the queue runs out, or the learner hands in early —
   * and both have to grade the same way, so unreached items are supplied to
   * `gradeExam` rather than dropped. A question left blank is worth zero on the
   * real paper and reporting it as "not asked" would inflate every score.
   */
  async finishPaper() {
    const { paper, cat, content, storage, sessionId } = get();
    if (!paper || !cat || !content || !storage || !sessionId) return;

    const unitOfKc = unitOfKcMap(content);
    const servedIds = new Set(paper.served.map((s) => s.itemId));

    const results = paper.blueprints.map((blueprint) => {
      const mine = paper.served.filter((s) => blueprint.kcIds.includes(s.kcId));
      return gradeExam(
        blueprint,
        mine,
        paper.responses.filter((r) => mine.some((m) => m.itemId === r.itemId)),
        unitOfKc,
      );
    });

    const recordedAt = new Date().toISOString();
    const xp = get().sessionXp;
    const streakUpdate = recordActivity(get().profile.streak, new Date());

    // An exam is a broad, coverage-balanced sample of its scope, so its
    // responses are exactly the evidence graph propagation is designed for.
    const decision = shouldStop(cat, get().bank, DEFAULT_CAT_CONFIG);
    const placement = finalizePlacement(cat, content.graph, decision.reason, DEFAULT_CAT_CONFIG);
    await storage.savePriors(
      [...placement.inferred.values()].map((adj) => ({
        kcId: adj.kcId,
        prior: adj.prior,
        sourceKcId: adj.source,
        distance: adj.distance,
        recordedAt,
      })),
    );

    await storage.saveSession({
      id: sessionId,
      mode: paper.kind === 'exam' ? 'exam' : 'placement',
      courseIds: [...new Set(paper.blueprints.map((b) => b.course))],
      startedAt: new Date(paper.startedAt).toISOString(),
      endedAt: recordedAt,
      xpEarned: xp,
      summary: {
        paper: paper.kind,
        served: paper.served.length,
        answered: paper.responses.length,
        unreached: paper.served.length - paper.responses.filter((r) => servedIds.has(r.itemId)).length,
      },
    });

    const profile: Profile = {
      ...get().profile,
      totalXp: get().profile.totalXp + xp,
      streak: streakUpdate.state,
      lastActiveAt: recordedAt,
    };
    await storage.saveProfile(profile);

    const [attempts, allPriors, misconceptionEvents] = await Promise.all([
      storage.listAttempts(),
      storage.listPriors(),
      storage.listMisconceptionEvents(),
    ]);

    set({
      profile,
      model: buildLearnerModel(content.graph, profile, attempts, allPriors),
      misconceptionEvents,
      lastStreak: streakUpdate,
      lastPlacement: placement,
      lastPaper: { kind: paper.kind, results },
      paper: null,
      active: null,
      graded: null,
      workingSchematic: null,
      route: 'examReport',
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

  /**
   * A drill aimed at one error rather than one topic.
   *
   * The bank is restricted to items that can actually detect the misconception,
   * which is what makes the result mean anything: a clean run through items
   * that could not have caught the error proves nothing about whether it is
   * gone. CAT still does the serving, and with `minItems` at 8 a five-item
   * drill can only end by exhausting its bank — so every selected item is
   * asked, and the habit gets tested across each topic in the set rather than
   * the session converging after two.
   */
  startDrill(misconceptionId) {
    const { content, model } = get();
    if (!content || !model) return;

    // Aim the drill at the learner's ability *in the topics where this error
    // actually fires*, not at a global average. Someone who drops signs only in
    // op-amp work should meet op-amp-level questions, and a whole-model mean
    // would pull that toward whatever else they have practised most.
    const affected = get()
      .misconceptionEvents.filter((e) => e.misconceptionId === misconceptionId)
      .map((e) => e.kcId);
    const thetas = [...new Set(affected)]
      .map((kc) => model.abilities.get(kc)?.theta)
      .filter((t): t is number => t !== undefined);
    const ability = thetas.length > 0 ? thetas.reduce((a, b) => a + b, 0) / thetas.length : undefined;

    const chosen = assembleDrill(misconceptionId, drillCandidates(content.items), {
      attempted: model.attemptedItemIds,
      ...(ability !== undefined ? { ability } : {}),
    });
    if (chosen.length === 0) return;

    const wanted = new Set(chosen.map((c) => c.itemId));
    const items = content.items.filter((item) => wanted.has(item.id));
    const { bank, itemsById } = buildBank(items);

    const kcIds = [...new Set(chosen.map((c) => c.kcId))];
    const priors = new Map(
      kcIds.map((kc) => [kc, model.pMastery.get(kc) ?? DEFAULT_CAT_CONFIG.bkt.pInit]),
    );

    beginSession(set, get, {
      mode: 'drill',
      cat: createCatSession(kcIds, priors),
      bank,
      itemsById,
      drillTarget: misconceptionId,
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
    const { cat, bank, itemsById, content, storage, sessionId, mode, paper } = get();
    if (!cat || !content || !storage || !sessionId) return;

    // A paper walks its queue to the end and then grades. It never consults
    // the adaptive stopping rule, which would happily end the sitting early
    // having decided it knows enough — true, and not what an exam is for.
    if (paper) {
      const next = paper.cursor + 1;
      const entry = paper.served[next];
      const catItem = entry ? bank.find((b) => b.id === entry.itemId) : undefined;
      if (catItem) {
        set({
          paper: { ...paper, cursor: next },
          active: activeItemFor(catItem, itemsById, get().model),
          graded: null,
          hintsShown: 0,
          workingSchematic: null,
        });
        return;
      }
      await get().finishPaper();
      return;
    }

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

    const drillTarget = get().drillTarget;

    if (mode === 'challenge' && get().challengeCourse) {
      challenge = gradeChallenge(get().challengeCourse!, content.graph, get().challengeResponses);
    } else if (mode === 'drill') {
      // Deliberately no placement inference. A drill is five items chosen for
      // one property, not a sample of the learner's ability, and propagating
      // priors from it would push conclusions about a whole course out of a set
      // that was never representative of one.
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

    const [attempts, allPriors, misconceptionEvents] = await Promise.all([
      storage.listAttempts(),
      storage.listPriors(),
      storage.listMisconceptionEvents(),
    ]);

    let drill: DrillResult | null = null;
    if (mode === 'drill' && drillTarget) {
      const inSession = attempts.filter((a) => a.sessionId === sessionId);
      drill = {
        misconceptionId: drillTarget,
        asked: inSession.length,
        correct: inSession.filter((a) => a.correct).length,
        refired: misconceptionEvents.filter(
          (e) => e.misconceptionId === drillTarget && inSession.some((a) => a.id === e.attemptId),
        ).length,
      };
    }

    set({
      profile,
      model: buildLearnerModel(content.graph, profile, attempts, allPriors),
      misconceptionEvents,
      lastPlacement: placement,
      lastChallenge: challenge,
      lastStreak: streakUpdate,
      lastDrill: drill,
      active: null,
      graded: null,
      workingSchematic: null,
      route: mode === 'drill' ? 'misconceptions' : 'report',
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

/**
 * How many questions a paper of a given length should hold.
 *
 * Two and a half minutes an item is the pace a written engineering exam is
 * usually set at, and it is the number that makes the clock mean something:
 * a 30-item paper in 75 minutes puts real time pressure on, where 12 items
 * would measure knowledge and nothing else. Capped so a 150-minute final does
 * not produce a paper nobody will finish in one sitting.
 */
export const examSizeFor = (minutes: number): number =>
  Math.max(10, Math.min(45, Math.round(minutes / 2.5)));

/** A triage run is one sitting across every upcoming exam, so it stays short. */
export const DEFAULT_TRIAGE_SIZE = 24;

const isItem = (item: Item | undefined): item is Item => item !== undefined;

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
    drillTarget?: string;
    paper?: PaperSession;
  },
): void {
  // A paper is served in its own order. Letting the adaptive selector choose
  // the opening question would undo the coverage the paper was assembled for.
  const first = options.paper
    ? options.bank.find((b) => b.id === options.paper?.served[0]?.itemId)
    : selectNextItem(options.cat, options.bank, DEFAULT_CAT_CONFIG);
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
    drillTarget: options.drillTarget ?? null,
    workingSchematic: null,
    paper: options.paper ?? null,
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
  const { active, cat, storage, sessionId, hintsShown, mode, paper } = get();
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
    // Carried onto the attempt rather than looked up at replay time, because
    // the replay reads the attempt log and not the bank: an item whose weight
    // changes later must not silently rescore attempts already made under the
    // old one.
    ...(active.item.evidenceWeight !== undefined ? { evidenceWeight: active.item.evidenceWeight } : {}),
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

  // A sealed exam shows nothing back until it is handed in. `graded` is left
  // unset rather than set and then cleared, because clearing it a tick later
  // flashes the answer on screen — which is the one thing sealing is for.
  const sealed = paper?.kind === 'exam';

  set({
    graded: sealed
      ? null
      : {
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
    ...(paper
      ? {
          paper: {
            ...paper,
            responses: [
              ...paper.responses,
              {
                itemId: active.item.id,
                kcRefs: active.item.kcRefs.map((r) => ({ kc: r.kc, weight: r.weight })),
                correct,
                latencyMs: attempt.latencyMs,
                misconceptions: attempt.misconceptions,
                // Measured from the start of the sitting, not from the start of
                // the item: whether this answer landed before the bell is a
                // fact about the paper, and per-item latencies cannot be summed
                // to recover it once the learner pauses between questions.
                atElapsedMs: Date.now() - paper.startedAt,
              },
            ],
          },
        }
      : {}),
    ...(mode === 'challenge'
      ? {
          challengeResponses: [
            ...get().challengeResponses,
            { kcIds: active.item.kcRefs.map((r) => r.kc), correct },
          ],
        }
      : {}),
  });

  if (sealed) await get().advance();
}

/** Re-exported so the circuit lab can parse a pasted deck without importing twice. */
export { parseNetlist };
