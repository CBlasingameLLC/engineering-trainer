# Roadmap

What is built, what is next, and why in that order.

Ordering principle: **a course is worth building when it is a prerequisite for
something you are about to take, or when it unlocks an item type the engine
cannot yet produce.** Everything else is content volume, which is cheap once the
machinery exists.

---

## Built

| Area | State |
|---|---|
| Mastery engine | Elo + BKT + FSRS, composite `M = P × R`, dual-axis aggregation |
| Adaptive placement | CAT with DAG prior propagation across course boundaries |
| Content pipeline | One schema, five producers, `validate / verify / stats / build / import` |
| EE 2300 Circuits I | 28 KCs, 26 generators, 467 verified items |
| MATH 2471 / 3323 / 3376 | 13 generators, 209 verified items, all 6 cross-course KCs covered |
| Symbolic items | Residual-verified answer keys; 78 items across calculus, ODEs |
| Misconception feed | Ranked recurring errors, cross-course habit roll-up, targeted drills |
| Circuit lab | MNA solver (DC / DC sweep / AC / transient), schematic editor, node equations |
| Design grading | `circuit-build` items graded by simulation |
| Skill tree | Real prerequisite DAG, locked/available/learning/proficient/mastered |
| Progression | Difficulty-weighted XP with retrieval bonus, streaks with freezes, daily quests, challenge exams |
| Credentials | 17 entries ranked against measured gaps |

---

## Next: courses

### Tier 1 — direct prerequisites for the junior block

These are the ones where decay costs immediately. All four already exist as KC
stubs referenced by cross-course prerequisite edges from EE 2300, so the graph
is drawn and only the item banks are missing.

| Course | KCs | Why now | Blocked on |
|---|---|---|---|
| **MATH 2471** Calculus I | **done** | 99 items | — |
| **MATH 3323** Differential Equations | **done** | 56 items | — |
| **MATH 3376** Linear Algebra | **done** | 54 items | — |
| **MATH 2358** Discrete Mathematics | not started | **In progress this term.** Propositional logic and Boolean algebra are where truth tables actually live | Truth-table grid UI in the session player |
| **EE 2320** Digital Logic | not started | Last Tier 1 course with no graph | The same grid UI, plus K-map items |

**The truth-table widget is now a two-course unlock, not one.** The type is in
the schema and the answer engine grades it by canonical comparison, but
`Session.tsx` has no grid input, so a truth-table item cannot be answered at all.
Building it opens MATH 2358 (current) and EE 2320 (retroactive) at once.

### Tier 2 — this year

| Course | Why | Leverage |
|---|---|---|
| **EE 3300** Circuits II | The direct successor to the built course | **The MNA solver already does AC.** Phasors, impedance, resonance and Bode plots are generator work over machinery that exists and is ngspice-validated. Highest value per hour in the whole plan. |
| **EE 3370** Signals & Systems | Loads on Calc II and DiffEq | Needs convolution and transform item types |
| **EE 3340** Electromagnetics | Loads on Calc III | Needs vector calculus items; Calc III not yet in the graph |
| **EE 3350** Microelectronics | Micro & Nano concentration | Needs nonlinear devices in the solver (below) |
| **EE 3355** Solid State Devices | Concentration core | Mostly conceptual — hand-authored and LLM-assisted items |
| **EE 3320** Microprocessors | Concurrent support | Needs a new item type for assembly/register tracing |
| **IE 3320** Engineering Statistics | Breadth | Numeric items work today |

### Tier 3–4

Senior concentration (VLSI, analog & mixed signal, manufacturing) and support
(PHYS 2325/2326/2335, ENGR 2301, CS 1428, ENGR 3315). Deliberately last: the
engine has to be proven across Tiers 1–2 before breadth is worth the authoring
cost.

---

## Next: features

Ranked by leverage, not by size.

### 1. Truth-table entry, then MATH 2358 and EE 2320

The session player renders multiple-choice, numeric, symbolic and circuit-build
items. A truth-table item has no input widget, so it cannot be answered — the
one item type the engine grades but the app cannot serve. A clickable grid
unlocks Discrete Mathematics (in progress now) and Digital Logic together.

### 2. AC / phasor content for Circuits II

The solver already does complex-admittance AC and is validated against ngspice on
magnitude and phase. Impedance, resonance, transfer functions and Bode reading are
generator work over proven machinery — and this is the course in progress right
now, so the content gets used the week it lands.

### 3. Join the misconception families to the competency radar

Each family declares a `competency`, and the dashboard already draws that axis.
Nothing connects them. Doing so turns "weak math-execution" on the radar into
the specific list of habits producing it, which is the difference between a
diagnosis and a score.

### 4. Book import

You have practice books. The pipeline is built: `content/packs/personal/` is
gitignored, `licenseTier: personal-only` is enforced by the schema, and
`pnpm content import --personal` gates on the same verification as everything
else. What is missing is the ingestion front end — a UI to transcribe a problem,
tag its KC, and run it through the gate.

### 5. Claude Routine authoring loop

`tools/claude-authoring/` holds the prompt template and the contract. Scheduling
it, and building the inbox review UI, turns it from a documented workflow into a
running one. Narrow and precise beats bulk — one KC, one difficulty band, one run.

### 6. Nonlinear devices in the solver

Diodes, BJTs and MOSFETs need Newton-Raphson iteration around the existing
stamping code plus a device model library. Nothing in Circuits I or II requires
them; **EE 3350 Microelectronics does**, and it is a concentration course.

### 7. Windows and macOS installers

The Linux bundles (`.deb`, `.rpm`, `.AppImage`) are built and the SQLite path is
verified on Linux. Tauri cannot cross-compile these, so Windows (`.msi`/`.exe`)
and macOS (`.dmg`) have to be built on their own platforms — either locally or by
adding `windows-latest` and `macos-latest` jobs to CI. Worth doing early: the
first compile on Linux found two defects that only appear in the desktop build,
and there is no reason to assume the other platforms are cleaner.

Also worth a look while there: `tauri-plugin-dialog` and `tauri-plugin-fs` are
registered in `main.rs` but used by nothing in the renderer and granted no
capability, so they are inert weight in every bundle. They become useful with
the book-import feature above; until then they could come out.

### 8. Smaller, worth doing

- **Export and backup.** The attempt log is the only durable record and currently
  lives in one local database with no export.
- **Bode and waveform plots on items**, not just in the lab.
- **Schematic reconstruction from a netlist** — imports currently give topology
  with no geometry.
- **Per-item analytics**: which generated variants are miscalibrated, using the
  real response data the attempt log already holds.

---

## Deliberately not planned

- **Cloud sync and accounts.** Local-first is a feature. Adding a server changes
  the licensing, privacy and threat model for no learning benefit.
- **A content marketplace.** The verification gate is what makes content
  trustworthy; accepting arbitrary third-party packs would undermine it.
- **Mobile.** The circuit lab needs a pointer and screen area.
