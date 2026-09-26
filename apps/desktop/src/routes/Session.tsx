import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CAT_CONFIG, shouldStop } from '@et/domain';
import { emptySchematic, formatValue, type Schematic } from '@et/circuits';
import type { Response } from '@et/answer-engine';
import { useApp } from '@/store';
import { SchematicFigure } from '@/features/schematic/SchematicFigure';
import { MathText } from '@/ui/Math';
import { ExpressionInput } from '@/ui/ExpressionInput';
import { TruthTableInput } from '@/ui/TruthTableInput';
import { OrderingInput, RubricInput, SkeletonInput } from '@/ui/ProofInputs';
import { SchematicEditor } from '@/features/schematic/SchematicEditor';
import { Meter } from '@/ui/shell';
import { IconClock } from '@/ui/icons';

/**
 * The session player.
 *
 * One item at a time, graded immediately, with the explanation shown before the
 * learner moves on. Immediate feedback is the whole mechanism: a wrong answer
 * reviewed a week later teaches nothing, and the misconception attached to a
 * distractor is only useful at the moment the learner still remembers why they
 * picked it.
 */

/**
 * How long is left, ticking.
 *
 * Counts down to zero and then keeps counting *up*, because the paper does not
 * end at the bell. An exam clock that stopped at 00:00 would hide the one
 * number the time-management finding is built from — how far past the limit
 * the sitting actually ran.
 */
function ExamClock(): React.ReactElement | null {
  const paper = useApp((s) => s.paper);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!paper || paper.allowedMs === null) return null;

  const elapsed = now - paper.startedAt;
  const remaining = paper.allowedMs - elapsed;
  const over = remaining < 0;
  const magnitude = Math.abs(over ? remaining : remaining);
  const mm = Math.floor(magnitude / 60_000);
  const ss = Math.floor((magnitude % 60_000) / 1000);

  return (
    <span
      className={`tabular flex items-center gap-1.5 font-mono text-[13px] font-semibold ${
        over ? 'text-danger' : remaining < 300_000 ? 'text-warn' : 'text-ink'
      }`}
      data-testid="exam-clock"
      data-expired={over ? 'true' : 'false'}
    >
      <IconClock className="h-3.5 w-3.5" />
      {over ? '+' : ''}
      {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
    </span>
  );
}

/**
 * Handing in, and the bell.
 *
 * The interruption at expiry is deliberate and is the one moment this screen
 * takes over: a learner who works past the limit without noticing has produced
 * a result that looks like knowledge and is partly pace, and they need to have
 * *chosen* to carry on for the two scores in the report to mean anything.
 */
function PaperControls(): React.ReactElement | null {
  const paper = useApp((s) => s.paper);
  const continuePastBell = useApp((s) => s.continuePastBell);
  const finishPaper = useApp((s) => s.finishPaper);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!paper) return null;

  const expired = paper.allowedMs !== null && now - paper.startedAt > paper.allowedMs;
  const unreached = paper.served.length - paper.cursor - 1;

  if (expired && !paper.continuedPastBell) {
    return (
      <div className="mt-3 border border-danger/60 bg-danger/5 px-3 py-2.5" data-testid="bell">
        <div className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-danger">
          Time
        </div>
        <p className="mt-1 max-w-xl text-[12px] leading-relaxed text-ink-dim">
          On the real paper this is where it gets collected, with{' '}
          {unreached > 0 ? `${unreached} question${unreached === 1 ? '' : 's'}` : 'nothing'} left. You can
          hand in now and take that as the result, or keep working — everything from here is scored
          separately, so you still find out what you know without it flattering what you would have
          scored.
        </p>
        <div className="mt-2 flex gap-2">
          <button type="button" className="btn-primary" data-testid="hand-in" onClick={() => void finishPaper()}>
            Hand in
          </button>
          <button type="button" className="btn-secondary" data-testid="keep-going" onClick={continuePastBell}>
            Keep going
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mt-2 flex items-center gap-2">
      {expired ? (
        <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-danger">
          Past the limit — scored separately
        </span>
      ) : null}
      <span className="flex-1" />
      <button type="button" className="btn-ghost" data-testid="hand-in" onClick={() => void finishPaper()}>
        Hand in{unreached > 0 ? ` · ${unreached} left` : ''}
      </button>
    </div>
  );
}

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
  const paper = useApp((s) => s.paper);

  const [text, setText] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [schematic, setSchematic] = useState<Schematic>(() => emptySchematic('my design'));
  const [circuitInput, setCircuitInput] = useState<'draw' | 'netlist'>('draw');
  const [deck, setDeck] = useState('');
  const [tableRows, setTableRows] = useState<(boolean | null)[]>([]);
  const [order, setOrder] = useState<string[]>([]);
  const [skeleton, setSkeleton] = useState<Record<string, string>>({});
  const [rubricMet, setRubricMet] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear the field and refocus when a new item arrives, so the learner can
  // keep typing without reaching for the mouse between questions.
  useEffect(() => {
    setText('');
    setChoice(null);
    setSchematic(emptySchematic('my design'));
    setDeck('');
    setTableRows(
      active?.item.answer.kind === 'truth-table'
        ? Array.from({ length: active.item.answer.rows.length }, () => null)
        : [],
    );
    setOrder([]);
    setSkeleton({});
    setRubricMet([]);
    inputRef.current?.focus();
  }, [active]);

  if (!active || !cat) {
    return <div className="grid h-full place-items-center text-sm text-ink-faint">Preparing…</div>;
  }

  const { item } = active;
  const isChoice = item.type === 'multiple-choice';
  const isCircuit = item.type === 'circuit-build';
  const isSymbolic = item.answer.kind === 'symbolic' || item.answer.kind === 'boolean';
  const isTable = item.answer.kind === 'truth-table';
  const isOrdering = item.answer.kind === 'ordering';
  const isSkeleton = item.answer.kind === 'proof-skeleton';
  const isRubric = item.answer.kind === 'proof-rubric';
  const tableComplete = tableRows.length > 0 && tableRows.every((r) => r !== null);
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
      : isOrdering
        ? order.length > 0
          ? { kind: 'ordering', order: [...order] }
          : null
      : isSkeleton
        ? Object.keys(skeleton).length > 0
          ? { kind: 'proof-skeleton', responses: { ...skeleton } }
          : null
      : isRubric
        // An empty rubric is a real submission: it means the proof met none of
        // the criteria, which is a score of zero rather than a missing answer.
        ? { kind: 'proof-rubric', met: [...rubricMet] }
      : isTable
        ? tableComplete
          ? { kind: 'truth-table', rows: tableRows.map((r) => r === true) }
          : null
        : text.trim()
          ? { kind: 'text', value: text }
          : null;
    if (response) {
      const raw = isChoice
        ? (choice ?? '')
        : isOrdering
          ? order.join(',')
        : isSkeleton
          ? JSON.stringify(skeleton)
        : isRubric
          ? rubricMet.join(',')
        : isTable
          ? tableRows.map((r) => (r === true ? '1' : '0')).join('')
          : text;
      void submit(response, raw);
    }
  };

  const needsCorrection =
    graded?.result.outcome === 'unparseable' || graded?.result.outcome === 'wrong-dimension';
  const settled = graded !== null && !needsCorrection;

  const sealed = paper?.kind === 'exam';
  const total = paper ? paper.served.length : budget;
  const position = paper ? paper.cursor + 1 : answered + 1;
  const heading = paper
    ? paper.kind === 'exam'
      ? `${paper.blueprints[0]?.course ?? ''} ${paper.blueprints[0]?.title ?? 'Exam'}`
      : 'Exam triage'
    : mode === 'challenge' ? 'Challenge exam'
    : mode === 'drill' ? 'Targeted drill'
    : mode === 'practice' ? 'Practice'
    : 'Placement';

  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col px-6 py-6" data-testid="session" data-mode={paper ? paper.kind : mode}>
      <header className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="font-mono text-[12px] font-semibold uppercase tracking-[0.1em] text-ink">
          {heading}
        </span>
        <span className="tabular font-mono text-[11px] text-ink-faint">
          {paper ? `${position} of ${total}` : `item ${position} of at most ${total}`}
        </span>
        {paper ? null : (
          <span className="tabular font-mono text-[11px] text-gold">{sessionXp} XP</span>
        )}
        <span className="flex-1" />
        {/* A sealed paper reports nothing back, and that includes the running
            score: a live tally is feedback, and seeing it climb or stall
            changes how the remaining questions are answered. */}
        {sealed ? <ExamClock /> : (
          <span className="tabular font-mono text-[11px] text-ink-dim">
            {correct}/{answered} correct
          </span>
        )}
      </header>

      <Meter className="mt-2.5" value={Math.min(1, (paper ? paper.cursor : answered) / Math.max(1, total))} />

      <p className="mt-1.5 font-mono text-[10px] uppercase tracking-[0.12em] text-ink-faint">
        {paper
          ? sealed
            ? 'Sealed — nothing is shown back until you hand in'
            : `${paper.blueprints.length} exam${paper.blueprints.length === 1 ? '' : 's'} in scope`
          : `${outstanding} concept${outstanding === 1 ? '' : 's'} still need evidence`}
      </p>

      {paper ? <PaperControls /> : null}

      <main className="mt-8 flex-1">
        {/* The item id is exposed so end-to-end drivers and bug reports can
            identify exactly which variant was on screen. KaTeX rewrites the
            stem text, so the rendered DOM is not a reliable identifier. The
            primary KC goes alongside it, because a driver checking that a
            scoped session served the material it was scoped to has no other
            way to ask — the item id names a generator, not a concept. */}
        <article
          className="card p-6"
          data-item-id={item.id}
          data-item-type={item.type}
          data-kc-id={[...item.kcRefs].sort((a, b) => b.weight - a.weight)[0]?.kc}
        >
          <MathText className="block text-base leading-relaxed text-ink">{item.stem}</MathText>

          {/* Above the answer controls and below the question, which is where a
              textbook puts it: the figure is what the question refers to, so it
              has to be readable while the answer is being typed. */}
          {item.figure && <SchematicFigure figure={item.figure} className="mt-4 max-w-xl" />}

          {isCircuit ? (
            <div className="mt-6">
              <div className="mb-2 flex items-center gap-2">
                {(['draw', 'netlist'] as const).map((choice) => (
                  <button
                    key={choice}
                    disabled={settled}
                    onClick={() => setCircuitInput(choice)}
                    className={`rounded px-2 py-1 text-xs ${circuitInput === choice ? 'bg-surface-2 text-white' : 'bg-surface-2 text-ink'}`}
                    data-circuit-input={choice}
                  >
                    {choice === 'draw' ? 'Draw it' : 'Write a netlist'}
                  </button>
                ))}
                <span className="text-xs text-ink-dim">
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
                    className="h-44 w-full rounded-md border border-line-strong p-2 font-mono text-xs
                               focus:border-ink focus:outline-none disabled:bg-surface-2"
                  />
                  <p className="mt-1 text-xs text-ink-faint">
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
                        ? 'border-accent/50 bg-accent/10 '
                        : chosenThis
                          ? 'border-danger/50 bg-danger/10 '
                          : choice === option.id
                            ? 'border-ink bg-surface-2'
                            : 'border-line hover:bg-surface-2',
                    ].join(' ')}
                  >
                    <span className="font-mono text-xs text-ink-faint">{option.id.toUpperCase()}</span>
                    <MathText>{option.text}</MathText>
                  </button>
                );
              })}
            </div>
          ) : isOrdering && item.answer.kind === 'ordering' ? (
            <OrderingInput
              answer={item.answer}
              itemId={item.id}
              order={order}
              disabled={settled}
              onChange={setOrder}
            />
          ) : isSkeleton && item.answer.kind === 'proof-skeleton' ? (
            <SkeletonInput answer={item.answer} values={skeleton} disabled={settled} onChange={setSkeleton} />
          ) : isRubric && item.answer.kind === 'proof-rubric' ? (
            <RubricInput answer={item.answer} met={rubricMet} settled={settled} onChange={setRubricMet} />
          ) : isTable && item.answer.kind === 'truth-table' ? (
            <TruthTableInput
              answer={item.answer}
              rows={tableRows}
              disabled={settled}
              expected={settled ? item.answer.rows : undefined}
              onChange={setTableRows}
            />
          ) : isSymbolic && (item.answer.kind === 'symbolic' || item.answer.kind === 'boolean') ? (
            <ExpressionInput
              answer={item.answer}
              value={text}
              disabled={settled}
              onChange={setText}
              onSubmit={send}
              inputRef={inputRef}
            />
          ) : (
            <div className="mt-6">
              <label className="label" htmlFor="answer">
                Your answer
                {item.answer.kind === 'numeric' && item.answer.unit ? ` (${item.answer.unit})` : ''}
                {item.answer.kind === 'complex' && item.answer.unit ? ` (${item.answer.unit})` : ''}
              </label>
              <input
                id="answer"
                ref={inputRef}
                value={text}
                disabled={settled}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && send()}
                // A phasor has six spellings in common use and the grader
                // takes all of them; saying so up front is cheaper than a
                // learner discovering it through a rejected correct answer.
                placeholder={
                  item.answer.kind === 'complex'
                    ? 'e.g. 50∠53.1°, 30 + j40, 50 < 53.1'
                    : 'e.g. 4.7k, 6.2 V, 5 kΩ'
                }
                className="mt-1 w-full rounded-md border border-line-strong px-3 py-2 font-mono text-sm
                           focus:border-ink focus:outline-none disabled:bg-surface-2"
              />
              <p className="mt-1 text-xs text-ink-faint">
                Engineering notation, SI prefixes and units are all accepted.
              </p>
            </div>
          )}

          {needsCorrection && (
            <p className="mt-4 rounded-md bg-warn/10 px-3 py-2 text-sm text-warn">
              {graded.result.feedback}
            </p>
          )}

          {hintsShown > 0 && !settled && (
            <div className="mt-4 space-y-2">
              {item.explanation.hints.slice(0, hintsShown).map((hint, i) => (
                <p key={i} className="rounded-md bg-info/10 px-3 py-2 text-sm text-info">
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
                      : isTable
                        ? !tableComplete
                        : !text.trim()
                }
              >
                Submit
              </button>
              {/* No hints in a sealed exam. The real paper has none, and taking
                  one here would both flatter the score and record the attempt
                  as a weaker recall than it was — corrupting the one measurement
                  the sitting exists to produce. */}
              {!sealed && hintsShown < item.explanation.hints.length && (
                <button className="btn-secondary" onClick={showHint}>
                  Hint
                </button>
              )}
              <span className="ml-auto text-xs text-ink-faint">
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
            result.correct ? 'bg-accent/15 text-accent ' : 'bg-danger/15 text-danger',
          ].join(' ')}
        >
          {result.correct ? 'Correct' : 'Not quite'}
        </span>
        {result.misconception && (
          <span className="font-mono text-xs text-ink-faint">{result.misconception}</span>
        )}
        {graded.xpAwarded > 0 && (
          <span className="ml-auto text-xs tabular-nums text-warn">+{graded.xpAwarded} XP</span>
        )}
      </div>

      {result.feedback && !result.correct && (
        <p className="mt-3 rounded-md bg-danger/10 px-3 py-2 text-sm text-danger">
          <MathText>{result.feedback}</MathText>
        </p>
      )}

      {graded.circuit && (
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
              <th className="pb-1 font-medium">Measurement</th>
              <th className="pb-1 text-right font-medium">Required</th>
              <th className="pb-1 text-right font-medium">Your circuit</th>
            </tr>
          </thead>
          <tbody>
            {graded.circuit.results.map((row) => (
              <tr key={row.probe} className="border-t border-line">
                <td className="py-1 font-mono text-xs text-ink-dim">{row.probe}</td>
                <td className="py-1 text-right tabular-nums text-ink-dim">{formatValue(row.expected)}</td>
                <td className={`py-1 text-right tabular-nums ${row.within ? 'text-accent' : 'text-danger'}`}>
                  {row.actual === null ? (row.message ?? 'not measurable') : formatValue(row.actual)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ol className="mt-4 space-y-2">
        {item.explanation.steps.map((step, i) => (
          <li key={i} className="flex gap-3 text-sm leading-relaxed text-ink-dim">
            <span className="mt-0.5 font-mono text-xs text-ink-faint">{i + 1}</span>
            <MathText>{step}</MathText>
          </li>
        ))}
      </ol>

      <p className="mt-4 border-t border-line pt-3 text-sm italic text-ink-dim">
        <MathText>{item.explanation.principle}</MathText>
      </p>
    </section>
  );
}
