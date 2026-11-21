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

The format is owned by `commits.md`. This file only adapts it to the PR surface.

- **PR title** = a `commits.md` subject line. Only the title sets the squash subject.
- **PR body** = the template's sections, one `Decision:` per choice, an optional Mermaid diagram
  inside `<details>`.
- **How to read**, written when the PR opens and refreshed on each push, leaves it readable
  without the session behind it, and stays in the squash body for a later `git log` reader: the
  order to read the files in and, for each main change, the code it calls or relies on, as a
  permalink at the head sha, and the docs or decision behind it, a library's at the tag its
  `make vendor-<lib>` target pins. **Write a link only after opening it and checking it lands on
  the right lines.**
- **Reviewer-only content lives in ONE `<!-- … -->` block** (title rule, self-check, how to test,
  screenshots), which the merge leaves out. Never nest comments, and never write a literal `-->`
  inside one: it closes the block early and leaks review notes into history.
- **One PR merges at a time, on the latest `main`.** When `main` has moved since a PR's branch was
  last updated on it, update the branch on `main`, let `make check` and CI pass again, then merge;
  with several PRs ready, merge one and repeat for the next.

Template: `.github/PULL_REQUEST_TEMPLATE.md`. A filled PR and the commit it produces:
`.github/PULL_REQUEST_example.md`. Required repo setting: *Settings → Pull Requests → Allow squash
merging*, default message *Pull request title and description*.
