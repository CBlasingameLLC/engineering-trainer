import { parse as parseYaml } from 'yaml';
import { parseCourse, prerequisiteEdges, type CourseDefinition } from './curriculum.js';
import { parsePack, type Pack } from './pack.js';

/**
 * Parsing curriculum and pack documents.
 *
 * Deliberately free of filesystem access: the CLI reads files with `fs`, while
 * the desktop app reads them through the Tauri shim. Keeping I/O out means the
 * same parsing and validation runs in both, and stays unit-testable.
 */

export interface LoadIssue {
  source: string;
  path: string;
  message: string;
}

export interface LoadedCurriculum {
  courses: CourseDefinition[];
  issues: LoadIssue[];
}

/** Parse one course document from YAML or JSON text. */
export function parseCourseDocument(
  text: string,
  source: string,
): { course?: CourseDefinition; issues: LoadIssue[] } {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return { issues: [{ source, path: '(root)', message: `unparseable: ${(error as Error).message}` }] };
  }

  const result = parseCourse(raw);
  return result.ok && result.course
    ? { course: result.course, issues: [] }
    : { issues: result.issues.map((i) => ({ source, ...i })) };
}

/** Parse many course documents and cross-check their references. */
export function loadCurriculum(documents: { source: string; text: string }[]): LoadedCurriculum {
  const courses: CourseDefinition[] = [];
  const issues: LoadIssue[] = [];

  for (const doc of documents) {
    const result = parseCourseDocument(doc.text, doc.source);
    if (result.course) courses.push(result.course);
    issues.push(...result.issues);
  }

  issues.push(...crossReferenceIssues(courses));
  return { courses, issues };
}

/**
 * Checks that only make sense once every course is loaded: a prerequisite may
 * point into another course, so a dangling reference cannot be detected until
 * the whole set is present.
 */
function crossReferenceIssues(courses: readonly CourseDefinition[]): LoadIssue[] {
  const issues: LoadIssue[] = [];
  const known = new Set<string>();
  const owner = new Map<string, string>();

  for (const course of courses) {
    for (const kc of course.kcs) {
      if (known.has(kc.id)) {
        issues.push({
          source: course.code,
          path: `kcs.${kc.id}`,
          message: `KC id "${kc.id}" is already defined in ${owner.get(kc.id)}`,
        });
      }
      known.add(kc.id);
      owner.set(kc.id, course.code);
    }
  }

  for (const course of courses) {
    for (const kc of course.kcs) {
      for (const edge of prerequisiteEdges(kc)) {
        if (!known.has(edge.from)) {
          issues.push({
            source: course.code,
            path: `kcs.${kc.id}.prerequisites`,
            message: `prerequisite "${edge.from}" is not defined by any loaded course`,
          });
        }
      }
    }
  }

  return issues;
}

/** Flatten loaded courses into the node and edge lists a KcGraph consumes. */
export function toGraphInput(courses: readonly CourseDefinition[]) {
  const kcs = courses.flatMap((course) =>
    course.kcs.map((kc) => ({
      id: kc.id,
      courseId: course.code,
      title: kc.title,
      unit: kc.unit,
      domain: kc.domain,
      competencies: kc.competencies,
      difficultyPrior: kc.difficultyPrior,
      ...(kc.description ? { description: kc.description } : {}),
    })),
  );
  const edges = courses.flatMap((course) => course.kcs.flatMap((kc) => prerequisiteEdges(kc)));
  return { kcs, edges };
}

/** Parse a pack document from YAML or JSON text. */
export function parsePackDocument(
  text: string,
  source: string,
): { pack?: Pack; issues: LoadIssue[] } {
  let raw: unknown;
  try {
    raw = parseYaml(text);
  } catch (error) {
    return { issues: [{ source, path: '(root)', message: `unparseable: ${(error as Error).message}` }] };
  }

  const result = parsePack(raw);
  return result.ok && result.pack
    ? { pack: result.pack, issues: [] }
    : { issues: result.issues.map((i) => ({ source, ...i })) };
}
