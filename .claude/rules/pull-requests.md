---
paths:
  - ".github/**"
---

# Pull requests

PRs are **squash-merged** with GitHub's default message set to *"Pull request title and
description"*. Each PR therefore becomes **one commit on `main`**: the subject is the PR title, and
the body is the PR description. **GitHub keeps HTML comments in that body**, so merge with
`gh pr merge <n> --squash --body-file <file>`, where the file is the description without its
`<!-- … -->` block. The PR description *is* the permanent history.

The format is owned by `commits.md`; one PR per ticket and the commits of a step, by `sdd.md ›
Gates`. This file only adapts them to the PR surface.

- **PR title** = a `commits.md` subject line. Only the title sets the squash subject.
- **PR body** = the template's sections: **Summary** (what and why) · **What changed** ·
  **How it works** (the mechanism, its **How to read** list, and an optional Mermaid diagram
  inside `<details>` so a raw `git log` stays short) · **Decisions** (one `Decision:` per choice)
  · **Refs** (the ticket folder).
- **Reviewer-only content lives in ONE `<!-- … -->` block** (title rule, self-check, how to test,
  screenshots), which the merge leaves out. Never nest comments, and never write a literal `-->`
  inside one: it closes the block early and leaks review notes into history.
- **`main` is the only long-lived branch.** The squash merge deletes the ticket branch; the
  steps stay in the merged PR's commit list and the ticket's `plan.md`
  ([sdd.md › Roadmap and history](../../docs/knowledge/sdd.md#roadmap-and-history)).
- When a push, a PR or a merge may happen: the commit gate in `sdd.md › Gates`.

Template: `.github/PULL_REQUEST_TEMPLATE.md`. A filled PR and the commit it produces:
`.github/PULL_REQUEST_example.md`. Required repo setting: *Settings → Pull Requests → Allow squash
merging*, default message *Pull request title and description*.

## Explanations a reviewer navigates by

Opening a PR, and again on each push to it, leave it readable without the session behind it:

- **How to read**, in the body's How it works: the order to read the files in and, for each main
  change, its links: the code it calls or relies on, and the docs or decision behind it. It stays
  in the squash body on purpose: a later `git log` reader follows the same links.
- **Inline explanations**: review comments on the changed lines that need one (a non-obvious
  decision, a call into another module or a library, a rule the line enforces), never on every
  line. Each reads:

  ```text
  Why: <one sentence>
  Depends on: https://github.com/<owner>/<repo>/blob/<head sha>/<path>#L<a>-L<b>
  Docs: <library docs or source at the pinned version> · <docs/knowledge or decisions.md link>
  ```

  A library link is the upstream repo at the tag its `make vendor-<lib>` target pins (the
  `repos/<lib>` copy), or the upstream doc page; a `docs/knowledge/` or `decisions.md` link is a
  permalink at the head sha too. **Write a link only after opening it and checking it lands on
  the right lines.**
- **Claude posts them, not the owner's account.** Write the entries (path, line, text) to a
  file and post it as one PR comment that opens with `@claude` and asks it to place each entry
  as an inline review comment through `mcp__github_inline_comment__create_inline_comment` with
  `confirmed: true` (the Claude Code workflow grants it), or, if it cannot, as one comment
  grouped by file. Post them through `gh api` yourself only if both fail.
- **On a push**, re-check the comments on lines that moved or changed and comment the new
  changes. Resolve each comment the push made false (`gh api graphql`, `resolveReviewThread`,
  which posts no text) and send its corrected text as an entry of the push's `@claude` comment;
  never leave one standing.
