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
packages/domain/   Mastery model, KC graph, adaptive testing - pure, no I/O
packages/          Content schema, answer engine, item generators, circuits
content/           Curriculum graphs and item banks
tools/pack-cli/    Content pipeline: validate, verify, stats, build, import
```

## Commands

```
pnpm test              run the test suite
pnpm typecheck         type-check every package
pnpm content validate  check curriculum and packs
pnpm content verify    independently confirm every stated answer
pnpm content stats     bank coverage by knowledge component and difficulty
```
