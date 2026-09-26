import { describe, expect, it } from 'vitest';
import { competencyFindings, remediationPlan } from '../src/misconception/remediation.js';
import type { MisconceptionFamilyRollup } from '../src/misconception/family.js';
import type { DrillCandidate } from '../src/misconception/drill.js';
import type { AxisScore } from '../src/mastery/composite.js';
import type { Competency } from '../src/types.js';

/**
 * The join these tests exist for: the radar has been drawn since the dashboard
 * shipped and nothing read it. A competency score cannot be acted on by itself
 * — there is no such thing as a math-execution exercise — so the value is
 * entirely in whether the weakest axis leads to a specific habit and a drill
 * that can catch it.
 */

const axis = (key: Competency, composite: number, tested = 6): AxisScore<Competency> => ({
  key, composite, pMastery: composite, retrievability: 1, kcCount: 8, testedCount: tested,
  band: composite > 0.65 ? 'proficient' : 'developing',
});

const family = (
  id: string, competency: Competency, score: number, courses: string[], member: string,
): MisconceptionFamilyRollup => ({
  family: { id, title: id, description: `${id} description`, competency },
  members: [{
    misconceptionId: member, hits: [], totalHits: score, recentHits: score,
    kcs: [`${courses[0]}.one`], courses, crossCourse: courses.length > 1,
    lastSeen: new Date('2026-09-20'), score, trend: 'steady', drillDue: true,
  }],
  score, totalHits: score, courses, crossCourse: courses.length > 1,
  lastSeen: new Date('2026-09-20'), drillDue: true,
});

const candidates: DrillCandidate[] = [
  { itemId: 'i1', kcId: 'ee3300.a', difficultyB: 0.1, diagnoses: ['sign.dropped'] },
  { itemId: 'i2', kcId: 'ee3300.b', difficultyB: 0.4, diagnoses: ['sign.dropped'] },
  { itemId: 'i3', kcId: 'math.c', difficultyB: -0.2, diagnoses: ['sign.dropped'] },
  { itemId: 'i4', kcId: 'ee3300.d', difficultyB: 0.3, diagnoses: ['units.unconverted'] },
];

describe('remediationPlan', () => {
  const competencies = [
    axis('math-execution', 0.35),
    axis('concept', 0.78),
    axis('numeracy', 0.72),
  ];

  it('ranks the habit on the weakest axis first, even against a louder one elsewhere', () => {
    const plan = remediationPlan(
      [
        family('unit-handling', 'numeracy', 14, ['ee3300'], 'units.unconverted'),
        family('sign-convention', 'math-execution', 12, ['ee3300', 'math2472'], 'sign.dropped'),
      ],
      competencies, candidates,
    );
    expect(plan[0]?.family.id).toBe('sign-convention');
    expect(plan[0]?.rank).toBe(1);
    expect(plan[0]?.competency).toBe('math-execution');
  });

  it('carries a drill built only from items that can detect the target', () => {
    const plan = remediationPlan(
      [family('sign-convention', 'math-execution', 12, ['ee3300', 'math2472'], 'sign.dropped')],
      competencies, candidates, { drillSize: 3 },
    );
    expect(plan[0]?.drill.map((d) => d.itemId).sort()).toEqual(['i1', 'i2', 'i3']);
    expect(plan[0]?.drill.some((d) => d.itemId === 'i4')).toBe(false);
  });

  // A habit that is diagnosed and not yet remediable is worth saying out loud.
  // Offering a drill that cannot test what it claims to is worse than none.
  it('reports an empty drill rather than inventing one', () => {
    const plan = remediationPlan(
      [family('unmapped', 'strategy', 9, ['ee3300'], 'nothing.can-catch-this')],
      competencies, candidates,
    );
    expect(plan[0]?.drill).toEqual([]);
  });

  it('records the relative shortfall the radar is actually claiming', () => {
    const plan = remediationPlan(
      [family('sign-convention', 'math-execution', 12, ['ee3300'], 'sign.dropped')],
      competencies, candidates,
    );
    // mean of 0.35, 0.78, 0.72 is 0.6167; math-execution sits 0.2667 below it.
    expect(plan[0]?.relativeShortfall).toBeCloseTo(0.2667, 3);
  });

  it('still ranks when every axis is equally weak, where relative shortfall is zero', () => {
    const flat = [axis('math-execution', 0.3), axis('concept', 0.3), axis('numeracy', 0.3)];
    const plan = remediationPlan(
      [
        family('quiet', 'concept', 3, ['ee3300'], 'sign.dropped'),
        family('loud', 'math-execution', 18, ['ee3300'], 'sign.dropped'),
      ],
      flat, candidates,
    );
    expect(plan.map((p) => p.family.id)).toEqual(['loud', 'quiet']);
    expect(plan[0]?.relativeShortfall).toBe(0);
  });

  it('treats an unmeasured axis neutrally instead of as a total gap', () => {
    const plan = remediationPlan(
      [family('untouched', 'visual', 10, ['ee3300'], 'sign.dropped')],
      [...competencies, axis('visual', 0, 0)], candidates,
    );
    expect(plan[0]?.competencyComposite).toBe(0.5);
  });

  it('honours a limit', () => {
    const plan = remediationPlan(
      [
        family('a', 'math-execution', 12, ['ee3300'], 'sign.dropped'),
        family('b', 'numeracy', 9, ['ee3300'], 'units.unconverted'),
        family('c', 'concept', 4, ['ee3300'], 'sign.dropped'),
      ],
      competencies, candidates, { limit: 2 },
    );
    expect(plan).toHaveLength(2);
  });
});

describe('competencyFindings', () => {
  it('flags the axis that is this learner\'s particular weakness', () => {
    const findings = competencyFindings(
      [axis('math-execution', 0.35), axis('concept', 0.78), axis('numeracy', 0.72)],
      [family('sign-convention', 'math-execution', 12, ['ee3300'], 'sign.dropped')],
    );
    expect(findings[0]?.competency).toBe('math-execution');
    expect(findings[0]?.standoutWeakness).toBe(true);
    expect(findings[0]?.families.map((f) => f.family.id)).toEqual(['sign-convention']);
    expect(findings.find((f) => f.competency === 'concept')?.standoutWeakness).toBe(false);
  });

  // Six axes drifting around a mean must not produce a finding every session.
  it('does not call an ordinary spread a weakness', () => {
    const findings = competencyFindings(
      [axis('math-execution', 0.60), axis('concept', 0.63), axis('numeracy', 0.66)],
      [],
    );
    expect(findings.every((f) => !f.standoutWeakness)).toBe(true);
  });

  it('never flags an axis with no measurements behind it', () => {
    const findings = competencyFindings(
      [axis('math-execution', 0.8), axis('visual', 0, 0)],
      [],
    );
    expect(findings.find((f) => f.competency === 'visual')?.standoutWeakness).toBe(false);
  });
});
