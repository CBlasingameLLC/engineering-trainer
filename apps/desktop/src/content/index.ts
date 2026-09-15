import { KcGraph, type Kc, type KcEdge } from '@et/domain';
import { parse as parseYaml } from 'yaml';
import {
  loadCurriculum, parseCredentialCatalog, parsePack, toGraphInput,
  type CourseDefinition, type Credential, type Item, type Pack,
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

export interface LoadedContent {
  graph: KcGraph;
  courses: CourseDefinition[];
  packs: Pack[];
  items: Item[];
  credentials: Credential[];
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

  cached = { graph, courses, packs, items: packs.flatMap((p) => p.items), credentials, issues };
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
