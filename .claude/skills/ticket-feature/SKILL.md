---
name: ticket-feature
description: "SDD 1/5: grill an idea into docs/tickets/<date-time>_<slug>/feature.md"
argument-hint: "<slug> [idea, notes or link]"
disable-model-invocation: true
---

Turn `$ARGUMENTS` into the ticket's `feature.md`: what changes and why, as EARS requirements the
user has confirmed. Gates: `.claude/rules/sdd.md`.

## Paths (they override the plugin)

| Artifact | Path |
|---|---|
| ticket folder | `docs/tickets/<now YYYY-MM-DD-HHmm, local time>_<slug>/`; an existing folder with this slug is continued |
| requirements | `<ticket>/feature.md`, started from `docs/tickets/_template/feature.md` |
| glossary | `docs/knowledge/glossary.md`, created when the first term is resolved |
| roadmap entry | `docs/knowledge/roadmap.md › <slug>`, read in step 1; its status set in step 3 |
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
   `researcher` agent to re-verify.
2. Call the Skill tool with `mattpocock-skills:grilling` and `mattpocock-skills:domain-modeling`,
   then grill the user until the frontier is empty. Every fact question goes to the `researcher`
   agent; the user answers only decisions. Resolved terms go into the glossary as they settle.
3. Write `feature.md`: goal, context, scope, out of scope, requirements `R1…` in EARS
   (`WHEN … THE SYSTEM SHALL …`, `WHILE`, `WHERE`, `IF … THEN`), one acceptance check per
   requirement, and open questions; the facts the `researcher` confirmed go into Context. If the
   slug has a roadmap entry, set the roadmap entry's status to a link to the ticket folder.
4. Present it and ask the user to confirm the shared understanding. The step is done when they
   confirm; next comes `/ticket-architecture <ticket folder>`.

Commit `feature.md` and the glossary only on the user's explicit OK (`.claude/rules/commits.md`).
