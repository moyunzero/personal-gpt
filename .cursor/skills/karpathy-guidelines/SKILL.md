---
name: karpathy-guidelines
description: Applies Andrej Karpathy's four behavioral principles to reduce common LLM coding mistakes — Think Before Coding, Simplicity First, Surgical Changes, Goal-Driven Execution. Use when implementing features, fixing bugs, refactoring, or making any non-trivial code change, especially when requirements are ambiguous or the change touches existing code. Skip for trivial edits like typo fixes or one-line tweaks.
---

# Karpathy Behavioral Guidelines

Source: [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills)

Four principles that directly counter Karpathy's observed LLM coding failure modes: wrong assumptions, overcomplication, drive-by edits, and missing success criteria.

**Tradeoff:** These principles bias toward caution over speed. For trivial tasks (typo fix, one-liner), use judgment — not every change needs the full rigor.

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before writing code:

- **State assumptions explicitly.** If uncertain, ask — don't guess silently.
- **Present multiple interpretations** when ambiguity exists. Don't pick one and run with it.
- **Push back when warranted.** If a simpler approach exists, say so.
- **Stop when confused.** Name what's unclear and ask, rather than producing plausible-looking but wrong code.

The failure mode this prevents: LLMs silently picking an interpretation and producing 500 lines that solve the wrong problem.

---

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If 200 lines could be 50, rewrite it.

**The test:** Would a senior engineer say this is overcomplicated? If yes, simplify.

The failure mode this prevents: bloated constructions, premature abstractions, and 1000-line implementations where 100 would do.

---

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:

- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, **mention** it — don't delete it.

When your changes create orphans:

- Remove imports/variables/functions that **your** changes made unused.
- Don't remove pre-existing dead code unless asked.

**The test:** Every changed line should trace directly to the user's request.

The failure mode this prevents: drive-by refactors, unrelated formatting churn, and silently removed comments/code the LLM didn't fully understand.

---

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform imperative tasks into verifiable goals:

| Instead of...    | Transform to...                                       |
| ---------------- | ----------------------------------------------------- |
| "Add validation" | "Write tests for invalid inputs, then make them pass" |
| "Fix the bug"    | "Write a test that reproduces it, then make it pass"  |
| "Refactor X"     | "Ensure tests pass before and after"                  |

For multi-step tasks, state a brief plan up front:

```
1. [Step] -> verify: [check]
2. [Step] -> verify: [check]
3. [Step] -> verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

The failure mode this prevents: declaring victory without verification, or needing the user to spot mistakes that automated checks would catch.

---

## Self-Check Before Finishing

Before claiming a task is done, verify:

- [ ] Every changed line traces to the user's request (no drive-by edits)
- [ ] No speculative abstractions or unrequested "flexibility"
- [ ] All stated success criteria pass (tests, builds, manual checks)
- [ ] Assumptions made during the task were stated, not hidden
- [ ] Pre-existing style and patterns are matched

If any item fails, fix it before reporting completion.

---

## When These Guidelines Are Working

You should see:

- **Fewer unnecessary changes in diffs** — only requested changes appear
- **Fewer rewrites** due to overcomplication — code is simple the first time
- **Clarifying questions come before implementation** — not after mistakes
- **Clean, minimal PRs** — no drive-by refactoring or "improvements"

---

## Interaction with Project-Specific Rules

These are general behavioral principles. They are **additive** to project-specific instructions in `AGENTS.md`, `.cursor/rules/`, and similar locations. When project rules conflict, project rules win — but the four principles still apply to *how* you follow them.
