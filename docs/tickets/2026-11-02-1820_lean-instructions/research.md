# Research: how much detail a ticket's artifacts need

> Ticket: `2026-11-02-1820_lean-instructions` · Gathered 2026-11-02, on the user's question: are
> the ticket templates over-detailed, and how much detail does an implementing agent need for a
> good result? Two read-only passes: this repo's history, and external sources. This file keeps
> what the ticket relies on (R23, D15).

## Conclusion

A light edit of the templates and the planning skills, not a restructure (confidence about 75%).
The templates already split what from how (EARS requirements that name no path), put a check on
every step and cap a step's size, which every source asks for. What costs is detail that restates
the code: the artifacts kept being amended because they copied file lists, configs and paths, not
because behaviour changed. Detail an agent cannot derive from the repo stays concrete.

## This repo's history

`modular-monolith` after its plan commit `eace34b976`: 47 commits touched the three artifacts
(`plan.md` 47, `architecture.md` 27, `feature.md` 13). The older tickets were squashed per PR and
carry no per-step history.

| Cause | Commits or steps | Expected? |
|---|---|---|
| Status flip and findings appended | 47 | yes |
| Steps appended after review or verification | 8 | yes |
| A step's `Files` wrong or incomplete, edited in the step | 5 (S27–S30, S33, S41) | no |
| `Files` incomplete, "beyond the Files" in the findings only | 7 steps (lesson L2) | no |
| A `Verify` check that could not fail | 5 steps (lesson L4), and S42 after it | no |
| A requirement or acceptance row named a mechanism or path that moved | 12 of 13 `feature.md` commits | no |
| A requirement changed because behaviour changed | 1 (`d6d4dde54f`) | yes |
| The design restated a config, a tree or a key that drifted | 5 steps and a step of its own (lesson L6) | no |
| A stale name in a Seam row or a diagram | 4 | no |

What the evidence says about detail:

- **Load-bearing, so concrete:** a decided contract or name (the service-key format, the
  `./testing` export, `getOne`), where a missing one sent the user a mid-step decision; a trap the
  code cannot show (Biome's override merging, rediscovered in five steps, lesson L7); a probe proven
  red first (every step that had one got its guard right; five that had a check that could not
  fail reported green on nothing); an interim state the next step removes (`/simplify` deleted two
  such facts stated nowhere else, lesson L3).
- **Not load-bearing:** the exhaustive `Files` list. In all 7 "beyond the Files" steps of L2 the
  implementer found the missing files itself by `git grep`; no step was blocked for lack of a
  path. The only blocking events were the user's decisions. L2's cost was elsewhere: size
  estimates ran low and the reviewer could not tell what to expect. Its cure, "list every file
  `git grep` finds" in `/ticket-plan`, is the instruction that now produces the longest lists;
  a size estimate per step and the step report's list of files serve the same two needs.
- **Redundant with the toolkit:** what `make check`, the path-scoped rules, the workspace
  `CLAUDE.md` files and the implementer's evidence and leftover disciplines already enforce.
- **Stale-prone:** exhaustive file lists, config excerpts and matrices, counts, grep literals with
  old names, paths in Seam rows and acceptance rows.

The instructions that produce the stale-prone part: `ticket-plan` step 3 asks for every suite and
every doc `git grep` finds in `Files`; the plan template's `Files: <paths>` and its `Verify` with
no red-first demand; the design template's "files and modules added or changed, per workspace".

## External sources

- **Specific means what the agent lacks, not more words.** Claude Code best practices: a specific
  prompt "gives Claude information it doesn't already have"; "Only write down what Claude can't
  find by reading the repo" (<https://code.claude.com/docs/en/best-practices>).
- **A runnable check matters more than prose.** The same page: "Give Claude something it can run
  that comes back pass or fail." Kent Beck and Addy Osmani on tests as the loop an agent keeps.
- **Past a point, more text hurts.** Anthropic's context engineering post: "the smallest possible
  set of high-signal tokens", against "a laundry list of edge cases"
  (<https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents>).
  IFScale: adherence falls as instructions grow, earlier ones win
  (<https://arxiv.org/html/2507.11538v1>). Böckeler found Kiro and Spec Kit "very verbose and
  tedious to review", and the agent going "overboard because it was too eagerly following
  instructions" (<https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html>).
- **What in the spec, how in the task.** Spec Kit keeps the spec free of how and puts exact paths
  in tasks; Matt Pocock's `to-spec`: no file paths or snippets, "they may end up being outdated
  very quickly". Neither measures how many literals a task should pin.
- **Under-specified outcomes produce too little, not the wrong thing:** best practices note Claude
  "tends to read a request conservatively".

What would change the verdict: a later step that goes wrong for want of a listed file or a name
(then the list comes back for that kind of step), or a less literal step that lands a wrong name.

## What the ticket took

- R23 and D15: what a requirement, a design entry and a step name concretely, and what they leave
  to a pattern, a grep or a check; the rules go into the templates and the planning skills (S13).
- This ticket's own plan follows them from now on: a step's `Files` is where it starts and what it
  must pin, not the bound of its edits.
