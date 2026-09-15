import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CAT_CONFIG, shouldStop } from '@et/domain';
import { emptySchematic, formatValue, type Schematic } from '@et/circuits';
import type { Response } from '@et/answer-engine';
import { useApp } from '@/store';
import { MathText } from '@/ui/Math';
import { SchematicEditor } from '@/features/schematic/SchematicEditor';

/**
 * The session player.
 *
 * One item at a time, graded immediately, with the explanation shown before the
 * learner moves on. Immediate feedback is the whole mechanism: a wrong answer
 * reviewed a week later teaches nothing, and the misconception attached to a
 * distractor is only useful at the moment the learner still remembers why they
 * picked it.
 */

export function Session(): React.ReactElement {
  const active = useApp((s) => s.active);
  const graded = useApp((s) => s.graded);
  const cat = useApp((s) => s.cat);
  const bank = useApp((s) => s.bank);
  const answered = useApp((s) => s.answered);
  const correct = useApp((s) => s.correctCount);
  const hintsShown = useApp((s) => s.hintsShown);
  const submit = useApp((s) => s.submit);
  const submitCircuit = useApp((s) => s.submitCircuit);
  const submitCircuitNetlist = useApp((s) => s.submitCircuitNetlist);
  const advance = useApp((s) => s.advance);
  const showHint = useApp((s) => s.showHint);
  const mode = useApp((s) => s.mode);
  const sessionXp = useApp((s) => s.sessionXp);

  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [schematic, setSchematic] = useState<Schematic>(() => emptySchematic('my design'));
  const [circuitInput, setCircuitInput] = useState<'draw' | 'netlist'>('draw');
  const [deck, setDeck] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear the field and refocus when a new item arrives, so the learner can
  // keep typing without reaching for the mouse between questions.
  useEffect(() => {
    setText('');
    setChoice(null);
    setSchematic(emptySchematic('my design'));
    setDeck('');
    inputRef.current?.focus();
  }, [active?.item.id]);

  if (!active || !cat) {
    return <div className="grid h-full place-items-center text-sm text-slate-400">Preparing…</div>;
  }

  const { item } = active;
  const isChoice = item.type === 'multiple-choice';
  const isCircuit = item.type === 'circuit-build';
  const budget = DEFAULT_CAT_CONFIG.maxItems;
  const outstanding = shouldStop(cat, bank, DEFAULT_CAT_CONFIG).outstanding.length;

  const send = (): void => {
    if (graded?.result.correct !== undefined && graded.result.outcome !== 'unparseable' && graded.result.outcome !== 'wrong-dimension') {
      return;
    }
    if (isCircuit) {
      if (circuitInput === 'netlist') void submitCircuitNetlist(deck);
      else void submitCircuit(schematic);
      return;
    }
    const response: Response | null = isChoice
      ? choice
        ? { kind: 'choice', optionId: choice }
        : null
      : text.trim()
        ? { kind: 'text', value: text }
        : null;
    if (response) void submit(response, isChoice ? (choice ?? '') : text);
  };

  const needsCorrection =
    graded?.result.outcome === 'unparseable' || graded?.result.outcome === 'wrong-dimension';
  const settled = graded !== null && !needsCorrection;

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-8">
      <header className="flex items-center gap-4 text-sm">
        <span className="font-medium text-slate-900">
          {mode === 'challenge' ? 'Challenge exam' : mode === 'practice' ? 'Daily quest' : 'Placement'}
        </span>
        <span className="text-slate-400">
          item {answered + 1} of at most {budget}
        </span>
        <span className="tabular-nums text-amber-700">{sessionXp} XP</span>
        <span className="ml-auto tabular-nums text-slate-500">
          {correct}/{answered} correct
        </span>
      </header>

      <div className="mt-3 h-1 overflow-hidden rounded bg-slate-200">
        <div
          className="h-full bg-slate-900 transition-all duration-300"
          style={{ width: `${Math.min(100, (answered / budget) * 100)}%` }}
        />
      </div>
      <p className="mt-2 text-xs text-slate-400">
        {outstanding} concept{outstanding === 1 ? '' : 's'} still need evidence
      </p>

      <main className="mt-8 flex-1">
        {/* The item id is exposed so end-to-end drivers and bug reports can
            identify exactly which variant was on screen. KaTeX rewrites the
            stem text, so the rendered DOM is not a reliable identifier. */}
        <article className="card p-6" data-item-id={item.id} data-item-type={item.type}>
          <MathText className="block text-base leading-relaxed text-slate-800">{item.stem}</MathText>

          {isCircuit ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                {(['draw', 'netlist'] as const).map((choice) => (
                  <button
                    key={choice}
                    disabled={settled}
                    onClick={() => setCircuitInput(choice)}
                    className={`rounded px-2 py-1 text-xs ${circuitInput === choice ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'}`}
                    data-circuit-input={choice}
                  >
                    {choice === 'draw' ? 'Draw it' : 'Write a netlist'}
                  </button>
                ))}
                <span className="text-xs text-slate-500">
                  Graded by simulating what you build — any circuit meeting the specification counts.
                </span>
              </div>

              {circuitInput === 'draw' ? (
                <SchematicEditor
                  value={schematic}
                  onChange={setSchematic}
                  readOnly={settled}
                  rows={22}
                  columns={30}
                />
              ) : (
                <div>
                  <textarea
                    id="netlist"
                    value={deck}
                    disabled={settled}
                    onChange={(e) => setDeck(e.target.value)}
                    spellCheck={false}
                    placeholder={'my design\nV1 in 0 1\nR1 in inv 2.2k\nRf inv out 22k\nXU1 out 0 inv opamp\n.op'}
                    className="h-44 w-full rounded-md border border-slate-300 p-2 font-mono text-xs
                               focus:border-slate-900 focus:outline-none disabled:bg-slate-50"
                  />
                  <p className="mt-1 text-xs text-slate-400">
                    SPICE subset. First line is the title. Node names from the question must match.
                  </p>
                </div>
              )}
            </div>
          ) : isChoice ? (
            <div className="mt-6 space-y-2">
              {item.options.map((option) => {
                const chosenThis = settled && graded.submitted === option.id;
                const isAnswer = settled && item.answer.kind === 'choice' && item.answer.correctId === option.id;
                return (
                  <button
                    key={option.id}
                    disabled={settled}
                    onClick={() => setChoice(option.id)}
                    className={[
                      'flex w-full items-start gap-3 rounded-md border p-3 text-left text-sm transition-colors',
                      isAnswer
                        ? 'border-emerald-500 bg-emerald-50'
                        : chosenThis
                          ? 'border-red-400 bg-red-50'
                          : choice === option.id
                            ? 'border-slate-900 bg-slate-50'
                            : 'border-slate-200 hover:bg-slate-50',
                    ].join(' ')}
                  >
                    <span className="font-mono text-xs text-slate-400">{option.id.toUpperCase()}</span>
                    <MathText>{option.text}</MathText>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="mt-6">
              <label className="label" htmlFor="answer">
                Your answer
                {item.answer.kind === 'numeric' && item.answer.unit ? ` (${item.answer.unit})` : ''}
              </label>
              <input
                id="answer"
                ref={inputRef}
                value={text}
                disabled={settled}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                placeholder="e.g. 4.7k, 6.2 V, 5 kΩ"
                className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 font-mono text-sm
                           focus:border-slate-900 focus:outline-none disabled:bg-slate-50"
              />
              <p className="mt-1 text-xs text-slate-400">
                Engineering notation, SI prefixes and units are all accepted.
              </p>
            </div>
          )}

          {needsCorrection && (
            <p className="mt-4 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
              {graded.result.feedback}
            </p>
          )}

          {hintsShown > 0 && !settled && (
            <div className="mt-4 space-y-2">
              {item.explanation.hints.slice(0, hintsShown).map((hint, i) => (
                <p key={i} className="rounded-md bg-sky-50 px-3 py-2 text-sm text-sky-900">
                  <MathText>{hint}</MathText>
                </p>
              ))}
            </div>
          )}

          {!settled && (
            <div className="mt-6 flex items-center gap-3">
              <button
                className="btn-primary"
                onClick={send}
                disabled={
                  isCircuit
                    ? circuitInput === 'netlist'
                      ? deck.trim().length === 0
                      : schematic.components.length === 0
                    : isChoice
                      ? !choice
                      : !text.trim()
                }
              >
                Submit
              </button>
              {hintsShown < item.explanation.hints.length && (
                <button className="btn-secondary" onClick={showHint}>
                  Hint
                </button>
              )}
              <span className="ml-auto text-xs text-slate-400">
                {hintsShown > 0 ? 'Hints used — this counts as a weaker recall' : 'Press Enter to submit'}
              </span>
            </div>
          )}
        </article>

        {settled && <Feedback />}
      </main>

      {settled && (
        <footer className="mt-6 flex justify-end">
          <button className="btn-primary" onClick={() => void advance()} autoFocus>
            Continue
          </button>
        </footer>
      )}
    </div>
  );
}

/** Post-answer explanation, including the specific error when one was recognised. */
function Feedback(): React.ReactElement | null {
  const graded = useApp((s) => s.graded);
  if (!graded) return null;

  const { result, item } = graded;
  return (
    <section className="card mt-4 p-6">
      <div className="flex items-center gap-2">
        <span
          className={[
            'rounded px-2 py-0.5 text-xs font-semibold',
            result.correct ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800',
          ].join(' ')}
        >
          {result.correct ? 'Correct' : 'Not quite'}
        </span>
        {result.misconception && (
          <span className="font-mono text-xs text-slate-400">{result.misconception}</span>
        )}
        {graded.xpAwarded > 0 && (
          <span className="ml-auto text-xs tabular-nums text-amber-700">+{graded.xpAwarded} XP</span>
        )}
      </div>

      {result.feedback && !result.correct && (
        <p className="mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900">
          <MathText>{result.feedback}</MathText>
        </p>
      )}

      {graded.circuit && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-slate-400">
              <th className="pb-1 font-medium">Measurement</th>
              <th className="pb-1 text-right font-medium">Required</th>
              <th className="pb-1 text-right font-medium">Your circuit</th>
            </tr>
          </thead>
          <tbody>
            {graded.circuit.results.map((row) => (
              <tr key={row.probe} className="border-t border-slate-100">
                <td className="py-1 font-mono text-xs text-slate-600">{row.probe}</td>
                <td className="py-1 text-right tabular-nums text-slate-500">{formatValue(row.expected)}</td>
                <td className={`py-1 text-right tabular-nums ${row.within ? 'text-emerald-700' : 'text-red-700'}`}>
                  {row.actual === null ? (row.message ?? 'not measurable') : formatValue(row.actual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ol className="mt-4 space-y-2">
        {item.explanation.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-slate-700">
            <span className="mt-0.5 font-mono text-xs text-slate-300">{i + 1}</span>
            <MathText>{step}</MathText>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-slate-100 pt-3 text-sm italic text-slate-600">
        <MathText>{item.explanation.principle}</MathText>
      </p>
    </section>
  );
}
