# Claude-assisted authoring

Templates for producing item packs with a scheduled Claude Routine, or any
other model-driven batch.

The operating principle: **content is accepted, never trusted.** Everything
written here lands in `content/inbox/` and stays there until `pnpm content
import` re-derives every stated answer and passes it. An item whose answer
cannot be reproduced never reaches the bank, whoever or whatever wrote it.

## Why narrow beats bulk

A Routine that asks for "100 circuits problems" produces plausible prose with a
low hit rate on correctness, and the verification gate rejects most of it — so
the throughput is bad *and* the review burden is high.

A Routine scoped to one knowledge component at one difficulty band, told the
exact conventions to follow, produces far fewer items and passes far more of
them. Small and precise wins on total accepted items per run, not just on
quality.

## Workflow

1. Pick one knowledge component from `content/curriculum/`.
2. Fill in `item-batch.prompt.md` and run it as a Routine.
3. The Routine writes one JSON file into `content/inbox/`.
4. Run `pnpm content import` — verified packs move to `content/packs/shared/`,
   everything else is rejected with reasons.

For items derived from a textbook you own, use `pnpm content import --personal`.
Those carry `licenseTier: "personal-only"`, live in a gitignored directory, and
are excluded from any shippable build.

## What the gate actually checks

| Check | Catches |
|---|---|
| self-consistency | An answer the grader itself will not accept — a malformed unit, an unparseable expression. |
| explanation-agreement | A worked solution that reasons to one number while the answer field holds another. This is the characteristic failure of model-written content, and nothing structural catches it. |
| regeneration | A stored item that has drifted out of sync with the generator that produced it. Generator-authored items only. |
| misconception-coverage | Distractors that are merely wrong rather than diagnostic. Warning, not an error. |
| kc-reference | An item pointing at a knowledge component that does not exist. |

`explanation-agreement` is the one that earns its keep on model output. A model
will happily write five correct steps and then state a sixth number that does
not follow. A learner reading that concludes the app is broken.

## Verification has limits — know them

For a **generator**-produced item, verification is near-total: regenerating from
the seed reproduces the question and answer exactly.

For a **model**-produced numeric item there is no independent solver, so the
gate confirms internal consistency, not physics. It will catch a solution that
contradicts its own answer. It will **not** catch an item where the reasoning
and the answer are confidently wrong in the same direction.

That residue is why hand review still matters for model-authored content, and
why a parameterized generator is worth writing whenever a topic admits one. Use
model authoring for what generators cannot do — qualitative reasoning, "why does
this circuit behave this way", derivation ordering — rather than for arithmetic
a solver could have produced correctly by construction.

## Hand-authored batches

`ee4392-concepts.mjs` is the other shape this directory supports: a script that
emits one pack into `content/inbox/`, run with `node`. It exists because
EE 4392's process knowledge is definitional — there is no closed form to
generate from and no solver to check against — so the items are written rather
than computed, and `regeneration` skips them because `producer` is `hand`
rather than `generator`.

That makes the guarantee behind them weaker than the generated bank's, and the
script is committed so the weaker guarantee is at least reviewable: the source
of every such item is in version control next to the pack it produced.

Note what these items deliberately do not contain. The EE 4392 syllabus
prohibits redistributing the instructor's lecture material, so no slide
phrasing, checklist question or exam item is reproduced. The subject matter is
standard semiconductor processing and is not the instructor's to license; the
wording is independent.
