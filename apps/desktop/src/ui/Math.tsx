import { useMemo } from 'react';
import katex from 'katex';

/**
 * Inline KaTeX rendering.
 *
 * Item text mixes prose with maths - `Find $V_{th}$ across $a$-$b$` - so the
 * renderer splits on `$...$` and typesets only the delimited spans. KaTeX is
 * synchronous, which matters: an item that reflows after paint reads as a
 * stutter on every question.
 */

interface MathTextProps {
  children: string;
  className?: string;
}

interface Segment {
  kind: 'text' | 'math';
  value: string;
}

function segment(source: string): Segment[] {
  const segments: Segment[] = [];
  let index = 0;

  while (index < source.length) {
    const start = source.indexOf('$', index);
    if (start === -1) {
      segments.push({ kind: 'text', value: source.slice(index) });
      break;
    }
    if (start > index) segments.push({ kind: 'text', value: source.slice(index, start) });

    const end = source.indexOf('$', start + 1);
    if (end === -1) {
      // Unbalanced delimiter: render the rest literally rather than losing it.
      segments.push({ kind: 'text', value: source.slice(start) });
      break;
    }
    segments.push({ kind: 'math', value: source.slice(start + 1, end) });
    index = end + 1;
  }

  return segments;
}

/** Bare `**bold**` spans appear in item stems for emphasis on the decisive word. */
function renderEmphasis(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-slate-900">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-t${i}`}>{part}</span>
    ),
  );
}

export function MathText({ children, className }: MathTextProps): React.ReactElement {
  const segments = useMemo(() => segment(children), [children]);

  return (
    <span className={className}>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={`s${i}`}>{renderEmphasis(seg.value, `s${i}`)}</span>
        ) : (
          <span
            key={`s${i}`}
            // KaTeX output is generated from item content we author and verify,
            // never from learner input.
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(seg.value, { throwOnError: false, displayMode: false }),
            }}
          />
        ),
      )}
    </span>
  );
}
