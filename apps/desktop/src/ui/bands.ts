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
  gap: { bar: 'bg-red-500', text: 'text-red-700', chip: 'bg-red-100 text-red-800', label: 'Gap' },
  developing: { bar: 'bg-amber-500', text: 'text-amber-700', chip: 'bg-amber-100 text-amber-800', label: 'Developing' },
  proficient: { bar: 'bg-blue-500', text: 'text-blue-700', chip: 'bg-blue-100 text-blue-800', label: 'Proficient' },
  mastered: { bar: 'bg-yellow-500', text: 'text-yellow-700', chip: 'bg-yellow-100 text-yellow-800', label: 'Mastered' },
};

export const DIAGNOSIS_COPY: Record<KcDiagnosis, { label: string; detail: string; chip: string }> = {
  untested: {
    label: 'Untested',
    detail: 'No evidence yet.',
    chip: 'bg-slate-100 text-slate-600',
  },
  gap: {
    label: 'Gap',
    detail: 'Little sign this was learned. Needs instruction, not review.',
    chip: 'bg-red-100 text-red-800',
  },
  decayed: {
    label: 'Decayed',
    detail: 'Learned before, faded since. A review session should restore it quickly.',
    chip: 'bg-violet-100 text-violet-800',
  },
  fragile: {
    label: 'Fragile',
    detail: 'Partially held. Inconsistent under pressure.',
    chip: 'bg-amber-100 text-amber-800',
  },
  solid: {
    label: 'Solid',
    detail: 'Learned and still available.',
    chip: 'bg-emerald-100 text-emerald-800',
  },
};

export const pct = (x: number): string => `${Math.round(x * 100)}%`;
