# Coursework intake

Drop your own course material here: homework and problem sets, lecture slides
and notes, textbook chapters, a syllabus. **This directory is gitignored except
for this file.** Nothing you put here is committed, published, or bundled into a
release build.

The material is not content. It is the *source* content gets written from, and
it never becomes an item on its own — everything still passes the same gate.

## What to drop, and where

```
content/coursework/
  PHYS2335/
    syllabus/       week-by-week topic plan  -> drives content/terms/*.yaml
    homework/       assigned problems, ideally with your worked attempts
    lectures/       instructor slides and notes
    textbook/       book chapters you own     -> personal-only, see below
  EE4392/
    ...
```

The course code is the folder name and matches `content/curriculum/<code>.yaml`
when one exists. A course with no curriculum document yet is fine — that is
exactly the case this directory is for, and the KC graph gets written from what
lands here.

## What each kind is good for

| Material | What it produces | Why |
|---|---|---|
| **Syllabus** | `content/terms/*.yaml` | The only source for which unit is live in which week. Everything in the term view depends on it, and guessing it is the difference between a useful deadline and a decorative one. |
| **Homework with your attempts** | Misconception traps | The highest-value input in this list. A trap is only worth having if it names an error somebody actually makes; your own wrong working names yours specifically, which no generic distractor can. |
| **Lecture slides and notes** | KC decomposition, notation | What the instructor treats as one concept is what the KC graph should call one concept, and the course's own symbols are the ones the items should use. Being marked wrong for notation teaches notation. |
| **Textbook chapters** | Items, `licenseTier: personal-only` | Worked examples and end-of-chapter problems. See the licence note below — this is the one kind with a hard constraint on it. |

## The licence line, and why it does not move

Anything derived from a textbook or other third-party source is authored into
`content/packs/personal/` with `licenseTier: "personal-only"`. That directory is
gitignored, the pack schema **rejects** personal-only items from a
redistributable pack, and the release builder excludes it. The effect is that
owned material can sharpen your own training without ever entering a shippable
artifact.

This is load-bearing for the commercial path rather than caution for its own
sake, and it is enforced in three independent places so that weakening one of
them does not quietly weaken the rule. Do not route book-derived items into
`content/packs/shared/`.

Your own homework and your own worked solutions are yours; they are not the
constrained case. What is constrained is the publisher's text and the
publisher's problems.

## How material becomes questions

Nothing in this directory is read by the app. It is read by whoever is writing
generators, and the route from a PDF to a question the app will serve is:

1. **Material lands here**, under its course.
2. **A KC graph is written or extended** in `content/curriculum/<code>.yaml`,
   using the course's own unit names and notation.
3. **Generators are written** in `packages/generators/src/<code>/`, one per KC
   where the topic admits a closed form. Prefer a generator to a hand-written
   item wherever the topic allows it — for generator items verification is
   near-total, and for model-written numeric items there is no independent
   solver, so the gate proves internal consistency rather than physics.
4. **The gate runs**: `pnpm content build`, `pnpm content verify --strict`.
5. **The term picks it up** once `content/terms/*.yaml` names the unit.

Topics that generators structurally cannot do — process knowledge, qualitative
reasoning, "why does this behave this way" — go through the Claude-authoring
route in `tools/claude-authoring/` instead, land in `content/inbox/`, and are
gated by `pnpm content import` before they reach the bank.

**Say which kind a course is before starting it.** Thermodynamics and wave
mechanics are closed-form and parameterisable, so PHYS 2335 is twenty
generators and 350 items with near-total verification. Lithography, deposition
and etch are definitional, so EE 4392 cannot be generated at all and its items
will be hand- or model-authored with a weaker guarantee behind them. Knowing
which one you are in decides how much of the work the machine can do, and
pretending otherwise produces confident items nothing can check.
