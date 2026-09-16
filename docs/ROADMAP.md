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
| **MATH 2472** Calculus II | 3 stubs | `integration-by-parts` and `exponential-functions` gate RC/RL transient analysis | Symbolic item type (engine exists, no content) |
| **MATH 3323** Differential Equations | 2 stubs | `second-order-ode` gates RLC damping and every Circuits II transient | Symbolic item type |
| **MATH 3376** Linear Algebra | 1 stub | `linear-systems` gates nodal and mesh analysis | Nothing — numeric items work today |
| **EE 2320** Digital Logic | not started | Only Tier 1 course with no graph yet | Truth-table and K-map item types |

**MATH 3376 is the cheapest**: numeric generators over small systems need no new
machinery. **EE 2320 has the highest ceiling** — the `truth-table` answer type is
already in the schema and graded by the answer engine, so a generator is the only
missing piece, and it opens a whole course.

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

### 1. Misconception feed and targeted drills

**The largest gap between what is built and what was designed.** Misconception
events are tagged on every distractor, recorded on every wrong answer, and
persisted — and then nothing reads them. The Duolingo-style loop the whole
misconception system exists to serve does not close.

What it needs: a ranked feed of recurring errors, a rule that fires a drill when
a misconception repeats N times in a window, and generators that can target one
misconception rather than one KC. Roll-up across courses so sign errors in KVL
and sign errors in integration both feed `sign-convention-discipline`.

### 2. Symbolic and truth-table item types

Both are in the schema. Both are graded by the answer engine — symbolic by
random-point sampling, truth tables by canonical comparison. Neither has a single
item. This is the one place where writing generators unlocks four courses at once
(Calc II, DiffEq, Digital Logic, and the symbolic half of Circuits II).

### 3. AC / phasor content for Circuits II

The solver already does complex-admittance AC and is validated against ngspice on
magnitude and phase. Impedance, resonance, transfer functions and Bode reading are
generator work over proven machinery.

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
