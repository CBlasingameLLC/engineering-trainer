import { useEffect, useRef, useState } from 'react';
import { useApp } from '@/store';
import { Panel } from '@/ui/shell';
import type { ImportSummary } from '@/storage/transfer';

/**
 * Move a learning history between machines.
 *
 * One file, merged rather than replaced, because the two machines are both
 * real: a laptop in a lecture and a desktop at home accumulate separate
 * evidence about the same person, and either direction of a one-way copy
 * throws half of it away. The union is well defined here in a way it would not
 * be in most applications — attempts are append-only and the whole mastery
 * model is replayed from them, so merging two logs and recomputing gives the
 * same answer regardless of which machine the file travelled from.
 *
 * Import is a file input rather than anything cleverer because a file input is
 * the one picker that works identically in a browser and inside both WebViews.
 */
export function ProgressTransfer(): React.ReactElement {
  const exportProgress = useApp((s) => s.exportProgress);
  const importProgress = useApp((s) => s.importProgress);

  const picker = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState<'export' | 'import' | null>(null);
  const [wrote, setWrote] = useState<{ path: string | null; filename: string } | null>(null);
  const [summary, setSummary] = useState<ImportSummary | null>(null);
  const summaryStamp = summary?.attemptsAdded ?? -1;
  const [error, setError] = useState<string | null>(null);

  const storage = useApp((s) => s.storage);
  // Counted from storage rather than from `model`, which is a projection built
  // at boot and does not move while you answer. The number here has to be the
  // number that would be exported, or it reads as the export being empty.
  // Re-read when `answered` moves, which is the cheapest signal that the log
  // grew without subscribing to the log itself.
  const answered = useApp((s) => s.answered);
  const [attemptCount, setAttemptCount] = useState<number | null>(null);
  useEffect(() => {
    let live = true;
    void storage?.listAttempts().then((a) => { if (live) setAttemptCount(a.length); });
    return () => { live = false; };
  }, [storage, answered, summaryStamp]);

  const reset = (): void => {
    setError(null);
    setSummary(null);
    setWrote(null);
  };

  const onExport = async (): Promise<void> => {
    reset();
    setBusy('export');
    try {
      setWrote(await exportProgress());
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const onPicked = async (file: File | undefined): Promise<void> => {
    if (!file) return;
    reset();
    setBusy('import');
    try {
      setSummary(await importProgress(await file.text()));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
      // Clear the input, or picking the same file twice in a row does nothing:
      // `change` does not fire when the value has not changed.
      if (picker.current) picker.current.value = '';
    }
  };

  return (
    <Panel
      title="Progress transfer"
      right={<span className="label tabular">{(attemptCount ?? 0).toLocaleString()} attempts</span>}
      testId="progress-transfer"
    >
      <div className="space-y-2.5 px-3 py-2.5">
        <p className="max-w-[52ch] text-3xs leading-relaxed text-ink-faint">
          One file carries your whole history. Importing <em>merges</em> — nothing already on this
          machine is lost, and the same file applied twice changes nothing.
        </p>

        <div className="flex flex-wrap gap-2">
          <button
            className="btn-secondary"
            onClick={() => void onExport()}
            disabled={busy !== null}
            data-testid="progress-export"
          >
            {busy === 'export' ? 'Writing…' : 'Export'}
          </button>
          <button
            className="btn-secondary"
            onClick={() => picker.current?.click()}
            disabled={busy !== null}
            data-testid="progress-import"
          >
            {busy === 'import' ? 'Merging…' : 'Import'}
          </button>
          <input
            ref={picker}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => void onPicked(e.target.files?.[0])}
            data-testid="progress-file"
          />
        </div>

        {wrote && (
          <div className="border border-accent-dim bg-accent/5 px-2 py-1.5" data-testid="export-result">
            <div className="label text-accent">Written</div>
            <code className="mt-1 block select-all break-all font-mono text-3xs text-ink-dim">
              {wrote.path ?? `${wrote.filename} — check your browser downloads`}
            </code>
          </div>
        )}

        {summary && (
          <div className="border border-accent-dim bg-accent/5 px-2 py-1.5" data-testid="import-result">
            <div className="label text-accent">Merged</div>
            <ul className="mt-1 space-y-0.5 font-mono text-3xs text-ink-dim">
              <li>
                <span className="tabular text-ink">{summary.attemptsAdded}</span> new attempt(s)
                {summary.attemptsAlreadyHere > 0 && (
                  <>
                    , <span className="tabular">{summary.attemptsAlreadyHere}</span> already here
                  </>
                )}
              </li>
              {summary.circuitsAdded > 0 && (
                <li>
                  <span className="tabular text-ink">{summary.circuitsAdded}</span> saved circuit(s)
                </li>
              )}
              {summary.xpAfter !== summary.xpBefore && (
                <li>
                  XP <span className="tabular">{summary.xpBefore}</span> →{' '}
                  <span className="tabular text-ink">{summary.xpAfter}</span>
                </li>
              )}
              <li className="text-ink-faint">
                from {summary.origin}
                {summary.exportedAt ? `, ${summary.exportedAt.slice(0, 16).replace('T', ' ')}` : ''}
              </li>
            </ul>
          </div>
        )}

        {error && (
          <p className="border border-danger/40 bg-danger/10 px-2 py-1.5 text-3xs text-danger" data-testid="transfer-error">
            {error}
          </p>
        )}
      </div>
    </Panel>
  );
}
