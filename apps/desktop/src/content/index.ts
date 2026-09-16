import { KcGraph, type DrillCandidate, type Kc, type KcEdge } from '@et/domain';
import { parse as parseYaml } from 'yaml';
import {
  loadCurriculum, parseCredentialCatalog, parseMisconceptionCatalog, parsePack, toGraphInput,
  type CourseDefinition, type Credential, type Item, type MisconceptionFamily, type Pack,
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

export interface LoadedContent {
  graph: KcGraph;
  courses: CourseDefinition[];
  packs: Pack[];
  items: Item[];
  credentials: Credential[];
  /** Misconception -> the habit it belongs to. Empty if no catalog ships. */
  misconceptionFamilies: Map<string, MisconceptionFamily>;
  misconceptionTitles: Map<string, string>;
  /** Problems found while loading. Surfaced rather than swallowed. */
  issues: string[];
}

let cached: LoadedContent | null = null;

export function loadContent(): LoadedContent {
  if (cached) return cached;

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

  cached = {
    graph, courses, packs, items: packs.flatMap((p) => p.items), credentials,
    misconceptionFamilies, misconceptionTitles, issues,
  };
  return cached;
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
