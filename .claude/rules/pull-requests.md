---
paths:
  - ".github/**"
---

# Pull requests

PRs are **squash-merged** with GitHub's default message set to *"Pull request title and
description"*. Each PR therefore becomes **one commit on `main`**: the subject is the PR title, and
the body is the PR description. **GitHub keeps HTML comments in that body** (#3 and #4 carry
their review block), so merge with `gh pr merge <n> --squash --body-file <file>`, where the file is
the description without its `<!-- … -->` block. The PR description *is* the permanent history.

The format is owned by `commits.md`; this file only adapts it to the PR surface.

- **One ticket = one branch `<type>/<ticket-slug>` = one PR.** Inside the branch, one commit per
  plan step.
- **PR title** = a `commits.md` subject line. Only the title sets the squash subject.
- **PR body** = the template's sections: **Summary** (what and why) · **What changed** ·
  **How it works** (the mechanism, with an optional Mermaid diagram inside `<details>` so a raw
  `git log` stays short) · **Decisions** (one `Decision:` per choice) · **Refs** (the ticket folder).
- **Reviewer-only content lives in ONE `<!-- … -->` block** (title rule, self-check, how to test,
  screenshots), which the merge leaves out. Never nest comments, and never write a literal `-->`
  inside one: it closes the block early and leaks review notes into history.
- **`main` is the only long-lived branch.** The squash merge deletes the ticket branch; the
  steps stay in the merged PR's commit list and the ticket's `plan.md`
  (`docs/knowledge/sdd.md › Roadmap and history`).
- Opening a PR, pushing and creating a remote are outward-facing: ask the user first.

Template: `.github/PULL_REQUEST_TEMPLATE.md`. A filled PR and the commit it produces:
`.github/PULL_REQUEST_example.md`. Required repo setting: *Settings → Pull Requests → Allow squash
merging*, default message *Pull request title and description*.
