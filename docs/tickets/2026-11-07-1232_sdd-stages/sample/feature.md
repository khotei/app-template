# New ticket from a title

> Ticket: `2026-01-01-0000_sample` · Source: conversation
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

A session starts a ticket by hand: it picks a slug from the title, copies `docs/tickets/_template/`
into a folder named by the date, the time and that slug, and writes the title into the feature's
heading. Slugs come out in different styles, a long title gives a long folder name, and nothing
stops a second ticket under a slug already taken.

## Goal

One command creates the ticket from its title, and another prints the slug alone, so every folder
name follows one style and a taken slug is refused. Now, because every ticket of the next weeks
starts this way.

## Context

- Ticket folders are `docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/`, started from
  `docs/tickets/_template/` (`.claude/rules/sdd.md › Artifacts`); a ticket's branch is
  `<type>/<slug>`.
- Everything runs through the root `Makefile` (`docs/knowledge/tooling.md › Commands`).

## Scope

- A command that prints the slug of a title.
- A command that creates a ticket's folder from the template under that slug.

## Out of scope

- Writing the roadmap entry or the branch; `/ticket-feature` does both.
- Renaming an existing ticket.

## Requirements

### The slug

- **R1** — WHEN the user asks for the slug of a title, THE SYSTEM SHALL print the title's words in
  lower case, joined by single hyphens, with every character other than a letter, a digit or a
  space dropped.
- **R2** — IF the slug would be longer than 30 characters, THEN THE SYSTEM SHALL cut it after the
  last whole word that fits.
- **R3** — WHEN the title holds accented letters (é, ü, ç), THE SYSTEM SHALL write each as its
  base letter.

### The ticket

- **R4** — WHEN the user creates a ticket from a title, THE SYSTEM SHALL create its folder, named
  by the current local date and time and the title's slug, holding the template's files with the
  title as the heading of the feature.
- **R5** — IF a ticket with the same slug exists, THEN THE SYSTEM SHALL refuse, naming the existing
  folder, and create nothing.
- **R6** — WHEN a ticket is created, THE SYSTEM SHALL print the folder's path and the command that
  starts its feature phase.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `make slug TITLE="SDD in stages, again!"` prints `sdd-in-stages-again` |
| R2 | `make slug TITLE="Split the attachment storage into three modules"` prints `split-the-attachment-storage` |
| R3 | `make slug TITLE="Über Ça"` prints `uber-ca` |
| R4 | `make ticket TITLE="Sample title"` in a scratch clone creates `docs/tickets/<now>_sample-title/` with the template's files, its `feature.md` opening with `# Sample title` |
| R5 | Running it again exits non-zero, names the first folder and leaves `docs/tickets/` unchanged |
| R6 | Its output names the new folder and `/ticket-feature docs/tickets/<now>_sample-title/` |
