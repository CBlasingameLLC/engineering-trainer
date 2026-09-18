import type { TruthTableAnswer } from '@et/content-schema';

/**
 * Truth-table entry.
 *
 * The one item type the answer engine has always graded and the app could never
 * serve: `checkTruthTable` compares canonically and `truthTableAnswerSchema`
 * pins the row order, but with no widget a truth-table item was unanswerable,
 * so none could ship. That is why two courses were blocked on a grid.
 *
 * Cells are tri-state rather than boolean. An all-false grid is a *valid*
 * answer — plenty of functions are false on several rows — so a boolean array
 * cannot distinguish "the learner decided every row is 0" from "the learner has
 * not started". Submitting the second as the first would record a wrong answer
 * against someone who never answered, which corrupts the mastery estimate in
 * the one way the whole model is built to avoid. Unset rows keep Submit
 * disabled instead.
 *
 * Input columns are derived from the row index rather than stored, in the same
 * ascending binary order `assignments()` produces, so the grid and the stored
 * answer key cannot drift apart.
 */

interface TruthTableInputProps {
  answer: TruthTableAnswer;
  rows: (boolean | null)[];
  disabled: boolean;
  /** Set when graded, to mark which rows were wrong. */
  expected?: readonly boolean[] | undefined;
  onChange: (rows: (boolean | null)[]) => void;
}

/** Input bit for column `col` on row `index`, first variable most significant. */
const bitAt = (index: number, col: number, width: number): number =>
  (index >> (width - 1 - col)) & 1;

export function TruthTableInput({
  answer, rows, disabled, expected, onChange,
}: TruthTableInputProps): React.ReactElement {
  const width = answer.inputs.length;

  const set = (index: number, value: boolean | null): void => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  // Clicking cycles 0 -> 1 -> unset, so a misclick is correctable without a
  // separate clear control.
  const cycle = (current: boolean | null): boolean | null =>
    current === null ? false : current === false ? true : null;

  const filled = rows.filter((r) => r !== null).length;

  return (
    <div className="mt-6" data-testid="truth-table-input">
      <div className="flex items-baseline gap-3">
        <span className="label">Complete the output column</span>
        <span className="text-xs text-slate-400 dark:text-slate-500">
          {filled} of {rows.length} rows set · click a cell to cycle 0 → 1 → blank
        </span>
      </div>

      <table className="mt-2 w-full max-w-md border-collapse text-sm">
        <thead>
          <tr className="border-b border-slate-300 dark:border-slate-600">
            {answer.inputs.map((name) => (
              <th key={name} className="px-3 py-1.5 text-left font-mono font-medium text-slate-500 dark:text-slate-400">
                {name}
              </th>
            ))}
            <th className="px-3 py-1.5 text-left font-mono font-medium text-slate-900 dark:text-slate-100">
              {answer.output ?? 'F'}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((value, index) => {
            const wrong = expected !== undefined && value !== expected[index];
            return (
              <tr key={index} className="border-b border-slate-100 dark:border-slate-800">
                {answer.inputs.map((name, col) => (
                  <td key={name} className="px-3 py-1 font-mono text-slate-400 dark:text-slate-500">
                    {bitAt(index, col, width)}
                  </td>
                ))}
                <td className="px-1 py-1">
                  <button
                    type="button"
                    disabled={disabled}
                    data-testid={`tt-cell-${index}`}
                    data-value={value === null ? '' : value ? '1' : '0'}
                    onClick={() => set(index, cycle(value))}
                    className={[
                      'h-7 w-12 rounded border font-mono text-sm transition-colors',
                      expected !== undefined
                        ? wrong
                          ? 'border-red-400 bg-red-50 text-red-800 dark:border-red-500 dark:bg-red-950 dark:text-red-200 dark:border-red-600'
                          : 'border-emerald-400 bg-emerald-50 text-emerald-800 dark:border-emerald-500 dark:bg-emerald-950 dark:text-emerald-200'
                        : value === null
                          ? 'border-dashed border-slate-300 text-slate-300 hover:border-slate-500 dark:border-slate-600 dark:text-slate-600'
                          : 'border-slate-900 bg-slate-900 text-white dark:border-slate-200 dark:bg-slate-200 dark:text-slate-900 dark:bg-slate-100',
                      disabled ? 'cursor-default opacity-90' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    {value === null ? '·' : value ? '1' : '0'}
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {expected !== undefined && (
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          Rows outlined in red differ from the correct output.
        </p>
      )}
    </div>
  );
}
