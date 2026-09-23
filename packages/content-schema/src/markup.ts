/**
 * Item prose is a tiny markup language, and this module is its only definition.
 *
 * The renderer typesets `$...$` spans with KaTeX and leaves everything else as
 * text. That means a LaTeX macro written *outside* a `$...$` span does not
 * render — it reaches the learner as literal source. `A 12\,\text{V} source`
 * is what that failure looks like on screen, and it is invisible from every
 * other gate the content passes: the answer is right, the explanation agrees,
 * the generator regenerates, and the item is still unreadable.
 *
 * Both the renderer and `pack verify` import from here, so the check tests the
 * behaviour the app actually has rather than a second opinion about it.
 */

export interface Segment {
  kind: 'text' | 'math' | 'display';
  value: string;
}

/**
 * Split prose into text, inline maths and display maths.
 *
 * `$$...$$` has to be recognised before `$...$`, and getting that order wrong
 * is not a cosmetic bug: scanning for a single `$` reads `$$F = A + B$$` as an
 * empty inline span, then the formula as plain text, then another empty span —
 * so an entire equation renders as its own source. Every `\begin{aligned}`
 * system in the linear-algebra bank failed exactly this way.
 *
 * An unclosed delimiter yields a text segment containing the rest, matching
 * what the renderer does: show the source rather than silently drop it.
 */
export function segmentMarkup(source: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;

  const pushText = (value: string): void => {
    if (value.length > 0) segments.push({ kind: 'text', value });
  };

  while (index < source.length) {
    const start = source.indexOf('$', index);
    if (start === -1) {
      pushText(source.slice(index));
      break;
    }
    pushText(source.slice(index, start));

    const display = source.startsWith('$$', start);
    const delimiter = display ? '$$' : '$';
    const end = source.indexOf(delimiter, start + delimiter.length);
    if (end === -1) {
      pushText(source.slice(start));
      break;
    }
    segments.push({
      kind: display ? 'display' : 'math',
      value: source.slice(start + delimiter.length, end),
    });
    index = end + delimiter.length;
  }

  return segments;
}

/**
 * Constructs that only mean anything inside maths mode.
 *
 * - a control sequence (`\Omega`, `\frac`, `\text`) or a spacing escape (`\,`)
 * - a braced sub/superscript (`V_{th}`, `10^{-3}`) — the bare forms `x_1` and
 *   `2^n` are ambiguous enough in prose that flagging them costs more than it
 *   catches, but a brace after one is unmistakably LaTeX
 */
const MATH_ONLY = /\\[a-zA-Z]+|\\[,;!:]|[_^]\{/;

export interface MarkupProblem {
  /** The offending run of text, trimmed for a readable message. */
  excerpt: string;
  reason: 'undelimited-latex' | 'unbalanced-delimiter';
}

/**
 * Report maths markup that will not be typeset.
 *
 * Returns an empty array for prose that renders as written.
 */
export function findMarkupProblems(source: string): MarkupProblem[] {
  const problems: MarkupProblem[] = [];

  // A trailing text run that still opens with `$` is a span that never closed.
  const segments = segmentMarkup(source);
  const last = segments.at(-1);
  if (last?.kind === 'text' && last.value.startsWith('$')) {
    problems.push({ excerpt: excerptAround(last.value, 0), reason: 'unbalanced-delimiter' });
  }

  for (const segment of segments) {
    if (segment.kind !== 'text') continue;
    const match = MATH_ONLY.exec(segment.value);
    if (match) {
      problems.push({
        excerpt: excerptAround(segment.value, match.index),
        reason: 'undelimited-latex',
      });
    }
  }

  return problems;
}

function excerptAround(source: string, at: number, radius = 28): string {
  const start = Math.max(0, at - radius);
  const end = Math.min(source.length, at + radius);
  return `${start > 0 ? '…' : ''}${source.slice(start, end).replace(/\s+/g, ' ')}${end < source.length ? '…' : ''}`;
}
