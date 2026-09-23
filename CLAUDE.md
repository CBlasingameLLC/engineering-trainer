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
packs by the schema, and never enters a release build. Don't weaken that.

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
- **E2E: match on `data-item-id` / `data-kc-id`, never rendered text.** KaTeX
  rewrites stems, so text scraping is unstable. More importantly: **never
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
  coordinates, not at bounding boxes.
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

`content/misconceptions/families.yaml` declares the cross-course families, and
only that — per-item feedback already names the number the learner actually
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

The cross-course claim is now testable rather than inferred. All 34 KCs carry
items, including the six math KCs that Circuits I points at, so a propagated
diagnosis ("your calculus is the problem") can be confirmed by asking instead of
only asserted.

Not built:

- **Curriculum breadth** (Phase 4) — Tier 1 is complete, and EE 3300 Circuits II
  is now in: 19 KCs across sinusoidal steady state, AC power, frequency
  response, coupling and three-phase, and the s-domain, with cross-course edges
  into EE 2300 and MATH 3323. EE 3370 Signals and EE 3340 Electromagnetics have
  no graph yet.
- **Nonlinear devices** — diodes and transistors need Newton-Raphson around the
  existing stamping code plus a device-model library. Nothing in Circuits I/II
  requires them.
- **Schematic reconstruction from a netlist.** Importing a deck gives topology
  with no geometry; the Lab says so rather than inventing a layout.
- **Nothing reads the competency radar for remediation.** The misconception
  families carry a `competency`, and the dashboard draws that axis, but the two
  are not joined.

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
