# Engineering Trainer

A gamified gap-finder and mastery-analysis trainer for electrical engineering.

Built around one idea: **"passed the course" and "can do it today" are different
facts, and only one of them is in your gradebook.** The trainer measures the
second, finds where it has decayed, and traces a weakness back through the
prerequisite graph to its root — including across course boundaries, so a
circuits failure can point at the calculus underneath it.

Local-first desktop application. Personal training tool first, with the
architecture kept clean for a possible commercial path.

## Status

Early. See the open pull request for what is built and what is not.

## Layout

```
apps/desktop/      Tauri v2 shell and React renderer
packages/domain/   Mastery model, KC graph, adaptive testing, progression - pure, no I/O
packages/circuits/ Netlist model, MNA teaching solver, schematic net extraction
packages/          Content schema, answer engine, item generators
content/           Curriculum graphs and item banks
tools/pack-cli/    Content pipeline: validate, verify, stats, build, import
```

## Circuit lab

A schematic editor with its own Modified Nodal Analysis solver. The solver is
cross-checked against ngspice 45 in the test suite, but it is not a wrapper
around it: it keeps the stamped matrix and can print the KCL equation it
assembled at each node. A student who got a different answer by hand needs to
see which equation they should have written, not a corrected number.

Design problems are graded by simulating what the learner built, so any circuit
meeting the specification counts — two resistors in series pass a spec their
sum satisfies.

## Commands

```
pnpm test              run the test suite
pnpm typecheck         type-check every package
pnpm content validate  check curriculum and packs
pnpm content verify    independently confirm every stated answer
pnpm content stats     bank coverage by knowledge component and difficulty
pnpm dev               run the renderer in a browser (no Rust toolchain needed)
```
