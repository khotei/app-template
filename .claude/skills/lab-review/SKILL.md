---
name: lab-review
description: "One review round of a lab step or the whole lab: Standards and the hunt, Design on request"
argument-hint: "[L<n> | all] [design]"
disable-model-invocation: true
---

Review the lab step `L<n>` in `$ARGUMENTS`, else the Map's step in progress, or with `all` the
whole branch, in one round under `.claude/rules/lab.md`. Pick and read the lab as
`.claude/skills/lab/SKILL.md › Every call` steps 1 and 2 say.

1. **The owner's edits first.** When `git status --short` shows changes, ask whether they are the
   owner's: a reviewer reads only commits. Commit the owner's as an `OWNER` round of the step they
   touch; a piece of this session's own still open is finished and committed first.
2. **`make check`**, green before any reviewer starts.
3. **The range** is `git diff <base> HEAD`. For `L<n>`, `<base>` is the parent of the oldest
   commit the subject search of `.claude/rules/commits.md › A ticket's rounds` finds for the step,
   so another step's rounds landed since are reviewed with it; for `all`,
   `git merge-base main HEAD`.
4. **Review.** Spawn the passes in parallel, one `reviewer` each, its brief naming the pass, the
   range, its sources and a word limit of 400, and nothing else:
   - **Standards**, on `sonnet medium`: `make review-rules BASE=<base>`'s output, pasted verbatim
     with nothing added, and the `CLAUDE.md` of every touched workspace, each by its path; on a
     range that touches an instruction file (a `CLAUDE.md`, a rule, a skill or an agent), also
     `mattpocock-skills:writing-for-agents`.
   - **The hunt**, on `opus high`: the range's files, their callers and, for a test fake, the
     adapter it stands in for.
   - **Design**, only given `design`, on `opus high`: the range's files and the modules that call
     them, `.claude/skills/ticket-implement/design-examples.md`, `.claude/rules/deep-modules.md`,
     `docs/knowledge/architecture.md`, and the records of `docs/knowledge/decisions.md` that bind
     the range's files.
5. **Decide** on each finding as its report states it:
   - a rule or style fix: make it yourself, all of them in one `REVIEW` round once `make check` is
     green, each an `[N:ai]` line in its step's Pieces;
   - a hunt finding, a Design candidate, or a fix that changes the shape (a signature, a module,
     a type, what a test asserts): a `[D:ai]` in the step's Notes, with its `path:line`, its
     scenario, `shown` or `claimed` as the reviewer marked it, and what the system loses without
     the fix (rail 2); it waits for the owner. A case seen only on a stub is no fix (rail 7);
   - a finding you reject: one line in the report, with the reason.
6. **Report** in the chat: the `REVIEW` commit, then each `[D:ai]` as one block (what is wrong,
   what it leads to, the options with their cost, your recommendation, the question), then the
   rejected findings. The round is the only one: no pass runs again.
