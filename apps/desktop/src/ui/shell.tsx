import type { ReactElement, ReactNode } from 'react';

/**
 * The shell vocabulary.
 *
 * Small on purpose. A dense instrument panel is made of very few shapes
 * repeated exactly — a faint label, a hairline rule, a figure, a bar — and the
 * previous version of this app had none of them, so every screen invented its
 * own spacing and its own idea of a heading. These are the shapes.
 */

export function Label({ children, className = '' }: { children: ReactNode; className?: string }): ReactElement {
  return <div className={`label ${className}`}>{children}</div>;
}

/** A section heading: micro-label, optional right-hand note, hairline to the edge. */
export function Rule({ children, right }: { children: ReactNode; right?: ReactNode }): ReactElement {
  return (
    <div className="flex items-center gap-2 pb-1.5">
      <span className="label whitespace-nowrap">{children}</span>
      <span className="h-px flex-1 bg-line" />
      {right ? <span className="label whitespace-nowrap">{right}</span> : null}
    </div>
  );
}

export function Panel({
  title,
  right,
  children,
  className = '',
  testId,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
  testId?: string;
}): ReactElement {
  return (
    <section className={`panel flex min-h-0 flex-col ${className}`} data-testid={testId}>
      {title ? (
        <header className="flex items-center gap-2 border-b border-line px-3 py-2">
          <span className="label whitespace-nowrap">{title}</span>
          <span className="h-px flex-1 bg-line" />
          {right ? <div className="shrink-0">{right}</div> : null}
        </header>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto">{children}</div>
    </section>
  );
}

/**
 * A figure with its name underneath rather than above.
 *
 * The number is what is being read; the label is what it is called. Putting the
 * label second lets the eye land on the value first and only consult the name
 * when it needs to, which is how a dashboard is actually used.
 */
export function Stat({
  value,
  label,
  tone = 'default',
  sub,
}: {
  value: ReactNode;
  label: ReactNode;
  tone?: 'default' | 'accent' | 'danger' | 'warn' | 'dim';
  sub?: ReactNode;
}): ReactElement {
  const colour = {
    default: 'text-ink',
    accent: 'text-accent',
    danger: 'text-danger',
    warn: 'text-warn',
    dim: 'text-ink-dim',
  }[tone];
  return (
    <div className="min-w-0">
      <div className={`tabular font-mono text-[22px] font-semibold leading-none tracking-tightest ${colour}`}>
        {value}
      </div>
      <div className="label mt-1.5 truncate">{label}</div>
      {sub ? <div className="mt-0.5 truncate font-mono text-[10px] text-ink-faint">{sub}</div> : null}
    </div>
  );
}

/** A 2px bar. Thin enough to sit under a row of text without becoming the row. */
export function Meter({
  value,
  tone = 'accent',
  className = '',
}: {
  value: number;
  tone?: 'accent' | 'gap' | 'developing' | 'proficient' | 'mastered' | 'danger';
  className?: string;
}): ReactElement {
  const fill = {
    accent: 'bg-accent',
    gap: 'bg-band-gap',
    developing: 'bg-band-developing',
    proficient: 'bg-band-proficient',
    mastered: 'bg-band-mastered',
    danger: 'bg-danger',
  }[tone];
  return (
    <div className={`h-[2px] w-full bg-line ${className}`}>
      <div className={`h-full ${fill}`} style={{ width: `${Math.max(0, Math.min(1, value)) * 100}%` }} />
    </div>
  );
}

/**
 * The days-to-exam chip.
 *
 * Colour is the message and it is not decorative: inside two days is red,
 * inside a week amber, beyond that plain. Someone glancing at this screen
 * should get the schedule before they read a word of it.
 */
export function Countdown({ days, className = '' }: { days: number; className?: string }): ReactElement {
  const tone =
    days < 0 ? 'border-line text-ink-faint'
      : days <= 2 ? 'border-danger/60 text-danger'
      : days <= 7 ? 'border-warn/60 text-warn'
      : 'border-line-strong text-ink-dim';
  const text =
    days < 0 ? `${Math.abs(days)}d ago`
      : days === 0 ? 'today'
      : days === 1 ? 'tomorrow'
      : `${days} days`;
  return (
    <span
      className={`tabular inline-block whitespace-nowrap border px-1.5 py-px font-mono text-[10px] uppercase tracking-[0.08em] ${tone} ${className}`}
    >
      {text}
    </span>
  );
}

const BAND_TONE = {
  gap: 'bg-band-gap',
  developing: 'bg-band-developing',
  proficient: 'bg-band-proficient',
  mastered: 'bg-band-mastered',
} as const;

export function BandDot({ band }: { band: keyof typeof BAND_TONE }): ReactElement {
  return <span className={`inline-block h-2 w-2 shrink-0 ${BAND_TONE[band]}`} aria-hidden />;
}

/** A row of key/value pairs separated by hairlines. Used for dense readouts. */
export function DataRow({
  entries,
  className = '',
}: {
  entries: readonly { label: ReactNode; value: ReactNode; tone?: 'default' | 'accent' | 'danger' | 'warn' }[];
  className?: string;
}): ReactElement {
  return (
    <div className={`flex flex-wrap items-stretch divide-x divide-line border-line ${className}`}>
      {entries.map((entry, i) => (
        <div key={i} className="min-w-0 flex-1 px-3 py-2">
          <div
            className={`tabular truncate font-mono text-sm font-semibold ${
              entry.tone === 'accent' ? 'text-accent'
                : entry.tone === 'danger' ? 'text-danger'
                : entry.tone === 'warn' ? 'text-warn'
                : 'text-ink'
            }`}
          >
            {entry.value}
          </div>
          <div className="label mt-1 truncate">{entry.label}</div>
        </div>
      ))}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }): ReactElement {
  return <div className="px-3 py-6 text-center font-mono text-[11px] text-ink-faint">{children}</div>;
}
