import { type ReactElement } from 'react';
import type { OrderingAnswer, ProofRubricAnswer, ProofSkeletonAnswer } from '@et/content-schema';
import { MathText } from './Math';

/**
 * Inputs for the three proof answer kinds.
 *
 * Each one is deliberately a little laborious. A proof is an ordered argument
 * whose steps depend on each other, and an input that let the learner dump one
 * box of text would be back to the problem these kinds exist to solve: it
 * would look like it was measuring proof construction while measuring nothing
 * that can be graded.
 */

/** A stable shuffle, so the lines do not re-order on every keystroke. */
export function shuffledIds(ids: readonly string[], seed: string): string[] {
  let h = 0;
  for (let i = 0; i < seed.length; i += 1) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  const out = [...ids];
  for (let i = out.length - 1; i > 0; i -= 1) {
    h = (h * 1103515245 + 12345) >>> 0;
    const j = h % (i + 1);
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

export function OrderingInput({
  answer, itemId, order, disabled, onChange,
}: {
  answer: OrderingAnswer;
  itemId: string;
  order: readonly string[];
  disabled: boolean;
  onChange: (next: string[]) => void;
}): ReactElement {
  const all = [...answer.lines, ...answer.distractors];
  const pool = shuffledIds(all.map((l) => l.id), itemId).filter((id) => !order.includes(id));
  const textFor = (id: string): string => all.find((l) => l.id === id)?.text ?? id;

  return (
    <div className="mt-6 grid gap-4 md:grid-cols-2">
      <div>
        <p className="label">Available lines</p>
        <div className="mt-2 space-y-2">
          {pool.map((id) => (
            <button
              key={id}
              disabled={disabled}
              onClick={() => onChange([...order, id])}
              className="flex w-full items-start gap-2 rounded-md border border-slate-200 p-3 text-left text-sm
                         hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              <MathText>{textFor(id)}</MathText>
            </button>
          ))}
          {pool.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">All lines placed.</p>
          )}
        </div>
      </div>
      <div>
        <p className="label">Your proof</p>
        <ol className="mt-2 space-y-2">
          {order.map((id, i) => (
            <li key={id}>
              <button
                disabled={disabled}
                onClick={() => onChange(order.filter((x) => x !== id))}
                className="flex w-full items-start gap-3 rounded-md border border-slate-900 bg-slate-50 p-3
                           text-left text-sm disabled:opacity-70 dark:border-slate-200 dark:bg-slate-900"
              >
                <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{i + 1}</span>
                <MathText>{textFor(id)}</MathText>
              </button>
            </li>
          ))}
          {order.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500">
              Click lines on the left to build the proof. One of them belongs to no correct proof.
            </p>
          )}
        </ol>
      </div>
    </div>
  );
}

export function SkeletonInput({
  answer, values, disabled, onChange,
}: {
  answer: ProofSkeletonAnswer;
  values: Readonly<Record<string, string>>;
  disabled: boolean;
  onChange: (next: Record<string, string>) => void;
}): ReactElement {
  return (
    <div className="mt-6 space-y-5">
      {answer.steps.map((step, i) => (
        <div key={step.id}>
          <p className="label flex items-baseline gap-2">
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{i + 1}</span>
            <MathText>{step.prompt}</MathText>
          </p>
          {step.expect.kind === 'choice' ? (
            <div className="mt-2 space-y-2">
              {step.expect.options.map((option) => (
                <button
                  key={option.id}
                  disabled={disabled}
                  onClick={() => onChange({ ...values, [step.id]: option.id })}
                  className={[
                    'flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm',
                    values[step.id] === option.id
                      ? 'border-slate-900 bg-slate-50 dark:border-slate-200 dark:bg-slate-900'
                      : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800',
                  ].join(' ')}
                >
                  <MathText>{option.text}</MathText>
                </button>
              ))}
            </div>
          ) : (
            <input
              disabled={disabled}
              value={values[step.id] ?? ''}
              onChange={(e) => onChange({ ...values, [step.id]: e.target.value })}
              spellCheck={false}
              placeholder="an expression, e.g. k*(k+1)/2"
              className="mt-2 w-full rounded-md border border-slate-300 p-2 font-mono text-sm
                         focus:border-slate-900 focus:outline-none disabled:bg-slate-50 dark:border-slate-600"
            />
          )}
        </div>
      ))}
    </div>
  );
}

export function RubricInput({
  answer, met, settled, onChange,
}: {
  answer: ProofRubricAnswer;
  met: readonly string[];
  settled: boolean;
  onChange: (next: string[]) => void;
}): ReactElement {
  return (
    <div className="mt-6">
      <p className="label">Which of these does your proof actually contain?</p>
      <div className="mt-2 space-y-2">
        {answer.criteria.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-start gap-3 rounded-md border border-slate-200 p-3 text-sm
                       hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            <input
              type="checkbox"
              disabled={settled}
              checked={met.includes(c.id)}
              onChange={(e) => onChange(e.target.checked ? [...met, c.id] : met.filter((x) => x !== c.id))}
              className="mt-0.5"
            />
            <span className="flex-grow"><MathText>{c.text}</MathText></span>
            <span className="font-mono text-xs text-slate-400 dark:text-slate-500">{c.weight}</span>
          </label>
        ))}
      </div>
      {settled ? (
        <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-900">
          <p className="label">Model proof</p>
          <div className="mt-1 text-sm"><MathText>{answer.model}</MathText></div>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400 dark:text-slate-500">
          Write the proof out before ticking anything. The model proof appears after you submit, and this attempt
          counts for less than a graded one because you are scoring it yourself.
        </p>
      )}
    </div>
  );
}
