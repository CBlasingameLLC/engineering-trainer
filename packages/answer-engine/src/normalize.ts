/**
 * Input normalisation for learner-typed answers.
 *
 * Engineers do not type answers the way a parser wants them. They write
 * `4.7k`, `5 kΩ`, `10µF`, `-3,200`. None of that parses as-is, and rejecting
 * it would score correct physics as wrong — the single most corrosive failure
 * a trainer can have. Normalisation happens before parsing, never after.
 */

/** Unicode and typographic substitutions that mathjs cannot read. */
const CHARACTER_MAP: [RegExp, string][] = [
  [/Ω/g, 'ohm'], // Ω OHM SIGN
  [/Ω/g, 'ohm'], // Ω GREEK CAPITAL OMEGA
  [/µ/g, 'u'], // µ MICRO SIGN
  [/μ/g, 'u'], // μ GREEK SMALL MU
  [/[−–—]/g, '-'], // minus sign, en/em dash
  [/[×⋅∙]/g, '*'], // ×, ⋅, ∙
  [/÷/g, '/'],
  [/[‘’“”]/g, ''], // stray quotes
];

/**
 * SI prefixes written without a unit, e.g. `4.7k` meaning 4700.
 *
 * Only applied when no unit follows, because `4.7k` is ambiguous but `4.7 kohm`
 * is not — and mathjs handles the latter correctly on its own.
 */
const BARE_PREFIXES: Record<string, number> = {
  T: 1e12, G: 1e9, M: 1e6, k: 1e3, K: 1e3,
  m: 1e-3, u: 1e-6, n: 1e-9, p: 1e-12, f: 1e-15,
};

/** Spellings learners use that mathjs does not recognise. */
const UNIT_ALIASES: [RegExp, string][] = [
  [/\bohms\b/gi, 'ohm'],
  [/\bOhm\b/g, 'ohm'],
  [/\bamps?\b/gi, 'A'],
  [/\bvolts?\b/gi, 'V'],
  [/\bwatts?\b/gi, 'W'],
  [/\bfarads?\b/gi, 'F'],
  [/\bhenr(?:y|ies)\b/gi, 'H'],
  [/\bhertz\b/gi, 'Hz'],
  [/\bseconds?\b/gi, 's'],
  [/\bradians?\b/gi, 'rad'],
  [/\bdegrees?\b/gi, 'deg'],
];

export function normalizeInput(raw: string): string {
  let s = raw.trim();
  for (const [pattern, replacement] of CHARACTER_MAP) s = s.replace(pattern, replacement);

  // Thousands separators, but not decimal commas in isolation: 3,200 -> 3200.
  s = s.replace(/(\d),(?=\d{3}\b)/g, '$1');

  for (const [pattern, replacement] of UNIT_ALIASES) s = s.replace(pattern, replacement);

  // Bare SI prefix with nothing after it: "4.7k" -> "4.7e3".
  s = s.replace(/(-?\d+(?:\.\d+)?)\s*([TGMkKmunpf])\s*$/, (_m, num: string, prefix: string) => {
    const factor = BARE_PREFIXES[prefix];
    return factor === undefined ? `${num}${prefix}` : `${Number(num) * factor}`;
  });

  return s.replace(/\s+/g, ' ').trim();
}

/** Split a normalised answer into its numeric part and its unit, if any. */
export function splitValueAndUnit(normalized: string): { expression: string; unit: string } {
  const match = /^(.*?)\s*([a-zA-Z][a-zA-Z0-9^/*·\-]*)$/.exec(normalized);
  if (!match?.[1]?.trim()) return { expression: normalized, unit: '' };
  return { expression: match[1].trim(), unit: match[2] ?? '' };
}
