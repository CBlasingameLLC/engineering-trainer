import { useMemo } from 'react';
import katex from 'katex';
import * as math from 'mathjs';
import type { SymbolicAnswer } from '@et/content-schema';

/**
 * Expression entry with a live typeset preview.
 *
 * Typed maths is ambiguous in a way typed numbers are not. `e^-2x` is read by
 * every student as $e^{-2x}$ and by every parser as $e^{-2}\cdot x$, and
 * without a preview the learner discovers the difference only by being marked
 * wrong — which teaches them their calculus is shaky when the real fault was
 * notation. Showing the parse as it is typed makes that failure impossible to
 * mistake for a conceptual one, and costs nothing to the learner who typed what
 * they meant.
 *
 * The preview is rendered from mathjs's own `toTex()` of the parsed tree, never
 * from the raw keystrokes. That matters for more than tidiness: the LaTeX
 * handed to KaTeX is regenerated from a validated syntax tree rather than
 * echoed, so learner input cannot introduce markup of its own. KaTeX's default
 * `trust: false` refuses `\href` and friends on top of that.
 */

interface ExpressionInputProps {
  answer: SymbolicAnswer;
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
  onSubmit: () => void;
  inputRef: React.RefObject<HTMLInputElement | null>;
}

type Preview =
  | { kind: 'empty' }
  | { kind: 'ok'; html: string }
  | { kind: 'incomplete' };

function preview(source: string): Preview {
  const trimmed = source.trim();
  if (trimmed === '') return { kind: 'empty' };
  try {
    const tex = math.parse(trimmed).toTex({ parenthesis: 'auto' });
    return { kind: 'ok', html: katex.renderToString(tex, { throwOnError: false, displayMode: false }) };
  } catch {
    // Half-typed input throws constantly — `3*x +` is not an error, it is a
    // person mid-keystroke. Saying so is the honest message; saying "invalid"
    // would be alarming and wrong.
    return { kind: 'incomplete' };
  }
}

export function ExpressionInput({
  answer, value, disabled, onChange, onSubmit, inputRef,
}: ExpressionInputProps): React.ReactElement {
  const parsed = useMemo(() => preview(value), [value]);
  const variables = answer.variables.join(', ');
  const upToConstant = answer.residual?.kind === 'antiderivative-of';

  return (
    <div className="mt-6">
      <label className="label" htmlFor="answer">
        Your answer — an expression in {variables}
      </label>
      <input
        id="answer"
        ref={inputRef}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => e.key === 'Enter' && onSubmit()}
        placeholder="e.g. 3*x^2 - 2*x + 5"
        autoComplete="off"
        spellCheck={false}
        className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm
                   focus:border-slate-900 focus:outline-none disabled:bg-slate-50"
      />

      <div className="mt-2 min-h-[2.25rem] rounded-md bg-slate-50 px-3 py-2" data-testid="expression-preview">
        {parsed.kind === 'empty' ? (
          <span className="text-xs text-slate-400">Your expression will appear here as you type.</span>
        ) : parsed.kind === 'incomplete' ? (
          <span className="text-xs text-slate-400">Still reading…</span>
        ) : (
          <span className="text-sm text-slate-800" dangerouslySetInnerHTML={{ __html: parsed.html }} />
        )}
      </div>

      <p className="mt-1 text-xs text-slate-400">
        Use <code className="font-mono">^</code> for powers and <code className="font-mono">*</code> for
        multiplication; <code className="font-mono">exp(x)</code>, <code className="font-mono">ln(x)</code>,{' '}
        <code className="font-mono">sqrt(x)</code> and the trig functions all work. Any equivalent form is
        accepted — check the preview reads the way you meant.
        {upToConstant ? ' A constant of integration is optional.' : ''}
      </p>
    </div>
  );
}
