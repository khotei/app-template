---
name: ticket-feature
description: "SDD 1/5: grill an idea into docs/tickets/<date-time>_<slug>/feature.md. Run only when the user asks for this phase"
argument-hint: "<slug> [idea, notes or link]"
---

Turn `$ARGUMENTS` into the ticket's `feature.md`: what changes and why, as EARS requirements the
user has confirmed. Gates: `.claude/rules/sdd.md`.

## Paths (they override the plugin)

| Artifact | Path |
|---|---|
| ticket folder | `docs/tickets/<now YYYY-MM-DD-HHmm, local time>_<slug>/`; an existing folder with this slug is continued |
| requirements | `<ticket>/feature.md`, started from `docs/tickets/_template/feature.md` |
| glossary | `docs/knowledge/glossary.md`, created when the first term is resolved |
| roadmap entry | `docs/knowledge/roadmap.md › <slug>`, read in step 1; its status set in step 4 |
| decisions | `<ticket>/architecture.md › Decisions`, written later by `/ticket-architecture` |

**`domain-modeling` override.** Every place it names `GLOSSARY.md` means
`docs/knowledge/glossary.md`, and its glossary format applies there. When it would offer an ADR,
add an open question to `feature.md` instead; `/ticket-architecture` turns it into a decision. The
repository holds no `GLOSSARY.md`, `GLOSSARY-MAP.md`, `CONTEXT.md` or `docs/adr/`.

## Steps

1. Read the input (idea, notes, linked page), `docs/knowledge/glossary.md` if it exists, the
   `docs/knowledge/` documents the idea touches, and the slug's entry in
   `docs/knowledge/roadmap.md` if the slug has one, whose goal, scope, inherited requirements, open
   questions and facts seed the grilling; send the entry's dated facts the ticket relies on to the
   `researcher` agent to re-verify, on the default model and effort `opus high`. You may choose
   `fable` over this default for any researcher of this skill where you judge the answer will be
   better for it, chiefly where it settles a requirement and nothing after it re-checks it, and
   name it in the status.
2. **A bug starts from a red command.** A bug is what the user reports as broken; ask when the
   input leaves it open. Call the Skill tool with `mattpocock-skills:diagnosing-bugs` and run
   its phases 1 and 2 only, to one minimised command that runs on the files already in the tree
   and shows the user's exact symptom failing, or name the existing failing check that shows
   it. The failing test phase 1 lists first is the fix step's **Test first**, written in that
   step. With neither, stop and ask the user, as phase 1 does. The command and its failing
   output go into `feature.md › Reproduction`.
3. Call the Skill tool with `mattpocock-skills:grilling` and `mattpocock-skills:domain-modeling`,
   then grill the user until the frontier of the minimal feature is empty: the whole feature in
   its smallest form (`.claude/rules/sdd.md › Gates`). An edge case, a hardening, an open question
   or an optimisation that comes up is a line of `Later`, not grilled now, unless the rule never
   defers it. Every fact question goes to the `researcher` agent on `opus high`; the user answers
   only decisions. Resolved terms go into the glossary as they settle.
4. Write `feature.md`: problem, goal, context, scope, out of scope, requirements `R1…` in EARS
   (`WHEN … THE SYSTEM SHALL …`, `WHILE`, `WHERE`, `IF … THEN`) that name behaviour, not paths
   or code names, one acceptance check per requirement that names none either (a command,
   request or observation and its expected result), `Later`, and open questions, each with its
   options and a recommendation; the facts the `researcher` confirmed go into Context. A bug's
   requirement takes the Reproduction's command as its acceptance check. If the slug has a
   roadmap entry, set the roadmap entry's status to a link to the ticket folder.
5. Present it and ask the user to confirm the shared understanding. The step is done when they
   confirm; next comes `/ticket-architecture <ticket folder>`.

Commit `feature.md` and the glossary under the commit gate of `.claude/rules/sdd.md`.
