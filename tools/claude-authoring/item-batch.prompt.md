# Item batch Routine

Fill in the four fields under **Assignment**, then run this as a scheduled
Routine. Keep the scope to one knowledge component and one difficulty band —
narrow batches pass verification at a far higher rate than broad ones.

---

## Assignment

- **Knowledge component:** `ee2300.supernode`
- **Difficulty band:** `core` (logit range 0.0 to 1.0)
- **Item count:** 12
- **Reference conventions:** *(optional — name the textbook whose notation and
  problem phrasing to match, e.g. "Sadiku, Fundamentals of Electric Circuits,
  chapter 3 style")*

---

## Task

Write `{Item count}` items for the knowledge component above and save them as a
single JSON file at `content/inbox/{kc-slug}-{yyyy-mm-dd}.json`.

Read `content/curriculum/` first to confirm the knowledge component exists, what
unit it belongs to, and which competencies it is tagged with. Write items that
exercise those competencies specifically — an item tagged `strategy` should
require choosing a method, not just executing arithmetic.

### Rules

1. **Compute every answer twice, by different routes.** State the answer only if
   both agree. If a problem cannot be solved two ways, solve it once and check
   the result against a physical bound (a divider output cannot exceed its
   source; a Thévenin resistance falls when a source is suppressed).

2. **The final step of the worked solution must contain the answer**, written as
   a number. The verification gate compares them, and a mismatch rejects the
   item. This is the most common failure in model-written content.

3. **Every distractor carries a misconception slug and a rationale** naming the
   specific error that produces it. "Incorrect" teaches nothing. `You suppressed
   the voltage source as an open circuit rather than a short` teaches something.

4. **Never invent a misconception slug that has no basis.** Reuse the slugs
   already in `content/packs/shared/` where one fits; a diagnosis is only useful
   if the same error carries the same tag across the bank.

5. **Use realistic component values** — E24 resistors, bench supply voltages.
   Arbitrary floats read as synthetic and teach nothing about real circuits.

6. **KC weights must sum to exactly 1.0.**

7. **Set `licenseTier`**: `"redistributable"` for original work,
   `"personal-only"` for anything derived from a copyrighted source. When in
   doubt use `personal-only` — it is the reversible mistake.

### Output shape

```jsonc
{
  "schemaVersion": "1.0.0",
  "packId": "ee2300-supernode-2026-09-15",   // lowercase, dash-separated
  "version": 1,
  "course": "EE2300",
  "title": "Supernode analysis, core band",
  "provenance": {
    "producer": "claude-routine",
    "sourceRef": "item-batch.prompt.md / ee2300.supernode",
    "licenseTier": "redistributable"
  },
  "items": [
    {
      "id": "ee2300.supernode.r1",           // lowercase dot/dash slug
      "type": "numeric",                      // numeric | symbolic | multiple-choice
                                              // | truth-table | derivation-order | short-answer
      "kcRefs": [{ "kc": "ee2300.supernode", "weight": 1.0 }],
      "difficultyB": 0.4,                     // logit scale, inside the assigned band
      "stem": "...KaTeX permitted, use $...$...",

      // Numeric answers only:
      "answer": {
        "kind": "numeric",
        "value": 6.25,
        "unit": "V",                          // mathjs unit, or "" if dimensionless
        "tolerance": { "rel": 0.02 }
      },
      "misconceptionTraps": [
        {
          "misconception": "supernode.constraint-omitted",
          "value": 4.17,
          "tolerance": { "rel": 0.015 },
          "feedback": "That is what you get by writing KCL around the supernode without the source constraint equation. Two unknowns need two equations."
        }
      ],

      // Multiple choice instead uses:
      // "answer": { "kind": "choice", "correctId": "b" },
      // "options": [
      //   { "id": "a", "text": "...", "misconception": "...", "rationale": "..." },
      //   { "id": "b", "text": "..." }          // correct option carries NO misconception
      // ],

      "explanation": {
        "steps": [
          "Enclose both nodes in a supernode, so the unknown source current drops out of KCL.",
          "...",
          "$V_A = 6.25$ V."
        ],
        "principle": "A supernode trades the unknown current through a floating source for a constraint equation between its two node voltages.",
        "hints": ["What is unknown about the current through a voltage source?"]
      }
    }
  ]
}
```

### Before you finish

Run `pnpm content import` yourself and report the result. If items were
rejected, fix them and re-run rather than leaving them in the inbox — a failing
batch left behind is indistinguishable from one nobody looked at.

State plainly how many items were written, how many passed, and what the
rejections were. Do not describe a batch as complete if any item failed.
