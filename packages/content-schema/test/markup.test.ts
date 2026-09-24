import { describe, expect, it } from 'vitest';
import { findMarkupProblems, segmentMarkup } from '../src/markup.js';

describe('segmentMarkup', () => {
  it('splits prose from inline maths', () => {
    expect(segmentMarkup('Find $V_{th}$ across $a$-$b$')).toEqual([
      { kind: 'text', value: 'Find ' },
      { kind: 'math', value: 'V_{th}' },
      { kind: 'text', value: ' across ' },
      { kind: 'math', value: 'a' },
      { kind: 'text', value: '-' },
      { kind: 'math', value: 'b' },
    ]);
  });

  // The bug this exists to pin: scanning for a single `$` reads `$$x$$` as an
  // empty span, the body as prose, and another empty span — so the whole
  // equation renders as its own LaTeX source.
  it('recognises display maths before inline maths', () => {
    expect(segmentMarkup('Solve $$F = A + B$$ now')).toEqual([
      { kind: 'text', value: 'Solve ' },
      { kind: 'display', value: 'F = A + B' },
      { kind: 'text', value: ' now' },
    ]);
  });

  it('keeps an unclosed delimiter visible rather than dropping the rest', () => {
    expect(segmentMarkup('a $x = 1 and more')).toEqual([
      { kind: 'text', value: 'a ' },
      { kind: 'text', value: '$x = 1 and more' },
    ]);
  });
});

describe('findMarkupProblems', () => {
  it('passes prose whose maths is delimited', () => {
    expect(findMarkupProblems('A $12\\,\\mathrm{V}$ source feeds $R_1$.')).toEqual([]);
    expect(findMarkupProblems('Solve $$\\begin{aligned}x &= 1\\end{aligned}$$')).toEqual([]);
  });

  it('catches a unit written outside a span', () => {
    const [problem] = findMarkupProblems('A 12\\,\\text{V} source');
    expect(problem?.reason).toBe('undelimited-latex');
  });

  it('catches a braced subscript outside a span', () => {
    expect(findMarkupProblems('Find V_{th}')[0]?.reason).toBe('undelimited-latex');
  });

  it('catches an unclosed delimiter', () => {
    expect(findMarkupProblems('a $x = 1 and more')[0]?.reason).toBe('unbalanced-delimiter');
  });

  it('does not flag bare prose or currency-free text', () => {
    expect(findMarkupProblems('How many of its 8 outputs are high?')).toEqual([]);
  });
});
