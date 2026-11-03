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
  **How it works** (the mechanism, with an optional Mermaid diagram inside `<details>` so a raw
  `git log` stays short) · **Decisions** (one `Decision:` per choice) · **Refs** (the ticket
  folder).
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
