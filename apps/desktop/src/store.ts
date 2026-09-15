import { create } from 'zustand';
import {
  DEFAULT_CAT_CONFIG,
  createCatSession,
  finalizePlacement,
  recordResponse,
  selectNextItem,
  shouldStop,
  type CatItem,
  type CatSessionState,
  type KcId,
  type PlacementResult,
} from '@et/domain';
import { checkAnswer, type CheckResult, type Response } from '@et/answer-engine';
import type { Item } from '@et/content-schema';
import { loadContent, itemsForCourses, type LoadedContent } from '@/content';
import { buildLearnerModel, type LearnerModel } from '@/features/learner-model';
import { WebStorageAdapter } from '@/storage/web';
import { TauriSqlAdapter, isTauri } from '@/storage/tauri';
import {
  emptyProfile,
  type AttemptRecord,
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

type Route = 'loading' | 'onboarding' | 'dashboard' | 'session' | 'report';

export interface ActiveItem {
  item: Item;
  catItem: CatItem;
  startedAt: number;
}

export interface Graded {
  result: CheckResult;
  item: Item;
  /** The learner's raw response, for showing what they entered. */
  submitted: string;
}

interface AppState {
  route: Route;
  content: LoadedContent | null;
  storage: StorageAdapter | null;
  profile: Profile;
  model: LearnerModel | null;

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
  lastPlacement: PlacementResult | null;

  boot(): Promise<void>;
  completeOnboarding(courses: CompletedCourse[], targetTerm: string): Promise<void>;
  startPlacement(courseCodes: string[]): void;
  submit(response: Response, raw: string): Promise<void>;
  advance(): Promise<void>;
  showHint(): void;
  goTo(route: Route): void;
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
  lastPlacement: null,

  async boot() {
    const content = loadContent();
    // SQLite under the desktop shell, IndexedDB in a browser. The renderer
    // never learns which, so the same code path is exercised either way.
    const storage: StorageAdapter = isTauri() ? new TauriSqlAdapter() : new WebStorageAdapter();
    await storage.init();

    const profile = await storage.getProfile();
    const [attempts, priors] = await Promise.all([storage.listAttempts(), storage.listPriors()]);
    const model = buildLearnerModel(content.graph, profile, attempts, priors);

    set({
      content,
      storage,
      profile,
      model,
      route: profile.onboarded ? 'dashboard' : 'onboarding',
    });
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
    const cat = createCatSession(targetKcs, priors);
    const first = selectNextItem(cat, bank, DEFAULT_CAT_CONFIG);

    set({
      mode: 'placement',
      sessionId: uid(),
      cat,
      bank,
      itemsById,
      active: first ? { item: itemsById.get(first.id)!, catItem: first, startedAt: Date.now() } : null,
      graded: null,
      hintsShown: 0,
      answered: 0,
      correctCount: 0,
      route: 'session',
    });
  },

  async submit(response, raw) {
    const { active, cat, storage, sessionId, hintsShown } = get();
    if (!active || !cat || !storage || !sessionId || get().graded) return;

    const result = checkAnswer(response, active.item);

    // A parse failure is not a wrong answer - the learner never got to be
    // right or wrong - so it is shown for correction and never recorded.
    if (result.outcome === 'unparseable' || result.outcome === 'wrong-dimension') {
      set({ graded: { result, item: active.item, submitted: raw } });
      return;
    }

    const attempt: AttemptRecord = {
      id: uid(),
      sessionId,
      itemId: active.item.id,
      kcRefs: active.item.kcRefs.map((r) => ({ kc: r.kc, weight: r.weight })),
      correct: result.correct,
      latencyMs: Date.now() - active.startedAt,
      hintsUsed: hintsShown,
      misconceptions: result.misconception ? [result.misconception] : [],
      at: new Date(),
      ...(active.item.type === 'multiple-choice' ? { optionCount: active.item.options.length } : {}),
    };

    await storage.appendAttempt(attempt);
    if (result.misconception) {
      await storage.recordMisconceptions([
        {
          id: uid(),
          misconceptionId: result.misconception,
          kcId: active.item.kcRefs[0]!.kc,
          attemptId: attempt.id,
          at: attempt.at.toISOString(),
        },
      ]);
    }

    set({
      graded: { result, item: active.item, submitted: raw },
      cat: recordResponse(cat, active.catItem, result.correct, DEFAULT_CAT_CONFIG, {
        ...(attempt.optionCount !== undefined ? { optionCount: attempt.optionCount } : {}),
      }),
      answered: get().answered + 1,
      correctCount: get().correctCount + (result.correct ? 1 : 0),
    });
  },

  async advance() {
    const { cat, bank, itemsById, content, storage, sessionId, mode } = get();
    if (!cat || !content || !storage || !sessionId) return;

    const decision = shouldStop(cat, bank, DEFAULT_CAT_CONFIG);
    if (!decision.stop) {
      const next = selectNextItem(cat, bank, DEFAULT_CAT_CONFIG);
      if (next) {
        set({
          active: { item: itemsById.get(next.id)!, catItem: next, startedAt: Date.now() },
          graded: null,
          hintsShown: 0,
        });
        return;
      }
    }

    // Session over. Mine the prerequisite graph for everything the responses
    // imply, and persist those inferences separately from the evidence.
    const placement = finalizePlacement(cat, content.graph, decision.reason, DEFAULT_CAT_CONFIG);
    const recordedAt = new Date().toISOString();
    const priors: InferredPrior[] = [...placement.inferred.values()].map((adj) => ({
      kcId: adj.kcId,
      prior: adj.prior,
      sourceKcId: adj.source,
      distance: adj.distance,
      recordedAt,
    }));
    await storage.savePriors(priors);

    const xp = get().correctCount * 10;
    await storage.saveSession({
      id: sessionId,
      mode,
      courseIds: [],
      startedAt: recordedAt,
      endedAt: recordedAt,
      xpEarned: xp,
      summary: { itemsAdministered: placement.itemsAdministered, stopReason: placement.stopReason },
    });

    const profile: Profile = {
      ...get().profile,
      totalXp: get().profile.totalXp + xp,
      lastActiveAt: recordedAt,
    };
    await storage.saveProfile(profile);

    const [attempts, allPriors] = await Promise.all([storage.listAttempts(), storage.listPriors()]);
    set({
      profile,
      model: buildLearnerModel(content.graph, profile, attempts, allPriors),
      lastPlacement: placement,
      active: null,
      graded: null,
      route: 'report',
    });
  },

  showHint() {
    set({ hintsShown: get().hintsShown + 1 });
  },

  goTo(route) {
    set({ route });
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
      cat: null,
      active: null,
      graded: null,
      route: 'onboarding',
    });
  },
}));
