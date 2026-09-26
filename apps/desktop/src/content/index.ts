import { KcGraph, type DrillCandidate, type Kc, type KcEdge } from '@et/domain';
import { NO_SIDELOAD, type Sideload } from '@/content/sideload';
import { parse as parseYaml } from 'yaml';
import {
  checkTermUnits, loadCurriculum, parseCredentialCatalog, parseMisconceptionCatalog, parsePack,
  parseTerm, toGraphInput,
  type CourseDefinition, type Credential, type Item, type MisconceptionFamily, type Pack,
  type Term,
} from '@et/content-schema';

/**
 * Bundled content.
 *
 * Curriculum and item banks are compiled into the build rather than fetched, so
 * the app works offline from first launch with no sync step. Imported packs
 * from `content/inbox` are layered on top at runtime through the storage
 * adapter; these are the defaults that ship.
 */

// Vite resolves these at build time. `eager` keeps startup synchronous - the
// graph has to exist before the first route renders.
const curriculumFiles = import.meta.glob('../../../../content/curriculum/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const packFiles = import.meta.glob('../../../../content/packs/shared/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

/**
 * Personal-only packs, which are bundled only when a build asks for them.
 *
 * The quarantine had a hole in it, and it was the useless direction: packs
 * under `content/packs/personal/` are gitignored and excluded from a release,
 * but nothing loaded them *ever*, so owned material could not sharpen the
 * owner's own training either. That is a rule with all of the cost and none
 * of the benefit.
 *
 * The distinction that matters is not development against production — the
 * learner's own installer is a production build — but redistributable against
 * personal. So it is an explicit opt-in at build time:
 *
 *     VITE_ET_INCLUDE_PERSONAL=1 pnpm tauri build
 *
 * Default off, so every artifact built without thinking about it is safe to
 * hand to someone else, and CI never sets it. The glob itself is unconditional
 * because `import.meta.glob` is resolved statically; the flag decides whether
 * the results are used, and an unused eager glob over an empty directory costs
 * nothing.
 */
const personalPackFiles = import.meta.glob('../../../../content/packs/personal/*.json', {
  eager: true,
  import: 'default',
}) as Record<string, unknown>;

const includePersonal = import.meta.env.VITE_ET_INCLUDE_PERSONAL === '1';

const credentialFiles = import.meta.glob('../../../../content/credentials/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Kept out of `content/curriculum/` deliberately: everything in that directory
// is parsed as a course document, so a catalog placed there would fail to load
// and report itself as a malformed course.
const misconceptionFiles = import.meta.glob('../../../../content/misconceptions/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

// Terms are content, not preference: the schedule is a fact about the course,
// the same as the prerequisite graph, and belongs in version control beside it.
// What the learner *chooses* to study within it stays in the attempt log.
const termFiles = import.meta.glob('../../../../content/terms/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

export interface LoadedContent {
  graph: KcGraph;
  courses: CourseDefinition[];
  packs: Pack[];
  items: Item[];
  credentials: Credential[];
  /** Misconception -> the habit it belongs to. Empty if no catalog ships. */
  misconceptionFamilies: Map<string, MisconceptionFamily>;
  misconceptionTitles: Map<string, string>;
  /** Declared terms, newest start first. */
  terms: Term[];
  /**
   * Courses a term lists that the graph has never heard of.
   *
   * Reported rather than dropped: "this is on your term and the app knows
   * nothing about it" is useful, and the alternative is a schedule that
   * quietly disagrees with the schedule.
   */
  termCoursesWithoutGraph: string[];
  /**
   * How many loaded items are personal-only.
   *
   * Reported so the number is visible rather than inferred: a build that
   * contains owned material should say so, both to keep the learner honest
   * about where a question came from and to make an accidental inclusion
   * obvious instead of silent.
   */
  personalItemCount: number;
  /**
   * Packs read from the runtime folder rather than compiled into the build.
   *
   * Listed by name and size because the learner is the one who put them there
   * and is the only person who can tell a pack that failed to load from a pack
   * they forgot to copy.
   */
  sideloadedPacks: { name: string; items: number; personal: boolean }[];
  /** Absolute path of that folder, or null in a build that has none. */
  sideloadDir: string | null;
  /** Whether this build reads a packs folder at all. False in the browser. */
  sideloadSupported: boolean;
  /**
   * Items dropped because their id was already loaded.
   *
   * An item loaded twice counts twice as evidence, which quietly doubles the
   * weight of whatever it measures. The bundled packs cannot collide with each
   * other — `generatorsForCourse` routes a generator to exactly one pack — but
   * a sideloaded copy of a pack that also shipped can, and silently.
   */
  duplicateItemIds: string[];
  /** Problems found while loading. Surfaced rather than swallowed. */
  issues: string[];
}

let cached: LoadedContent | null = null;
let cachedFor = '';

/**
 * Load everything the app knows about.
 *
 * `sideloaded` is the learner's own packs, read from disk by the caller before
 * this runs — the read is asynchronous and this is not, because the graph has
 * to exist before the first route renders.
 *
 * The cache is keyed on which files were handed in rather than being a plain
 * singleton, so a second call with different packs rebuilds instead of
 * returning the first call's answer. A cache that ignores its argument is the
 * kind of thing that works until the day something calls it twice.
 */
export function loadContent(sideloaded: Sideload = NO_SIDELOAD): LoadedContent {
  const signature = sideloaded.files.map((f) => `${f.name}:${f.text.length}`).join('|');
  if (cached && cachedFor === signature) return cached;

  const documents = Object.entries(curriculumFiles).map(([path, text]) => ({
    source: path.split('/').pop() ?? path,
    text,
  }));

  const { courses, issues: curriculumIssues } = loadCurriculum(documents);
  const issues = curriculumIssues.map((i) => `${i.source} ${i.path}: ${i.message}`);

  const { kcs, edges } = toGraphInput(courses);
  let graph: KcGraph;
  try {
    graph = new KcGraph(kcs as Kc[], edges as KcEdge[]);
  } catch (error) {
    // A malformed graph is unrecoverable, but an empty one still renders a
    // readable error screen rather than a blank window.
    issues.push((error as Error).message);
    graph = new KcGraph([], []);
  }

  const packs: Pack[] = [];
  for (const [path, raw] of Object.entries(packFiles)) {
    const result = parsePack(raw);
    if (result.pack) packs.push(result.pack);
    else issues.push(...result.issues.map((i) => `${path.split('/').pop()} ${i.path}: ${i.message}`));
  }

  let personalItems = 0;
  if (includePersonal) {
    for (const [path, raw] of Object.entries(personalPackFiles)) {
      const result = parsePack(raw);
      if (result.pack) {
        packs.push(result.pack);
        personalItems += result.pack.items.length;
      } else {
        issues.push(...result.issues.map((i) => `${path.split('/').pop()} ${i.path}: ${i.message}`));
      }
    }
  }

  /*
   * Packs from the runtime folder.
   *
   * Loaded after the bundled ones so the dedupe below prefers what shipped: if
   * a learner has a copy of a pack that is also in the build, the build's copy
   * is the one the gate verified in CI.
   *
   * Every failure here is reported and none is fatal. This folder is edited by
   * hand, so a half-written file is an ordinary Tuesday rather than a
   * corrupted installation, and the app has to keep working without it.
   */
  const sideloadedPacks: LoadedContent['sideloadedPacks'] = [];
  if (sideloaded.error) {
    issues.push(`packs folder: ${sideloaded.error}`);
  }
  for (const file of sideloaded.files) {
    if (file.text.length === 0) {
      issues.push(`${file.name}: could not be read`);
      continue;
    }
    let raw: unknown;
    try {
      raw = JSON.parse(file.text);
    } catch (error) {
      issues.push(`${file.name}: not valid JSON — ${(error as Error).message}`);
      continue;
    }
    const result = parsePack(raw);
    if (!result.pack) {
      issues.push(...result.issues.map((i) => `${file.name} ${i.path}: ${i.message}`));
      continue;
    }
    packs.push(result.pack);
    const personal = result.pack.items.filter(
      (item) => item.provenance.licenseTier === 'personal-only',
    ).length;
    personalItems += personal;
    sideloadedPacks.push({ name: file.name, items: result.pack.items.length, personal: personal > 0 });
  }

  const credentials: Credential[] = [];
  for (const [path, text] of Object.entries(credentialFiles)) {
    const name = path.split('/').pop() ?? path;
    try {
      const result = parseCredentialCatalog(parseYaml(text));
      if (result.catalog) credentials.push(...result.catalog.credentials);
      else issues.push(...result.issues.map((i) => `${name} ${i.path}: ${i.message}`));
    } catch (error) {
      issues.push(`${name}: ${(error as Error).message}`);
    }
  }

  const misconceptionFamilies = new Map<string, MisconceptionFamily>();
  const misconceptionTitles = new Map<string, string>();
  for (const [path, text] of Object.entries(misconceptionFiles)) {
    const name = path.split('/').pop() ?? path;
    try {
      const result = parseMisconceptionCatalog(parseYaml(text));
      if (result.catalog) {
        const byId = new Map(result.catalog.families.map((f) => [f.id, f]));
        for (const entry of result.catalog.misconceptions) {
          const family = byId.get(entry.family);
          if (family) misconceptionFamilies.set(entry.id, family);
          misconceptionTitles.set(entry.id, entry.title);
        }
      } else {
        issues.push(...result.issues.map((i) => `${name} ${i.path}: ${i.message}`));
      }
    } catch (error) {
      issues.push(`${name}: ${(error as Error).message}`);
    }
  }

  const terms: Term[] = [];
  const termCoursesWithoutGraph = new Set<string>();
  const unitsByCourse = new Map<string, Set<string>>();
  for (const kc of graph.kcs.values()) {
    const set = unitsByCourse.get(kc.courseId) ?? new Set<string>();
    set.add(kc.unit);
    unitsByCourse.set(kc.courseId, set);
  }
  for (const [path, text] of Object.entries(termFiles)) {
    const name = path.split('/').pop() ?? path;
    try {
      const result = parseTerm(parseYaml(text));
      if (!result.term) {
        issues.push(...result.issues.map((i) => `${name} ${i.path}: ${i.message}`));
        continue;
      }
      terms.push(result.term);
      for (const issue of checkTermUnits(result.term, unitsByCourse)) {
        // `pack validate` already refuses a bad unit name, so anything reaching
        // here is the benign case: a course on the term with no graph yet.
        const course = /^([A-Z]{2,4}\d{4})/.exec(issue.message)?.[1];
        if (course) termCoursesWithoutGraph.add(course);
        else issues.push(`${name} ${issue.path}: ${issue.message}`);
      }
    } catch (error) {
      issues.push(`${name}: ${(error as Error).message}`);
    }
  }
  terms.sort((a, b) => b.startsOn.localeCompare(a.startsOn));

  // One item, one id. Everything downstream — the Elo update, the BKT blend,
  // the misconception tally — treats each attempt as independent evidence, so
  // an item present twice is a thumb on the scale for whatever it measures.
  const seen = new Set<string>();
  const duplicateItemIds: string[] = [];
  const items: Item[] = [];
  for (const item of packs.flatMap((p) => p.items)) {
    if (seen.has(item.id)) {
      duplicateItemIds.push(item.id);
      continue;
    }
    seen.add(item.id);
    items.push(item);
  }
  if (duplicateItemIds.length > 0) {
    issues.push(
      `${duplicateItemIds.length} item ${duplicateItemIds.length === 1 ? 'id was' : 'ids were'} ` +
        `loaded more than once and the later copy was dropped: ${duplicateItemIds.slice(0, 5).join(', ')}` +
        `${duplicateItemIds.length > 5 ? ', …' : ''}`,
    );
  }

  cached = {
    graph, courses, packs, items, credentials,
    misconceptionFamilies, misconceptionTitles,
    terms, termCoursesWithoutGraph: [...termCoursesWithoutGraph].sort(),
    personalItemCount: personalItems,
    sideloadedPacks,
    sideloadDir: sideloaded.dir,
    sideloadSupported: sideloaded.supported,
    duplicateItemIds,
    issues,
  };
  cachedFor = signature;
  return cached;
}

/**
 * The term in progress, or the next one to start.
 *
 * Falling back to the nearest term rather than to nothing means the view is
 * useful in the gap between semesters, which is exactly when someone would sit
 * down to close a prerequisite gap before it costs them.
 */
export function currentTerm(content: LoadedContent, now: Date = new Date()): Term | undefined {
  const today = now.toISOString().slice(0, 10);
  const running = content.terms.find((t) => t.startsOn <= today && today <= t.endsOn);
  if (running) return running;
  const upcoming = [...content.terms].filter((t) => t.startsOn > today).sort((a, b) => a.startsOn.localeCompare(b.startsOn));
  return upcoming[0] ?? content.terms[0];
}

/** Items exercising any of the given KCs. */
export const itemsForKcs = (items: readonly Item[], kcIds: ReadonlySet<string>): Item[] =>
  items.filter((item) => item.kcRefs.some((ref) => kcIds.has(ref.kc)));

/** Items belonging to a course, by KC ownership rather than pack metadata. */
export function itemsForCourses(content: LoadedContent, courseCodes: readonly string[]): Item[] {
  const wanted = new Set(courseCodes);
  const kcIds = new Set(
    [...content.graph.kcs.values()].filter((kc) => wanted.has(kc.courseId)).map((kc) => kc.id),
  );
  return itemsForKcs(content.items, kcIds);
}

/**
 * Items reduced to what the drill assembler needs.
 *
 * `diagnoses` is the load-bearing field: an item can only take part in a drill
 * for an error it is able to *detect*, which means a tagged distractor or a
 * matching trap. Items that merely touch the same KC would grade the learner
 * without ever testing the thing being remediated.
 */
export function drillCandidates(items: readonly Item[]): DrillCandidate[] {
  const candidates: DrillCandidate[] = [];

  for (const item of items) {
    const diagnoses = new Set<string>();
    for (const trap of item.misconceptionTraps) diagnoses.add(trap.misconception);
    for (const option of item.options) if (option.misconception) diagnoses.add(option.misconception);
    if (diagnoses.size === 0) continue;

    const primary = [...item.kcRefs].sort((a, b) => b.weight - a.weight)[0];
    if (!primary) continue;

    candidates.push({
      itemId: item.id,
      kcId: primary.kc,
      difficultyB: item.difficultyB,
      diagnoses: [...diagnoses],
    });
  }

  return candidates;
}
