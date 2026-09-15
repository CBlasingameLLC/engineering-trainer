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
pnpm --filter @et/desktop e2e
```

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
| `tools/pack-cli` | `validate`/`verify`/`stats`/`build`/`import` | The gate all content passes through |
| `apps/desktop` | React renderer + Tauri shell | Orchestration only — **no mastery logic lives here** |

`packages/circuits` and `packages/ui` are declared but empty stubs (Phase 3).

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
- **`packages/*/src/*.ts` imports use `.js` extensions** (`verbatimModuleSyntax`,
  bundler resolution). Workspace `@et/*` aliases are declared independently in
  three configs that must stay in sync — `tsconfig.json` paths,
  `vitest.config.ts`, and `apps/desktop/vite.config.ts` — so a new package
  resolves in tests but not in the app, or vice versa, until all three know it.

## State of the build

Plan Phases 0–1 are complete: the EE 2300 vertical slice runs end to end
(onboard → adaptive placement → gap report → dashboard), 349 tests pass, 413
verified items across 28 of 34 KCs.

Not built, and not stubbed beyond a package manifest:

- **Circuit lab** (Phase 3) — schematic editor, ngspice via `eecircuit-engine`,
  the MNA teaching solver, `circuit-build` grading. The item schema already has
  `circuitAnswerSchema`; nothing implements it. This was an explicit part of the
  original request.
- **Gamification** (Phase 2) — skill-tree DAG visualization, streaks, quests,
  challenge exams. XP exists only as a flat 10-per-correct total on the
  dashboard; the planned difficulty weighting and retrieval-effort bonus are not
  implemented, and `Profile.streakDays` is persisted but never incremented.
- **Curriculum breadth** (Phase 4) — the 6 math KCs referenced as cross-course
  prerequisites have no items; `pnpm content stats` lists them.

**The Tauri shell has never been compiled.** `webkit2gtk`/`gtk3`/`libsoup3` were
unavailable in the development environment, so `cargo build` has not run against
it. The Rust side is standard Tauri v2 wiring and the SQL adapter mirrors the
tested IndexedDB one method for method, but treat the first `tauri dev` as
unverified. The browser path is exercised on every CI run.
