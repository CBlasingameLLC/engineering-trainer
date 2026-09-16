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
| `packages/answer-engine` | Grading: numeric+units, symbolic, truth-table, choice | Same code path grades a learner *and* verifies an author |
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

Not built:

- **Curriculum breadth** (Phase 4) — the 6 math KCs referenced as cross-course
  prerequisites have no items; `pnpm content stats` lists them. Also no
  `truth-table` or `symbolic` items yet, though both are in the schema and the
  answer engine grades them.
- **Nonlinear devices** — diodes and transistors need Newton-Raphson around the
  existing stamping code plus a device-model library. Nothing in Circuits I/II
  requires them.
- **Schematic reconstruction from a netlist.** Importing a deck gives topology
  with no geometry; the Lab says so rather than inventing a layout.
- **Misconception feed** — misconception events are recorded and stored, but
  nothing surfaces the recurring ones or launches a targeted drill.

**The desktop build works and has been run.** `tauri build` produces `.deb`,
`.rpm` and `.AppImage`; the app has been launched headless under Xvfb, driven
through onboarding, and confirmed to apply both migrations and write to SQLite.

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
