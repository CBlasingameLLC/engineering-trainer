# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
pnpm test                      # vitest run — all packages and tools
pnpm test packages/domain/test/bkt.test.ts   # one file
pnpm exec vitest run -t "converges"          # one test by name
pnpm test:watch

pnpm lint                      # eslint flat config, repo-wide
pnpm typecheck                 # tsc --build --force

pnpm content validate          # schema + KC references + prerequisite cycles
pnpm content verify [--strict] # independently re-derive every stated answer
pnpm content stats             # bank coverage by KC × difficulty band
pnpm content build --variants=18   # regenerate the shared bank from generators
pnpm content import [--personal]   # move verified packs out of content/inbox

pnpm dev                       # vite renderer in a browser (no Rust needed)
pnpm tauri dev                 # desktop shell (needs Rust + webkit2gtk)
```

`pnpm content`, not `pnpm pack` — pnpm reserves `pack` as a built-in.

**After any dependency or workspace change, run the install CI actually runs:**

```sh
pnpm install --frozen-lockfile
```

Plain `pnpm install` silently repairs a stale lockfile and carries on; CI passes
`--frozen-lockfile` and refuses it. So a lockfile that never learned about a new
dependency passes locally and fails every CI job at the install step, before a
single test runs.

**Typechecking is two projects, and `pnpm typecheck` only covers one.** The root
`tsconfig.json` explicitly excludes `apps/desktop`. CI runs both; do the same
before pushing:

```sh
pnpm exec tsc --noEmit -p tsconfig.json
pnpm exec tsc --noEmit -p apps/desktop/tsconfig.json
```

End-to-end (three steps, in order — the driver needs a served build):

```sh
pnpm --filter @et/desktop build
pnpm --filter @et/desktop preview &     # 127.0.0.1:4173
pnpm --filter @et/desktop e2e           # placement -> gap report
pnpm --filter @et/desktop e2e:lab       # skill tree + schematic editor + solver
pnpm --filter @et/desktop e2e:misconceptions  # answer into traps -> feed -> drill
pnpm --filter @et/desktop e2e:theme     # theme cycle + dark-mode contrast, all routes
pnpm --filter @et/desktop e2e:exam      # sealed exam -> hand in -> report -> triage
```

The container's preinstalled Chromium can lag the installed Playwright. When the
driver reports a missing executable, point it at what is actually there rather
than downloading a second copy:

```sh
E2E_CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome pnpm --filter @et/desktop e2e
```

CI installs its own matching browser, so this override is local-only.

## Architecture

### The claim the code exists to support

"Passed the course" and "can do it today" are different facts. The app measures
the second, and traces a weakness through a prerequisite graph to its root —
across course boundaries, so a circuits failure can point at the calculus
underneath it. Nearly every design decision below follows from that.

### Layer boundaries

| Package | Role | Hard rule |
|---|---|---|
| `packages/domain` | Mastery model, KC graph, adaptive testing | **Pure. Zero I/O. Imports nothing from `apps/`.** Verifiable without a browser. |
| `packages/content-schema` | Zod contract for items, packs, curriculum, credentials | The single shape every content producer emits |
| `packages/answer-engine` | Grading: numeric+units, symbolic, Boolean, truth-table, choice | Same code path grades a learner *and* verifies an author |
| `packages/generators` | Parameterized item generators | Answers computed from parameters, never transcribed |
| `packages/circuits` | Netlist model, MNA solver, schematic net extraction, grading | Zero runtime deps. ngspice is a **test-only** oracle |
| `tools/pack-cli` | `validate`/`verify`/`stats`/`build`/`import` | The gate all content passes through |
| `apps/desktop` | React renderer + Tauri shell | Orchestration only — **no mastery logic lives here** |

`packages/ui` is declared but an empty stub.

### The mastery triad — three models, three questions

Combining them is the product; each alone is misleading.

- **Elo** (`mastery/elo.ts`) — *how hard should the next question be?* Drives
  item selection via Fisher information. Multivariate: an item weighted
  70/30 across two KCs updates both proportionally.
- **BKT** (`mastery/bkt.ts`) — *was this ever learned?* Two-state HMM with
  slip/guess/transit.
- **FSRS** (`mastery/retention.ts`, via `ts-fsrs`) — *is it still there?*

```
M(t) = P(mastery) × R(t)
```

**Keep the factors separate.** Their product is the number on screen; the pair
is the diagnosis. High P with low R is `decayed` (needs one review session); low
P is a `gap` (needs instruction). Collapsing them routes remediation in exactly
the wrong direction. See `KcDiagnosis` in `mastery/composite.ts`.

### Dual-axis tagging

Every KC carries one `domain` (`circuits`, `math`, `physics`, …) and ≥1
`competency` (`math-execution`, `concept`, `modeling`, `strategy`, `numeracy`,
`visual`). Mastery aggregates over both independently. The competency axis is
what makes weak `math-execution` across circuits *and* signals *and* physics
legible as algebra discipline rather than three unrelated course problems — a
conclusion unreachable from per-course scores.

### The KC graph crosses courses on purpose

`content/curriculum/*.yaml` defines KCs and prerequisite edges. Edges like
`math2472.integration-by-parts → ee2300.rc-step-response` are the whole point; a
per-course graph cannot represent them and so cannot diagnose them. `KcGraph`
rejects cycles, self-loops and dangling refs at construction.

CAT propagation (`cat/propagation.ts`) mines those edges: confident success
raises ancestor priors by `γ^d` (a floor), confident failure lowers descendants
(a ceiling). That is how ~45 items place a learner across a whole course.

### Attempts are the only truth

`attempts` is append-only. Every ability, belief and retention figure is a
**projection replayed from it** on load (`apps/desktop/src/features/learner-model.ts`).
This costs a replay at startup and buys the ability to retune slip/guess rates,
Elo learning rate or decay thresholds and re-score all history under the new
model. Inferred priors are stored *separately* from attempts — they are
conclusions, not evidence.

Replay order matters and is deliberate: reported coursework (weakest) → graph
inferences → direct responses (always wins).

### Two storage adapters, one interface

`StorageAdapter` (`apps/desktop/src/storage/types.ts`) has an IndexedDB
implementation and a SQLite/`tauri-plugin-sql` one. The renderer never learns
which it got. This is not gold-plating: it is the only reason the placement flow
can be driven headlessly in CI on a machine that cannot build Tauri, and it
keeps the desktop build packaging rather than a fork.

### Content pipeline: accepted, never trusted

Five producers (generators, scheduled Claude Routines, LLM batches, hand-authored,
book imports) emit **one schema** and pass **one gate**. `pack verify` runs five
checks; the load-bearing ones:

- **self-consistency** — feed the item's own answer through the real grader.
- **explanation-agreement** — the closing steps must contain the stated answer.
  This is the characteristic failure of model-written content (five correct
  steps, then a sixth number that doesn't follow) and nothing structural catches it.
- **regeneration** — re-run the generator at the stored seed; require an exact match.

- **symbolic-residual** — re-derive the answer numerically by a *different*
  method than the one that produced it. Without this a symbolic item is
  effectively unverified: self-consistency grades the stored expression against
  itself and always passes, and explanation-agreement reads numeric keys only,
  so regeneration is the only check left and it proves determinism rather than
  correctness. A symbolic answer declares a `residual` (`derivative-of`,
  `antiderivative-of`, `ode-solution`) and the gate differentiates, integrates
  or substitutes to confirm it. Finite differences know nothing about the power
  rule and so cannot inherit a mistake in it.

Know the limit: for generator items verification is near-total. For model-written
numeric items there is no independent solver, so the gate proves internal
consistency, not physics — it cannot catch reasoning and an answer that are
confidently wrong in the same direction. Prefer a generator wherever the topic
admits one; reserve model authoring for what generators structurally cannot do.

`licenseTier` is load-bearing for the commercial path. `personal-only` content
lives in gitignored `content/packs/personal/`, is rejected from redistributable
packs by the schema, and is bundled only when a build sets
`VITE_ET_INCLUDE_PERSONAL=1` — default off, so an artifact built without
thinking about it is safe to hand to someone else, and CI never sets it. A
build that did include it says so in the app with the item count, because three
enforcement points that are invisible from inside the running binary cannot be
checked by whoever is holding it. Don't weaken any of the four.

The flag exists because the rule was previously "never bundled anywhere",
which sounds stricter and was useless: owned material could not sharpen its
owner's training either, so the rule had all of the cost and none of the
benefit. The distinction that matters is redistributable against personal, not
development against production — a learner's own installer is a production
build.

Raw course material — homework, slides, notes, book chapters, a syllabus — goes
in gitignored `content/coursework/<COURSE>/`. It is *source*, not content: the
app never reads it, and the route from a PDF to a served question runs through
a KC graph, generators, and the same gate as everything else.
`content/coursework/README.md` has the layout and the decision that matters
most — how much of a course is generatable. A closed-form course like
PHYS 2335 is twenty generators with near-total verification. Deciding this
before starting is what stops a hand-authored item shipping with the
confidence of a computed one.

**The decision is per unit, not per course, and EE 4392 is why.** That course
was written down here as ungeneratable before anyone read its material, on the
reasonable-sounding grounds that lithography and deposition are definitional.
About a third of it turned out to be ordinary engineering algebra: Deal-Grove
is a quadratic, the yield models are three closed forms, Rayleigh resolution
and depth of focus are one line each, and the resist contrast chain is four.
That third is ten generators verified as completely as any in the repository.
The other two thirds — why a purge gas is inert, which step activates a PAG,
what the RCA sequence is for — genuinely cannot be generated and are
hand-authored in `ee4392-concepts-v1`, with `producer: hand` so `regeneration`
skips them and the weaker guarantee is visible in the data rather than only in
a comment.

The general lesson is that "definitional course" is a property of a unit's
content, not of a course's name, and that the way to find out is to read the
worked examples rather than the topic list.

## Conventions that will bite you

- **Touching a generator? Rebuild and commit the bank.** CI runs
  `pnpm content build --variants=18` and fails on any diff under
  `content/packs/shared/`. Item ids embed the seed (`<generator-id>.s<seed>`),
  so this catches drift rather than silently renumbering.
- **CI verifies `--strict`, and an item with no trap fails it.** The shared
  bank is entirely generator output, so every strict warning is something a
  generator should never emit: a numeric item with no misconception trap, a
  symbolic answer with no residual, a worked solution whose closing steps never
  state the result. Running it non-strict let 14 trapless items ship — they
  graded correctly and diagnosed nothing, which looks identical to working.
  When `separatedTraps` empties a trap list, the fix is at the *draw*: constrain
  the parameters so the trap cannot collide with the answer (power sets at
  |A| = 2 make 2^n, 2n and n^2 coincide; a two-mesh circuit with a tiny shared
  branch puts the uncoupled shortcut inside answer tolerance). A trap that
  clamps onto the answer — `max(1, value - 1)` when the answer is 1 — needs a
  different trap, not a different draw.
- **Maths outside `$...$` renders as its own source, and `pack verify` now
  rejects it.** The renderer typesets delimited spans and passes the rest
  through as text, so `12\,\text{V}` written into prose reaches the learner as
  those literal characters. Every other gate passes it: the answer verifies,
  the explanation agrees, the generator regenerates. 860 of 1213 items shipped
  that way. `segmentMarkup` in `@et/content-schema` is the single definition of
  the markup — the renderer and the `latex-delimiters` check both import it, so
  the gate audits what the learner actually sees rather than a second opinion
  about it. Three separate causes produced the same symptom, and only the first
  is obvious: units emitted undelimited by `engineering()`; `$$...$$` display
  maths that the segmenter read as two empty spans around plain text; and
  `\\n\\n` in a template literal, which is a literal backslash-n, not a
  paragraph break.
- **An answer kind is a claim about what can be measured, and adding one is
  sometimes the only fix.** MATH 2358 is assessed almost entirely by writing
  proofs; the bank's answer to that was eight multiple-choice items asking
  which strategy "is the natural first choice". That is recognition, not
  construction, and no quantity of further such items would have closed the
  gap, because the gap was in the engine. There are now three kinds:
  `ordering` (arrange shuffled lines, with distractors that belong to no valid
  proof), `proof-skeleton` (separately graded fields — base case, hypothesis,
  what the step must establish, the algebraic bridge) and `proof-rubric` (write
  it out, then score it against published criteria). None of them reads
  English. When the real task cannot be graded, the move is to find the parts
  of it that can be, not to grade something adjacent and relabel it.
- **`evidenceWeight` is how a self-scored attempt is allowed to count less, and
  `kcRefs.weight` cannot be used for it.** That field distributes an item
  across components and the schema requires it to sum to 1, so setting it to
  0.35 does not down-weight an item — it makes the item invalid. The attempt
  carries `evidenceWeight` instead, and the replay scales both the Elo step and
  the BKT blend by it. It lives on the *attempt*, not looked up from the bank at
  replay time, because the replay reads the attempt log: an item whose weight
  changes later must not silently rescore attempts already made under the old
  one. Rubric items are 0.35; everything graded is 1.
- **A new field on `Attempt` needs a SQLite migration or the desktop build
  drops it silently.** `appendAttempt` in the Tauri adapter lists its columns
  explicitly, so an added field typechecks, works in the browser (IndexedDB
  stores the object structurally) and is lost on the only build that ships.
  `evidenceWeight` needed migration 003 plus both the insert and the select.
  The two adapters are deliberately interchangeable; that is exactly what makes
  this divergence invisible until someone runs the installer.
- **A knowledge component is only as honest as the generators under it, and
  item count cannot tell you.** `ee3300.laplace-circuit-analysis` carried 18
  items across two difficulty bands and looked, on every coverage report the
  repository produces, like a well-served KC. All 18 came from one generator
  that asks for the time constant of a first-order RL pole — a chapter 7
  question wearing an s-domain label. Nothing in the bank touched a transform
  pair, a partial fraction or a value theorem, so a learner could answer every
  item in the unit and be reported proficient in the s-domain for it. That is
  worse than an empty KC: an empty one is visible in `pack stats` and gets
  filled, whereas this one was invisible precisely because it was full.
  `stats` counts items per KC and per band and cannot count *what they ask*, so
  when a KC covers a chapter, check that its generators span the chapter's own
  sections rather than that its cells are non-zero. It is now nine KCs.

- **An exam is a date, and a date is not a week.** Coverage blocks are written
  in weeks because that is how a syllabus states them and because a term that
  slips is one line to fix. An exam is a specific morning, and the quantity
  every urgency figure is built on is how many *days* away it is — a week
  number cannot tell Saturday from the Monday two days later. `daysUntil`
  reduces both sides to a whole-day index before subtracting, and it has to
  reduce them *differently*: the exam is a bare calendar date with no timezone,
  while `now` is an instant that must be read as the local day it falls on.
  Subtracting raw milliseconds — the obvious version, and what the week
  arithmetic gets away with — puts anyone west of UTC a day out for most of
  their waking hours.
- **An exam's scope can leave its own course, so `units` entries may be
  `COURSE:Unit Name`.** EE 3300's first exam examines the first-order response:
  Nilsson chapter 7, re-taught in week 3 of Circuits II and tested alongside
  chapter 8, but owned by EE 2300's curriculum. A scope confined to its own
  course would have to omit that material or duplicate the component into
  EE 3300, and duplicating it splits the learner's evidence across two
  components that mean the same thing. The prefix is parsed in exactly one
  place — `examUnits` in `@et/content-schema` — and every consumer downstream
  works with the resolved `{course, unit}` pair, because `packages/domain`
  mirrors the term structurally and a second parser for one notation is how
  two parsers drift.
- **A colour in this app is a role, not a value.** Every surface used to carry
  `bg-white dark:bg-slate-900`, which meant the two themes were separate
  palettes maintained in parallel on three hundred elements, and neither was
  designed. `index.css` now defines one set of semantic tokens — `--surface`,
  `--line`, `--text-dim`, `--accent`, the four band colours — and redefines
  them under `.dark`; `tailwind.config.js` maps them to `bg-surface`,
  `border-line`, `text-ink-dim` and so on. A screen built from roles reads as
  one instrument in either theme, and a new route cannot ship with a missing
  dark variant because there are no dark variants to miss.

  Two traps from doing the migration mechanically. Folding a palette by name
  collapses distinctions that carried meaning: `amber` and `yellow` both map to
  "warn", which silently made `mastered` and `developing` the same colour —
  two bands that mean opposite things. And a regex that tidies the whitespace
  left by removed `dark:` classes will happily eat the indentation of a SQL
  template literal, so scope it to class strings or check the diff with
  `git diff -w` and revert anything that comes back empty.
- **A course that states quantities in a prefixed unit needs `unfoldedUnit`.**
  `engineering()` folds the prefix back into the value, which is right when the
  stored answer is in the base unit — 4700 ohms written as 4.7 k. It is wrong
  when the course writes, and the answer is stored in, the prefixed unit: a
  wavelength of 633 nm, an oxide 0.4 um thick, a fringe 353 mm across.
  `\mathrm{nm}` folds 633 to 6.33e-7, so a correct worked solution disagrees
  with a correct answer key and the gate reports the item as broken. Bracing
  the prefix — `\mathrm{{n}m}` — renders identically and leaves the number
  bare. There is one spelling of that, `unfoldedUnit` in `rng.ts`, because
  there were briefly two: EE 4392 solved it one way, PHYS 2335 independently
  hit the same wall and shipped the bug the other file had already fixed.

  `sci` in the same file is the second instance of that story and settles the
  pattern. `trimNumber` hands off to JavaScript's own formatter outside a
  narrow range, so a small value reaches the learner as the literal characters
  `1.25e-8`, and `extractNumbers` reads them as the two numbers 1.25 and -8 —
  a correct worked solution disagreeing with a correct answer key. EE 4392 hit
  it with doping concentrations and wrote a private fix; EE 3300 hit it with
  transform values and three items failed the gate. Both now call the one in
  `rng.ts`. The rule this repository keeps relearning: when a second course
  hits a formatting problem a first course already solved, the fix belongs in
  `rng.ts` in the same change, not beside the caller.
- **An SI prefix is only a prefix in front of a unit symbol.** `extractNumbers`
  folds the prefix into the value so `4.7\,\mathrm{k\Omega}` compares against a
  stored 4700. The rule it applies has to be narrow, because a leading prefix
  letter is not evidence of a prefix: `mol`, `m/s` and `kg` all start with one
  and none is scaled, so folding them divides a molar quantity by a thousand
  and multiplies a mass by a thousand. `PREFIXABLE_UNITS` in `verify.ts` lists
  what a prefix may attach to, longest first so `VAR` is not read as `VA`, and
  the group must close straight after — `ms` folds, `mol` does not. A unit's
  own exponent is excluded too, so `\mathrm{m^2}` contributes no bare 2; a
  spurious number can only ever make explanation-agreement pass when it should
  have failed. The consequence for generators: `engineering()` is for units on
  that list and nothing else. A temperature, a mass, a mole count or any
  compound unit is written with the plain formatter in `phys2335/common.ts`,
  which emits no prefix at all.
- **Units are set in `\mathrm`, not `\text`, and nothing may parse either.**
  `\Omega` and `\mu` are maths-mode macros, so `\text{k\Omega}` asks KaTeX to
  typeset a maths macro in text mode — which is every resistance and every
  microamp in the bank. Changing it broke 40 items and 15 tests, all through
  the same mistake in three places: `extractNumbers` in `verify.ts` and
  `quantitiesFrom` in the generator tests both recovered SI prefixes by
  matching `\text{` against the rendered stem. Reading presentation back as
  data is fine here — it is what keeps the cross-checks independent of the
  generator's own arithmetic — but it must not pin one typesetting macro, and a
  parse that comes up short must throw rather than compare against `NaN`.
- **A figure's values agree with the answer by construction; its geometry does
  not.** A generator draws a figure from the same parameters that produce the
  answer, so the numbers on it are right for free. Wiring is not: a figure can
  describe a different circuit entirely and every other check still passes,
  because the answer key is correct and the picture still looks like a circuit.
  So each figure declares what simulating it must produce, `gradeFigure` turns
  the drawing back into a netlist and solves it, and both the generator tests
  and the `figure-agreement` check in `pack verify` run it. A source-less
  network asserts `r(node)` instead, graded by `inputResistance` — suppress the
  sources, drive one amp in, read the voltage, which is the Thevenin procedure
  stated as code.
- **Net labels are what make a figure addressable.** Nets are otherwise
  numbered by traversal order, so nothing outside the drawing can say "the node
  the question calls A". `Schematic.labels` names a net from a point on it, and
  ground still wins: a net that is both grounded and labelled is node 0,
  because the reference node is not a naming choice.
- **SPICE drives current from n+ through the source to n-.** A current source
  that must push current *into* the node above it therefore has its n+ pin at
  the bottom — rotation 180 in figure coordinates. Getting this backwards
  negates the answer and nothing but a simulation notices, which is the whole
  reason figures are simulated.
- **A phasor is graded in polar even though it is stored in rectangular.** The
  error lives in the polar form: magnitude right and phase inverted is a
  conjugate, usually a reactance sign, and a rectangular comparison reports it
  as simply wrong. Two tolerances, not interchangeable — relative on magnitude,
  absolute degrees on angle, because five percent of 2 degrees and of 170
  degrees are different demands. Two cases fail silently without a test: the
  wrap point (+179 and -179 are 2 apart, so the angle comparison wraps) and
  zero magnitude (every angle is the same phasor there, so no angle is
  demanded). Six notations parse, because rejecting five of them teaches
  notation rather than circuits.
- **A term is the only document about *when*, and it joins by a bare string.**
  `content/terms/*.yaml` says which unit of which course is live in which week,
  and the join to the KC graph is the `unit` field matched by name. A typo binds
  to nothing, schedules nothing, and is indistinguishable at runtime from a
  quiet week — there is no later symptom — so `pack validate` checks every unit
  name against the curriculum and refuses the build. A course listed on a term
  with no curriculum document yet is the benign case and is reported as a note,
  because "this is on your term and the app knows nothing about it" is worth
  saying out loud; a term view that hid it would be disagreeing with the term.
- **The term's value is `termReadiness`, not the schedule.** What is being
  covered this week is something the learner already knows. What has quietly
  decayed underneath the unit that starts in two weeks is not, and it needs both
  halves — the schedule and the measured decay — which nothing else holds at
  once. Ranking multiplies shortfall, edge strength and imminence; dropping the
  last one gives a list that is true and useless. `untested` is included
  deliberately rather than filtered, or the term view is quietest for the
  learner who has used the app least.
- **Never synthesize a study history to seed FSRS.** A semester of fabricated
  reviews inflates stability to S≈270d, so a year-old prerequisite reports
  R≈0.88 and looks perfectly retained — defeating the entire product. Use
  `seedFromCourseCompletion()`: one distant event, S≈1–8d. A regression test
  pins this.
- **`DEFAULT_CAT_CONFIG.targetSe = 1.2` is calibrated, not arbitrary.** SE falls
  as `2/√n`; 0.35 would need ~33 items *per KC* and turns every session into
  `budget-exhausted`. Measured median SE at the 45-item budget is ~1.46.
- **Wrap every trap list in `separatedTraps()`.** Traps are computed from the
  same parameters as the answer, so some draws collapse them onto it (R1≈R2
  makes an inverted-divider trap equal the right answer). An overlapping trap
  diagnoses a *correct* response as an error — worse than no trap. Generators
  also constrain parameters via `resampleUntil`; the filter is the backstop.
- **Vary difficulty within a generator.** Use `adjustDifficulty(base, signals)`
  keyed off the drawn parameters. A generator emitting all items at one ability
  point gives CAT nothing to select between.
- **Symbolic answers are checked by random-point sampling, not CAS `simplify`.**
  `Vs*R2/(R1+R2)` and `Vs/(1+R1/R2)` simplify to different trees; a structural
  comparison marks a correct answer wrong.
- **An e2e driver must wait for `boot()`, not for the network.**
  `waitUntil: 'networkidle'` says the network went quiet, which happens several
  hundred milliseconds before the content bank is parsed and the attempt log
  replayed — and that gap grows every time content is added. A driver that
  *counts* the onboarding prompt at that moment instead of *waiting* for it
  silently skips onboarding and then fails on the next wait, with a message
  about the dashboard that points at the wrong place entirely. Two drivers did
  this and each surfaced one content round apart, which is the tell: a race
  that only loses once the app gets slower is a race that will find you later.
  Wait for onboarding *or* the dashboard, with `.or()` — the `text=` engine has
  no alternation, so a comma-separated pair waits forever on a literal string.
- **E2E: match on `data-item-id` / `data-kc-id`, never rendered text.** KaTeX
  rewrites stems, so text scraping is unstable. The shell redesign proved the
  rest of the case: four drivers broke at once on `text=Engineering Trainer`,
  `Begin placement`, `By competency` and half a dozen button labels, none of
  which was a product change — every one was a heading being reworded. They
  drive off `data-testid` now, including the navigation rail (`nav-dashboard`,
  `nav-diagnostics`, …), so a rewrite of the copy cannot present itself as a
  regression.

  The sharpest instance was a `document.body.innerText.includes('Placement
  results')` guard, which survived the rename and then stopped matching anyway:
  `innerText` returns *rendered* text, and the heading had become
  `text-transform: uppercase`, so the page said `PLACEMENT RESULTS`. The driver
  did not fail at the heading — it waited out a twenty-second timeout at the
  end of every session, reporting a question that never arrived. A CSS property
  can change what a text match sees without changing a character of the source,
  which is one more reason the match belongs on an id. More importantly: **never
  maintain a hand-written list of expected outcomes beside the list that drives
  the run.** That pair drifts the moment content is added and reports a content
  addition as a product regression. This bug class has appeared twice (a stale
  pack-cli fixture, then the e2e expectation regex); the current driver records
  `missedKcs` *during* the session and asserts against that.
- **Boolean equivalence is decided, not sampled.** `checkSymbolic` infers
  equality from agreement at random points, which is right over the reals.
  `checkBoolean` enumerates all `2^n` assignments, so a pass is a proof. Never
  route a Boolean item through the symbolic path: for courses whose subject is
  *when two expressions are equal*, grading by inference is the wrong tool.
- **Adjacent letters are an implicit AND, so variables are one letter plus
  digits.** `AB` must mean `A AND B` for digital logic, so `Cin` parses as
  `C AND i AND n`. Column headings are passed separately from expression
  variables; `rowsOf` rejects the mismatch with that explanation rather than
  failing deep inside evaluation.
- **A simplification item needs a literal budget.** Without `maxLiterals` a
  minimisation question grades its own input correct — the unsimplified
  expression is equivalent to itself. The budget comes from `minimalSop`, which
  is pinned against all 256 three-variable functions for both equivalence and
  for never claiming a budget its own output exceeds. An equivalence *trap* for
  the unsimplified form is impossible by construction; the grader names
  `boolean.not-fully-simplified` instead.
- **A generator belongs to exactly one pack.** `generatorsForCourse` routes by
  the *highest-weighted* KC, not by any referenced KC. Generators span courses
  on purpose — a forced first-order ODE is 80% DiffEq and 20% exponentials —
  but matching on any reference emitted the same item id into two packs, and an
  item loaded twice counts twice as evidence. The duplicate-stem guard in
  `buildItems` works within a pack and cannot see across them.
- **An e2e driver must load every pack, not a named one.** `placement-flow.mjs`
  read `ee2300-core-v1.json` by name; when the math packs landed, 9 served items
  fell through to a catch-all that types `1`, so they were answered wrong and
  then reported as gaps in KCs the run believed it had answered correctly. The
  app was right and the harness was lying about it.
- **Symbolic answers accept a family, not a string.** An antiderivative is
  defined up to a constant, so `x^4/4`, `x^4/4 + 5` and `x^4/4 + C` are all
  correct. `checkSymbolic` derives that from the item's declared residual rather
  than from a flag an author has to remember, and compares differences instead
  of values. Unknown symbols in the learner's input are bound to one fixed
  arbitrary value for the run, which is what makes "differs by a constant"
  testable.
- **Truth-table cells are tri-state, not boolean.** An all-false grid is a
  valid answer, so a `boolean[]` cannot distinguish "every row is 0" from "not
  started" — and submitting the second as the first records a wrong answer
  against someone who never answered. Unset rows keep Submit disabled.
- **LaTeX in a template literal needs doubled backslashes.** `\\ldots` in
  source produces `\ldots` in the string; a single backslash is eaten by JS
  escaping and renders as `ldots`. eslint's `no-useless-escape` catches it,
  which is why that rule is worth keeping loud.
- **A 2px wire is a 2px hit target.** Every selectable thing in the schematic
  editor carries an invisible fat hit shape: a 10px transparent stroke under
  each wire, a body rect inside each component group, a disc under each ground.
  Without them a drawn wire cannot be clicked at all, and a component symbol is
  grabbable only along the strokes themselves. Note that a part's *bounding
  box* is not its body — the designator and value labels extend it to the
  right, so its centre is usually empty canvas. Drive gestures at grid
  coordinates, not at bounding boxes. The same asymmetry runs the other way
  for drawing: a designator placed to the right of a *two-terminal* body lands
  inside an op-amp triangle, which reaches 1.9 grid units right of its centre
  and 2.4 up, so that one is labelled above the part instead.
- **Never `setPointerCapture` on an element whose children must stay
  clickable.** Capture retargets the subsequent `click` to the capture element,
  so a canvas that captures on pointerdown to start a pan makes every node
  inside it unclickable. Window-level `pointermove`/`pointerup` listeners give
  the same drag-outside-the-element behaviour without touching targeting. Both
  the skill tree and the Circuit Lab pan this way.
- **A drag is one undo step.** The gesture takes a history checkpoint on its
  first actual movement and then edits silently; pushing history inside
  `onChange` would make undo walk back a pixel at a time. Drag offsets are
  recomputed from the gesture's origin on every move rather than accumulated,
  so crossing grid cells does not drift.
- **Display preferences live in `localStorage`, never in the storage adapter.**
  The attempt log is the durable record the model replays from; a theme toggle
  has no business appearing in an export of someone's learning history.
- **Tauri window permissions are granted explicitly**, like the SQL ones.
  `core:window:allow-set-fullscreen` and `-is-fullscreen` are listed in
  `capabilities/default.json` rather than assumed from `core:default`.
- **No `any` in domain code** — `@typescript-eslint/no-explicit-any` is an
  error outside `test/` and the e2e driver.
- **Vite is pinned to `127.0.0.1`** in `apps/desktop/vite.config.ts`. `localhost`
  resolves to `::1` in CI while the readiness poll dials IPv4; don't revert it.
- **A silent `boot()` failure is a blank "Loading…" screen.** `store.boot()`
  captures startup errors into `bootError` and `App` renders them. This is how
  the ACL failure above was diagnosed at all — before it, a broken storage
  backend was indistinguishable from a slow start. Keep it.
- **CI pins pnpm to 10** via `pnpm/action-setup`'s `version` input, independently
  of the action's own version. The committed lockfile was written by pnpm 10; a
  newer pnpm major rewrites its format and then fails the frozen install. Bump
  the action freely, but move `version` only when regenerating the lockfile on
  the same pnpm major locally.
- **A hand-edited `package.json` needs `pnpm install` afterwards.** Adding a
  workspace dependency by editing the file directly leaves the lockfile without
  the new specifier. Every CI job then dies at
  `ERR_PNPM_OUTDATED_LOCKFILE` — all of them at once, which looks alarming and
  is actually one cause. Prefer `pnpm --filter <pkg> add <dep>`; if you do edit
  by hand, run `pnpm install` and commit the lockfile with the change.
- **`packages/*/src/*.ts` imports use `.js` extensions** (`verbatimModuleSyntax`,
  bundler resolution). Workspace `@et/*` aliases are declared independently in
  **four** configs that must stay in sync:
  `tsconfig.json`, `vitest.config.ts`, `apps/desktop/vite.config.ts` and
  `apps/desktop/tsconfig.json`. Miss one and a new package resolves in tests but
  not in the app, or typechecks at the root and not in the renderer — adding
  `@et/circuits` produced 35 errors from exactly one missing entry.

### Circuits: own solver, ngspice as oracle

`packages/circuits` implements Modified Nodal Analysis from scratch — stamps,
LU with partial pivoting, DC/AC/transient — and that solver is what grades
`circuit-build` items and drives the Circuit Lab.

ngspice (via `eecircuit-engine`, a 40 MB WebAssembly build) is a **devDependency
used only in tests**, as an oracle: the same deck goes to both and the node
voltages must agree. It is deliberately not shipped. Grading has to be
deterministic and instant, and a solver that can emit *its own node equations*
is worth more in a teaching tool than one that can only emit answers — that
output is the entire reason the Lab exists.

Things that will bite:

- **SPICE takes the first line as the title, unconditionally.** A heuristic that
  guesses whether line 1 is a title or a part turned `rc step response` into a
  resistor named `rc`. `parseNetlist` returns `notes` when the title looks like
  a component, so a pasted fragment says so instead of silently losing a part.
- **`M` is milli, `MEG` is mega**, case-insensitively. Getting it backwards
  scales a part by 10^9. Pinned by test.
- **Geometry is the only stored state.** Connectivity is re-derived by
  `extractNets` on every render, so a drawing and its circuit cannot disagree.
  Pin offsets live in `PIN_LAYOUT` in `schematic.ts` and the SVG symbols must
  match them, or parts look connected and simulate unconnected.
- **`circuit-build` items carry a `reference` deck.** `pack verify` simulates it
  against the item's own measurements — an unsatisfiable design spec is the
  design equivalent of a wrong answer key, and nothing else can detect one.
- Design tasks are graded on **measured behaviour, never topology**, so two
  2.35k resistors in series pass a 4.7k spec.

### Exam mode is not adaptive, and that is the point

`packages/domain/exam/` assembles a paper before the clock starts and never
changes it. Adaptive selection maximises Fisher information by keeping every
question near the learner's ability, which is the right way to *measure an
ability* in the fewest items and the wrong way to answer "could you do this
paper on Monday" — a CAT that stops asking about chapter 12 after two wrong
answers has measured accurately and said nothing about the exam. So
`assembleExam` works to coverage rules instead: every unit in scope appears or
is named as having no content, every component is asked before any is asked
twice, and difficulty spans the pool rather than tracking ability. Units are
interleaved rather than grouped, because grouping makes "ran out of time" and
"does not know chapter 12" produce identical data.

**There are two scores and they must stay apart**, for the same reason
`M = P × R` keeps its factors apart. `scoreAtBell` is what the paper was worth;
`scoreOverall` counts answers made after the clock expired. Someone who answers
26 of 30 correctly but reaches 18 inside the time has a pace problem, not a
circuits problem, and one percentage reports them identically to someone who
knew 18 and guessed. The clock is therefore allowed to run out *without ending
the sitting* — stopping there would throw away the evidence that distinguishes
them. Unreached items are graded as wrong at the bell, because a blank answer
is worth zero on the real paper.

**Everything the report shows is clipped to the exam's own scope.** An item is
evidence about every component its `kcRefs` name, and those reach outside the
paper: a chapter 12 question weighted 0.8 s-domain and 0.2 frequency response
says a little about frequency response, which is not on this exam. Left in, the
breakdown grew a "Frequency Response 100%" row off a fifth of one answer, in a
list the learner reads as what the exam covered. The evidence is not discarded —
the full weighted tally stays in `byKc` and the learner model replays from the
attempt log — only the *report* is scoped, because that is what it claims to be
about.

### Scheduling against the calendar

`termReadiness` ranks by imminence in **weeks**, read off the coverage schedule,
which says what is being *taught*. `examPriorities` ranks by proximity in
**days**, read off the exams, which say what is being *tested*. Both are needed
and they disagree: a unit can be live all month and never examined, and a unit
finished three weeks ago can be half of Monday's paper.

Proximity decays hyperbolically (`1 / (1 + days/5)`), not exponentially. An
exponential with any sensible half-life drives everything past a fortnight to
arithmetic zero, which turns a study planner into a cramming tool — the only
thing it can ever say is "revise the next exam", and the decayed prerequisite
that will sink the exam after it stays invisible until that one is imminent too.

**A component examined by two exams belongs to the nearer one**, not to the sum.
Summing would let three distant exams outrank Monday's, which is the exact
inversion the module exists to prevent.

### The competency axis now reads back

The radar had been drawn since the dashboard shipped and nothing read it, which
was a real defect rather than a missing nicety: a competency score cannot be
acted on by itself, because there is no such thing as a math-execution
exercise. `misconception/remediation.ts` is the join. The radar says which axis
is costing most, the misconception family (which carries a `competency`) names
the specific habit on it, and `assembleDrill` builds a set from items that can
actually catch that error. Each of the three pieces existed; none pointed at
the next.

Ranking multiplies the family's recency-weighted score by `(1 - composite) ×
(1 + relativeShortfall)`. The relative term is the radar's actual claim — an
axis 0.2 below someone's own average is *their* particular weakness, which is a
different statement from a low absolute score — and the absolute term is the
floor, because relative shortfall alone ranks nothing for a learner who is
uniformly weak.

### The misconception loop

Every distractor and trap names the error that produces it, and those tags have
been recorded since the first placement exam. `packages/domain/misconception/`
is what reads them.

Ranking is a judgement about three things, and getting any of them wrong
produces a plausible-looking feed that points at the wrong work:

- **Recency.** Five sign errors last March and none since is solved. A raw count
  cannot tell that apart from five this week, so hits are weighted by an
  exponential half-life and stale ones drop out entirely.
- **Spread.** The same error under six KCs is a habit; six hits under one KC is
  confusion about one topic. The first is more valuable to fix and invisible to
  any per-course view — the competency-axis argument applied to mistakes.
- **Direction.** `trend` compares the two halves of the window, and reserves
  `worsening` for a real increase. A first appearance is `new`: labelling every
  error in a learner's first session as deteriorating is both false and
  indistinguishable from the case that genuinely is.

`content/misconceptions/families.yaml` declares the cross-course families and
which misconception belongs to which, and only that. **A misconception used by
an item and absent from this file is invisible to the feed** — recorded on the
attempt, named in the item's own feedback, and missing from the ranking that
decides what to drill. Eighteen shipped that way with EE 3300 before anyone
noticed, so a new generator's traps are catalogued in the same change that
introduces them — per-item feedback already names the number the learner actually
wrote, and duplicating it centrally would create two descriptions that drift.
The catalog lives outside `content/curriculum/` because everything in that
directory is parsed as a course document.

A drill is built **only from items that can detect the target error**. A clean
run through items that could not have caught it proves nothing, which is why
`assembleDrill` filters on tagged traps rather than on KC, spreads across topics
so the habit is tested rather than one question memorised, and aims *below* the
learner's ability — adaptive selection matches difficulty to ability to measure,
but remediation wants the question answerable so the correction is the only hard
part.

### Gamification is built to discourage grinding

`xpForAttempt` pays a bonus scaled by how far FSRS retrievability had *fallen*
before the attempt. Recalling something nearly forgotten pays up to double;
a fresh, fully-retrievable item pays no bonus at all. This is deliberate and
load-bearing — the naive alternative (flat XP per correct answer) rewards
answering easy questions you already know, which is exactly the study behaviour
the rest of the app exists to detect. Tests pin the ordering.

Challenge exams require **coverage as well as score**: 100% on two of four
topics fails. A crest is a claim about a course, and a mechanic that accepted
narrow evidence would be lying to the person using it.

## State of the build

Plan Phases 0–3 are complete. The EE 2300 vertical slice runs end to end
(onboard → adaptive placement → gap report → dashboard), plus the skill tree,
XP/streaks/quests/challenge exams, and the circuit lab with its own MNA solver.

The app is now built around the term rather than around the bank. The shell is
a navigation rail plus a briefing that states a conclusion — "EE 3300 Exam 1 is
in 2 days: 11 of 25 measured components are below proficient, 2 never asked
about" — computed from the model rather than chosen from a template, and it
only ever states what has been measured. Underneath it: exam readiness per
paper, a priority queue weighted by days-to-exam, and the competency→habit→drill
join.

Diagnostics are plural on purpose, because "where are my gaps" is not one
question. `Diagnostics` offers four scopes: a **triage** run across every exam
still ahead with items shared by proximity (untimed, explains as it goes); a
**sealed exam** per paper, assembled from its own scope and timed, where the
clock can expire without ending the sitting; **placement** across selected
courses; and placement across everything. All four feed the same model, so
none of the evidence is wasted whichever is chosen.

The cross-course claim is now testable rather than inferred. All 34 KCs carry
items, including the six math KCs that Circuits I points at, so a propagated
diagnosis ("your calculus is the problem") can be confirmed by asking instead of
only asserted.

Not built:

- **Write the graph from the syllabus, never from the course title.** PHYS 2335
  is called Waves and Heat and its first three weeks are fluid statics; its
  last third is optics. Neither was in the graph until the syllabus arrived,
  because the graph had been written from the name, and the term schedule that
  followed had the course almost exactly backwards. The same mistake in the
  other direction produced the EE 4392 claim below. A syllabus is the only
  document that says what a course actually contains, and a topic list is not
  one.

  MATH 2358 made it a third way, with no course title or catalog description
  involved at all: its graph had been written from what a discrete maths
  course *usually* contains. Against the real syllabus — which carries a
  numbered day-by-day list of Rosen sections, the most directly sourced
  document in this repository — nine taught sections had no component, two of
  them on the first test, while ten components covered chapters the course
  never reaches. Genre knowledge is not a syllabus either.

  EE 3300 then made the same mistake wearing a better disguise. Its graph was
  written from the *catalog description* — "transient analysis, application of
  Laplace transforms, Bode plots, and network principles" — which sounds like a
  syllabus and is not one. It omits second-order circuits and all of chapter
  12, which between them are half of the first exam, while "network principles"
  read as three-phase and coupling, which by the eleventh lecture had not been
  mentioned once. A catalog description says what a course is *about*. Only the
  lecture sequence says what it *covers*, and when a syllabus carries no topic
  schedule — EE 3300's carries three exam dates and nothing else — the lecture
  files are the primary document, and what is inferred past them gets marked
  PROJECTED in the term rather than written as fact.
- **Curriculum breadth** (Phase 4) — Tier 1 is complete. EE 3300 Circuits II is
  in: 32 KCs across sinusoidal steady state, AC power, second-order circuits,
  frequency response, coupling and three-phase, and the s-domain. The last two
  of those units are the ones the lectures have not reached yet; the second-order
  and s-domain units were added once the lecture decks arrived and showed that
  chapters 8 and 12 are half of the first exam and were missing entirely. PHYS 2335 Waves and Heat is in:
  20 KCs across oscillations, mechanical waves, heat and the ideal gas, and
  thermodynamics — the first course in the bank whose subject is not
  electrical, which is what makes the competency axis testable rather than
  asserted. MATH 2358 Discrete Mathematics I is in, and now matches its own
  syllabus rather than the genre: 32 KCs, with sequences and summations,
  cardinality, base representations, linear congruences, graph isomorphism,
  shortest paths and tree traversal added, and ten components covering Rosen
  chapters 6, 8, 9 and 12 moved to units the term never schedules.
  EE 3370 Signals and EE 3340 Electromagnetics have no graph yet, and
  neither does PHYS 2325 Mechanics, which is why several honest PHYS 2335 edges
  (energy, momentum, Newton's second law) are missing rather than wrong.
- **Nonlinear devices** — diodes and transistors need Newton-Raphson around the
  existing stamping code plus a device-model library. Nothing in Circuits I/II
  requires them.
- **Schematic reconstruction from a netlist.** Importing a deck gives topology
  with no geometry; the Lab says so rather than inventing a layout.

**The desktop build works and has been run.** `tauri build` produces `.deb`,
`.rpm` and `.AppImage`; the app has been launched headless under Xvfb, driven
through onboarding, and confirmed to apply both migrations and write to SQLite.

**Windows is built in CI, not here.** `cargo-xwin` installs and the MSVC target
adds cleanly, but `xwin` must fetch the MSVC CRT from Microsoft and the
container's network policy denies that host. `.github/workflows/windows.yml`
builds `.msi` and `.exe` on `windows-latest` and uploads them as run artifacts.
Nobody has run those binaries — they compile and bundle, which is not the same
claim.

That build found a third defect of the same shape as the two below: the `.exe`
compiled cleanly and then WiX failed with `Couldn't find a .ico icon`, because
`bundle.icon` in `tauri.conf.json` declared only `icons/icon.png` while
`icons/icon.ico` sat undeclared on disk. **The Linux bundler tolerates a
partial icon list and the Windows ones do not**, so the omission was invisible
on the only platform that had ever run a bundler. All five standard variants
are declared now; don't prune it back to what one platform needs.

Compiling it the first time found two defects the browser path cannot surface,
both now fixed and both worth knowing about:

- **`@tauri-apps/plugin-sql` was never installed.** A local `.d.ts` shim declared
  the module and `vite.config.ts` marked it external, so the compiler and the
  bundler were each satisfied while the package was absent — the build emitted a
  bare specifier the WebView could not resolve. Do not mark Tauri plugin packages
  external; they are ordinary npm packages that talk over IPC, and the dynamic
  import behind `isTauri()` already keeps them out of the browser bundle.
- **Tauri v2 denies every plugin command without a capability.**
  `src-tauri/capabilities/default.json` grants the SQL commands. `sql:default` is
  a **read-only** set (close/load/select), so `sql:allow-execute` is granted
  explicitly — relying on the default would boot and read fine and then fail the
  first write.

`tauri-plugin-sql` puts `trainer.db` in the app **config** dir
(`~/.config/<identifier>/` on Linux), not the data dir.
