# The slug of a title

> Ticket: `2026-01-01-0000_sample` · Source: conversation
> Related: [architecture.md](./architecture.md) · [plan.md](./plan.md)

## Problem

A session names a ticket's folder by hand, picking a slug from the title, so slugs come out in
different styles and a long title gives a long folder name.

## Goal

One command prints the slug of a title, so every folder name follows one style. Now, because every
ticket of the next weeks is named this way.

## Context

- Ticket folders are `docs/tickets/<YYYY-MM-DD-HHmm>_<slug>/` (`.claude/rules/sdd.md ›
  Artifacts`); a ticket's branch is `<type>/<slug>`.
- Everything runs through the root `Makefile` (`docs/knowledge/tooling.md › Commands`).

## Scope

- A command that prints the slug of a title.

## Out of scope

- Creating the ticket's folder; a session still copies the template.

## Requirements

- **R1** — WHEN the user asks for the slug of a title, THE SYSTEM SHALL print the title's words in
  lower case, joined by single hyphens, with every character other than a letter, a digit or a
  space dropped.
- **R2** — IF the slug would be longer than 30 characters, THEN THE SYSTEM SHALL cut it after the
  last whole word that fits.
- **R3** — WHEN the title holds accented letters (é, ü, ç), THE SYSTEM SHALL write each as its
  base letter.

## Acceptance

| Req | How to verify |
|---|---|
| R1 | `make slug TITLE="SDD in stages, again!"` prints `sdd-in-stages-again` |
| R2 | `make slug TITLE="Split the attachment storage into three modules"` prints `split-the-attachment-storage` |
| R3 | `make slug TITLE="Über Ça"` prints `uber-ca` |
