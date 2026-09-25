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
| MATH 2358 Discrete Mathematics I | 32 KCs, 22 generators, 434 items; proof construction graded by three new answer kinds |
| EE 2320 Digital Logic | 23 KCs, 229 items, combinational through FSMs |
| EE 3300 Circuits II | 32 KCs, 32 generators, 567 items across all seven units |
| PHYS 2335 Waves and Heat | 30 KCs across seven units, 30 generators, 512 items; fluid statics, heat and the ideal gas, thermodynamics, oscillations, waves, wave optics and geometric optics, from the real syllabus. Ten personal-only tutorial items sit in the quarantined pack |
| EE 4392 Microelectronics Manufacturing I | 29 KCs across all nine syllabus units, every one carrying items; 21 generators and 345 items for the closed-form parts (Deal-Grove, yield, Rayleigh, resist contrast, dopant diffusion and implantation, etch, deposition, interconnect), 63 hand-authored items for the process knowledge that has no closed form |
| Phasor answers | `complex` answer kind: six notations parsed, magnitude and phase graded separately |
| Item figures | 252 EE 2300 items (op-amps included) and every EE 3300 circuit item carry a schematic, simulated by `pack verify` |
| Circuit templates | 14 standard Circuits II topologies, loadable into the Lab, each proved solvable |
| Symbolic items | Residual-verified answer keys; 78 items across calculus, ODEs |
| Truth tables & Boolean | Tri-state grid widget, exact Boolean grading, literal budgets |
| Misconception feed | Ranked recurring errors, cross-course habit roll-up, targeted drills; 518 misconceptions in 21 families, all mapped |
| Current term | Week-by-week unit schedule joined to the graph; readiness list ranking prerequisites by shortfall, dependence and how soon they are needed. EE 4392's and PHYS 2335's blocks come from their syllabi; EE 3300's come from its lecture sequence, since its syllabus carries no topic schedule, and everything past the first exam is marked PROJECTED |
| Coursework intake | Gitignored drop zone per course for homework, slides, notes and book chapters, with the licence quarantine documented |
| Display | Dark mode (system/light/dark, persisted) and fullscreen |
| Circuit lab | MNA solver (DC / DC sweep / AC / transient), drag-and-drop schematic capture with hotkeys, undo, rubber-band select, wheel zoom |
| Design grading | `circuit-build` items graded by simulation |
| Skill tree | Real prerequisite DAG on a pan/zoom canvas, locked/available/learning/proficient/mastered |
| Progression | Difficulty-weighted XP with retrieval bonus, streaks with freezes, daily quests, challenge exams |
| Credentials | 17 entries ranked against measured gaps |
| Windows package | `.msi` and `.exe` built and bundled in CI, published as run artifacts |

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
| **MATH 2358** Discrete Mathematics | **done** | 434 items | — |
| **EE 2320** Digital Logic | **done** | 229 items | — |

**Tier 1 is complete.** All 82 knowledge components across six courses carry
items, none too thin for the adaptive engine to bracket. The next course is a
Tier 2 one.

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

### 1. EE 3300 Circuits II — AC and phasors

The highest-value course left, and the cheapest of the Tier 2 set. The MNA
solver already does complex-admittance AC and is validated against ngspice on
both magnitude and phase, so impedance, resonance, transfer functions and Bode
reading are generator work over machinery that exists. It is also the course in
progress right now, so the content gets used the week it lands.

### 2. Narrow both new courses against your own material

Both were built broadly, on purpose. The next pass is the one that makes them
*yours*: transcribe problems from the discrete maths textbook and the quizzes
into `content/packs/personal/`, which is gitignored, marked `personal-only` by
the schema, excluded from any redistributable build, and gated by the same
verification as everything else. What is missing is the ingestion front end — a
screen to type a problem, tag its KC, and run it through the gate.

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

### 7. macOS installer, and running the Windows one

`.github/workflows/windows.yml` builds `Engineering Trainer_0.1.0_x64_en-US.msi`
(4.7 MB) and `Engineering Trainer_0.1.0_x64-setup.exe` (3.8 MB) on
`windows-latest` and publishes them as run artifacts, kept 30 days.

They **compile and bundle**; nobody has run them. That is a real distinction:
the first Windows attempt compiled the `.exe` cleanly and then failed at
bundling, because `bundle.icon` declared only `icons/icon.png` while WiX and
NSIS both require a `.ico`. The Linux bundler tolerates the omission, so the
defect was invisible on the only platform that had ever bundled. The first
Linux compile found two defects of the same shape (an uninstalled plugin
package hidden by a `.d.ts` shim, and a Tauri v2 capability that was never
granted), so the first real launch on Windows is worth doing attentively.

macOS (`.dmg`) needs a `macos-latest` job on the same pattern.

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
- **Theme the skill tree's SVG.** Its node fills are hardcoded hex, so they stay
  light cards on the dark canvas. Readable, but not themed.
- **K-map and state-diagram visuals.** EE 2320 minimisation is asked
  symbolically; a drawn map the learner groups would be a better instrument,
  and the schematic editor shows the machinery already exists.
- **Per-item analytics**: which generated variants are miscalibrated, using the
  real response data the attempt log already holds.

---

## Deliberately not planned

- **Cloud sync and accounts.** Local-first is a feature. Adding a server changes
  the licensing, privacy and threat model for no learning benefit.
- **A content marketplace.** The verification gate is what makes content
  trustworthy; accepting arbitrary third-party packs would undermine it.
- **Mobile.** The circuit lab needs a pointer and screen area.
