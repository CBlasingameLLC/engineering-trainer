/**
 * Boolean expressions: parsing, evaluation and exact equivalence.
 *
 * Worth its own module rather than folding into the symbolic path, because
 * Boolean equivalence is *decidable* and general symbolic equivalence is not.
 * `checkSymbolic` samples random points and infers equality from agreement,
 * which is the right compromise over the reals. Over `n` Boolean variables
 * there are only `2^n` points, so the whole domain can be enumerated: two
 * expressions either agree everywhere or they do not, and the answer is a proof
 * rather than a confidence. That matters for a course whose entire subject is
 * when two expressions are the same.
 *
 * The notation is deliberately permissive, because the two courses that need it
 * write Boolean algebra differently and both are correct. A digital logic text
 * writes `F = AB' + CD`; a discrete maths text writes `(p ∧ ¬q) ∨ (r ∧ s)`.
 * Rejecting either one would be marking notation rather than understanding.
 */

export type BoolNode =
  | { kind: 'var'; name: string }
  | { kind: 'const'; value: boolean }
  | { kind: 'not'; operand: BoolNode }
  | { kind: 'binary'; op: BinaryOp; left: BoolNode; right: BoolNode };

export type BinaryOp = 'and' | 'or' | 'xor' | 'nand' | 'nor' | 'xnor' | 'implies' | 'iff';

export class BooleanParseError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BooleanParseError';
  }
}

type Token =
  | { t: 'var'; name: string }
  | { t: 'const'; value: boolean }
  | { t: 'op'; op: BinaryOp }
  | { t: 'not' }
  | { t: 'prime' }
  | { t: 'lparen' }
  | { t: 'rparen' };

const KEYWORDS: Record<string, Token> = {
  and: { t: 'op', op: 'and' },
  or: { t: 'op', op: 'or' },
  xor: { t: 'op', op: 'xor' },
  nand: { t: 'op', op: 'nand' },
  nor: { t: 'op', op: 'nor' },
  xnor: { t: 'op', op: 'xnor' },
  implies: { t: 'op', op: 'implies' },
  iff: { t: 'op', op: 'iff' },
  not: { t: 'not' },
  true: { t: 'const', value: true },
  false: { t: 'const', value: false },
};

/** Multi-character symbols, longest first so `<->` is never read as `<-` then `>`. */
const SYMBOLS: [string, Token][] = [
  ['<->', { t: 'op', op: 'iff' }],
  ['<=>', { t: 'op', op: 'iff' }],
  ['->', { t: 'op', op: 'implies' }],
  ['=>', { t: 'op', op: 'implies' }],
  ['&&', { t: 'op', op: 'and' }],
  ['||', { t: 'op', op: 'or' }],
  ['↔', { t: 'op', op: 'iff' }],
  ['→', { t: 'op', op: 'implies' }],
  ['⊕', { t: 'op', op: 'xor' }],
  ['∧', { t: 'op', op: 'and' }],
  ['∨', { t: 'op', op: 'or' }],
  ['·', { t: 'op', op: 'and' }],
  ['*', { t: 'op', op: 'and' }],
  ['&', { t: 'op', op: 'and' }],
  ['+', { t: 'op', op: 'or' }],
  ['|', { t: 'op', op: 'or' }],
  ['^', { t: 'op', op: 'xor' }],
  ['¬', { t: 'not' }],
  ['~', { t: 'not' }],
  ['!', { t: 'not' }],
  ["'", { t: 'prime' }],
  ['‾', { t: 'prime' }],
  ['(', { t: 'lparen' }],
  [')', { t: 'rparen' }],
];

/**
 * A variable is one letter with any trailing digits.
 *
 * This is what makes implicit AND workable. `AB` has to mean `A AND B` for a
 * digital logic course, and it cannot also be allowed to mean a variable called
 * "AB" — one reading has to win, and juxtaposition-as-product is the universal
 * convention in the notation that uses it. Trailing digits are kept with the
 * letter so `X1X2` still splits into two variables rather than four tokens.
 */
function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const ch = source[i]!;
    if (/\s/.test(ch)) { i++; continue; }

    const symbol = SYMBOLS.find(([text]) => source.startsWith(text, i));
    if (symbol) { tokens.push(symbol[1]); i += symbol[0].length; continue; }

    if (ch === '0' || ch === '1') { tokens.push({ t: 'const', value: ch === '1' }); i++; continue; }

    if (/[A-Za-z]/.test(ch)) {
      // Take the whole alphanumeric run first: a keyword is only a keyword when
      // it stands alone, so `or` is an operator while `o` and `r` inside a
      // longer run are two variables.
      const run = /^[A-Za-z][A-Za-z0-9]*/.exec(source.slice(i))![0];
      const keyword = KEYWORDS[run.toLowerCase()];
      if (keyword) { tokens.push(keyword); i += run.length; continue; }

      // Otherwise split the run into single-letter variables with their digits.
      for (const part of run.match(/[A-Za-z][0-9]*/g) ?? []) tokens.push({ t: 'var', name: part });
      i += run.length;
      continue;
    }

    throw new BooleanParseError(`Unexpected character "${ch}" in the expression.`);
  }

  return tokens;
}

/**
 * Recursive descent, lowest precedence outermost.
 *
 * Precedence follows the convention both courses share: NOT binds tightest,
 * then AND, then XOR, then OR, then implication, then equivalence. Implication
 * is right-associative because `p -> q -> r` conventionally means
 * `p -> (q -> r)`, and reading it left-associatively silently changes the
 * truth table rather than failing.
 */
export function parseBoolean(source: string): BoolNode {
  const tokens = tokenize(source);
  let pos = 0;

  const peek = (): Token | undefined => tokens[pos];
  const eat = (t: Token['t']): boolean => (peek()?.t === t ? (pos++, true) : false);

  const startsFactor = (token: Token | undefined): boolean =>
    token !== undefined && (token.t === 'var' || token.t === 'const' || token.t === 'not' || token.t === 'lparen');

  const binaryAt = (ops: readonly BinaryOp[]): BinaryOp | null => {
    const token = peek();
    return token?.t === 'op' && ops.includes(token.op) ? token.op : null;
  };

  function parseIff(): BoolNode {
    let left = parseImplies();
    for (let op = binaryAt(['iff']); op !== null; op = binaryAt(['iff'])) {
      pos++;
      left = { kind: 'binary', op, left, right: parseImplies() };
    }
    return left;
  }

  function parseImplies(): BoolNode {
    const left = parseOr();
    const op = binaryAt(['implies']);
    if (op === null) return left;
    pos++;
    return { kind: 'binary', op, left, right: parseImplies() };
  }

  function parseOr(): BoolNode {
    let left = parseXor();
    for (let op = binaryAt(['or', 'nor']); op !== null; op = binaryAt(['or', 'nor'])) {
      pos++;
      left = { kind: 'binary', op, left, right: parseXor() };
    }
    return left;
  }

  function parseXor(): BoolNode {
    let left = parseAnd();
    for (let op = binaryAt(['xor', 'xnor']); op !== null; op = binaryAt(['xor', 'xnor'])) {
      pos++;
      left = { kind: 'binary', op, left, right: parseAnd() };
    }
    return left;
  }

  function parseAnd(): BoolNode {
    let left = parseUnary();
    for (;;) {
      const op = binaryAt(['and', 'nand']);
      if (op !== null) {
        pos++;
        left = { kind: 'binary', op, left, right: parseUnary() };
        continue;
      }
      // Juxtaposition is AND: `AB`, `A(B+C)`, `A'B`.
      if (startsFactor(peek())) {
        left = { kind: 'binary', op: 'and', left, right: parseUnary() };
        continue;
      }
      return left;
    }
  }

  function parseUnary(): BoolNode {
    if (eat('not')) return { kind: 'not', operand: parseUnary() };
    return parsePostfix();
  }

  function parsePostfix(): BoolNode {
    let node = parseAtom();
    while (eat('prime')) node = { kind: 'not', operand: node };
    return node;
  }

  function parseAtom(): BoolNode {
    const token = peek();
    if (token === undefined) throw new BooleanParseError('The expression ends early — something is missing after the last operator.');
    if (token.t === 'var') { pos++; return { kind: 'var', name: token.name }; }
    if (token.t === 'const') { pos++; return { kind: 'const', value: token.value }; }
    if (token.t === 'lparen') {
      pos++;
      const inner = parseIff();
      if (!eat('rparen')) throw new BooleanParseError('A parenthesis was opened and never closed.');
      return inner;
    }
    throw new BooleanParseError('Expected a variable, a constant or an opening parenthesis.');
  }

  const tree = parseIff();
  if (pos !== tokens.length) throw new BooleanParseError('The expression has trailing characters that do not parse.');
  return tree;
}

/** Every variable the expression reads, in first-seen order. */
export function booleanVariables(node: BoolNode): string[] {
  const seen: string[] = [];
  const walk = (n: BoolNode): void => {
    if (n.kind === 'var') { if (!seen.includes(n.name)) seen.push(n.name); }
    else if (n.kind === 'not') walk(n.operand);
    else if (n.kind === 'binary') { walk(n.left); walk(n.right); }
  };
  walk(node);
  return seen;
}

export function evaluateBoolean(node: BoolNode, scope: Readonly<Record<string, boolean>>): boolean {
  switch (node.kind) {
    case 'const': return node.value;
    case 'var': {
      const value = scope[node.name];
      if (value === undefined) throw new BooleanParseError(`No value supplied for variable "${node.name}".`);
      return value;
    }
    case 'not': return !evaluateBoolean(node.operand, scope);
    case 'binary': {
      const a = evaluateBoolean(node.left, scope);
      const b = evaluateBoolean(node.right, scope);
      switch (node.op) {
        case 'and': return a && b;
        case 'or': return a || b;
        case 'xor': return a !== b;
        case 'nand': return !(a && b);
        case 'nor': return !(a || b);
        case 'xnor': return a === b;
        case 'implies': return !a || b;
        case 'iff': return a === b;
      }
    }
  }
}

/**
 * Assignments in ascending binary order, first variable most significant.
 *
 * This ordering is the one every textbook prints and the one
 * `truthTableAnswerSchema` documents, so a stored row list and a rendered grid
 * cannot disagree about which row is which.
 */
export function assignments(variables: readonly string[]): Record<string, boolean>[] {
  const rows: Record<string, boolean>[] = [];
  for (let mask = 0; mask < 2 ** variables.length; mask++) {
    const scope: Record<string, boolean> = {};
    variables.forEach((name, index) => {
      scope[name] = Boolean((mask >> (variables.length - 1 - index)) & 1);
    });
    rows.push(scope);
  }
  return rows;
}

/** The output column of an expression over the given variables. */
export function truthTable(node: BoolNode, variables: readonly string[]): boolean[] {
  return assignments(variables).map((scope) => evaluateBoolean(node, scope));
}

/**
 * Exhaustive equivalence.
 *
 * Every assignment is checked, so a `true` here is a proof rather than
 * evidence. Variables are supplied rather than inferred from the expressions
 * because an answer may legitimately drop one: `AB + AB'` simplifies to `A`,
 * and comparing over `A` alone would call them different by accident.
 */
export function booleanEquivalent(a: BoolNode, b: BoolNode, variables: readonly string[]): boolean {
  return assignments(variables).every((scope) => evaluateBoolean(a, scope) === evaluateBoolean(b, scope));
}

/** How many literals an expression contains — the usual proxy for "simplified". */
export function literalCount(node: BoolNode): number {
  switch (node.kind) {
    case 'var': return 1;
    case 'const': return 0;
    case 'not': return literalCount(node.operand);
    case 'binary': return literalCount(node.left) + literalCount(node.right);
  }
}

/**
 * Render a parsed expression as LaTeX.
 *
 * Exists for the live preview in the session player, and it is worth more here
 * than in the symbolic case: Boolean notation hides two things a learner cannot
 * see in their own typing. `AB` is a product they wrote without an operator,
 * and `A + BC` groups the way it does because AND binds tighter than OR.
 * Printing the parse back shows both, so a wrong answer is a wrong answer
 * rather than a misread.
 *
 * Parentheses are emitted from the tree's actual shape rather than preserved
 * from the source, which is the point — if the learner's grouping differs from
 * what they intended, the preview is where it shows.
 */
export function booleanToTex(node: BoolNode): string {
  const PRECEDENCE: Record<BinaryOp, number> = {
    and: 5, nand: 5, xor: 4, xnor: 4, or: 3, nor: 3, implies: 2, iff: 1,
  };
  const SYMBOL: Record<BinaryOp, string> = {
    and: '\\cdot', nand: '\\barwedge', xor: '\\oplus', xnor: '\\odot',
    or: '+', nor: '\\downarrow', implies: '\\rightarrow', iff: '\\leftrightarrow',
  };

  const render = (n: BoolNode, parentPrecedence: number): string => {
    switch (n.kind) {
      case 'var': return n.name.length > 1 ? `${n.name[0]}_{${n.name.slice(1)}}` : n.name;
      case 'const': return n.value ? '1' : '0';
      case 'not': {
        // Overline for a single symbol, prime for anything compound: an overline
        // stretched across a long expression is unreadable at body-text size.
        const inner = n.operand;
        return inner.kind === 'var' || inner.kind === 'const'
          ? `\\overline{${render(inner, 99)}}`
          : `\\left(${render(inner, 0)}\\right)'`;
      }
      case 'binary': {
        const precedence = PRECEDENCE[n.op];
        const body = `${render(n.left, precedence)} ${SYMBOL[n.op]} ${render(n.right, precedence + 1)}`;
        return precedence < parentPrecedence ? `\\left(${body}\\right)` : body;
      }
    }
  };

  return render(node, 0);
}
