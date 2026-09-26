import type { KcDiagnosis, MasteryBand } from '@et/domain';

/**
 * Presentation vocabulary for mastery.
 *
 * Diagnosis carries more information than band, and the UI leads with it
 * wherever there is room: "gap" and "decayed" can produce the same composite
 * score but call for opposite responses - instruction versus a single review -
 * so collapsing them into one colour throws away the most useful thing the
 * model knows.
 */

export const BAND_STYLE: Record<MasteryBand, { bar: string; text: string; chip: string; label: string }> = {
  gap: { bar: 'bg-danger/15', text: 'text-danger', chip: 'bg-danger/15 text-danger', label: 'Gap' },
  developing: { bar: 'bg-warn/15', text: 'text-warn', chip: 'bg-warn/15 text-warn', label: 'Developing' },
  proficient: { bar: 'bg-info/15', text: 'text-info', chip: 'bg-info/15 text-info', label: 'Proficient' },
  mastered: { bar: 'bg-accent/15', text: 'text-accent', chip: 'bg-accent/15 text-accent', label: 'Mastered' },
};

export const DIAGNOSIS_COPY: Record<KcDiagnosis, { label: string; detail: string; chip: string }> = {
  untested: {
    label: 'Untested',
    detail: 'No evidence yet.',
    chip: 'bg-surface-2 text-ink-dim',
  },
  gap: {
    label: 'Gap',
    detail: 'Little sign this was learned. Needs instruction, not review.',
    chip: 'bg-danger/15 text-danger',
  },
  decayed: {
    label: 'Decayed',
    detail: 'Learned before, faded since. A review session should restore it quickly.',
    chip: 'bg-gold/15 text-gold',
  },
  fragile: {
    label: 'Fragile',
    detail: 'Partially held. Inconsistent under pressure.',
    chip: 'bg-warn/15 text-warn',
  },
  solid: {
    label: 'Solid',
    detail: 'Learned and still available.',
    chip: 'bg-accent/15 text-accent',
  },
};

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
