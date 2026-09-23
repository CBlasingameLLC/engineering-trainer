import { useMemo } from 'react';
import katex from 'katex';
import { segmentMarkup, type Segment } from '@et/content-schema';

/**
 * Inline KaTeX rendering.
 *
 * Item text mixes prose with maths - `Find $V_{th}$ across $a$-$b$` - so the
 * renderer splits on `$...$` and typesets only the delimited spans. KaTeX is
 * synchronous, which matters: an item that reflows after paint reads as a
 * stutter on every question.
 *
 * The split itself lives in `@et/content-schema` because `pack verify` needs
 * the same one: its `latex-delimiters` check rejects maths written outside a
 * span, and a check that segmented text differently from the renderer would be
 * auditing something other than what the learner sees.
 */

interface MathTextProps {
  children: string;
  className?: string;
}

/** Bare `**bold**` spans appear in item stems for emphasis on the decisive word. */
function renderEmphasis(text: string, keyPrefix: string): React.ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') ? (
      <strong key={`${keyPrefix}-b${i}`} className="font-semibold text-slate-900 dark:text-slate-100">
        {part.slice(2, -2)}
      </strong>
    ) : (
      <span key={`${keyPrefix}-t${i}`}>{part}</span>
    ),
  );
}

export function MathText({ children, className }: MathTextProps): React.ReactElement {
  const segments = useMemo<Segment[]>(() => segmentMarkup(children), [children]);

  return (
    // `pre-line` keeps the newlines generators write between a premise and the
    // question it asks. Without it every stem collapses into one paragraph and
    // the question disappears into the middle of the setup.
    <span className={`whitespace-pre-line ${className ?? ''}`}>
      {segments.map((seg, i) =>
        seg.kind === 'text' ? (
          <span key={`s${i}`}>{renderEmphasis(seg.value, `s${i}`)}</span>
        ) : (
          <span
            key={`s${i}`}
            // `whitespace-normal` undoes the wrapper's `pre-line` inside KaTeX's
            // own markup, which lays out with explicit spacing and must not have
            // source whitespace reinterpreted as line breaks.
            className={
              seg.kind === 'display'
                ? 'my-2 block overflow-x-auto whitespace-normal text-center'
                : 'whitespace-normal'
            }
            // KaTeX output is generated from item content we author and verify,
            // never from learner input.
            dangerouslySetInnerHTML={{
              __html: katex.renderToString(seg.value, {
                throwOnError: false,
                displayMode: seg.kind === 'display',
              }),
            }}
          />
        ),
      )}
    </span>
  );
}
