# Spec-driven development

How a change goes from an idea to a merged PR, and what each `/ticket-*` skill does under the hood.
The binding constraints for agents live in [.claude/rules/sdd.md](../../.claude/rules/sdd.md);
this document explains them.

```mermaid
graph LR
  F["/ticket-feature"] --> A["/ticket-architecture"] --> P["/ticket-plan"]
  P --> I["/ticket-implement<br/>(once per step)"]
  I -->|next step| I
  I --> V["/ticket-verify"]
  V -->|fixes become steps| I
  V -->|pass| PR[PR · squash merge]
```

Every artifact lives in a ticket folder named by `.claude/rules/sdd.md`, started from
[docs/tickets/_template/](../tickets/_template/feature.md). The domain glossary is
`docs/knowledge/glossary.md`, created when the first term is settled.

An older `Refs:` line may name a folder before its rename: the slug is unchanged, and
`git log --follow` on a file of the current folder reaches the commits made under the old name.

## When to run which cycle

| Change | Cycle |
|---|---|
| New behaviour, a new dependency, or any choice a reviewer could question | the full cycle |
| A bug fix or small change with no new decision and an existing seam to test at | `/ticket-feature` with a few requirements, then `/ticket-plan`, `/ticket-implement`, `/ticket-verify`; skip `/ticket-architecture` |
| A typo, a version bump, a doc fix | no ticket: one commit with the area as its scope (`docs`, `tooling`) |

## The five skills

All five are typed by you (`disable-model-invocation: true`) and run in the main session, because
grilling, plan review and commit approval need you. Each takes the ticket folder, except
`/ticket-feature`, which takes a slug.

| Skill | Input | You decide | Output |
|---|---|---|---|
| `/ticket-feature <slug> [idea]` | an idea, notes or a link | the answers to each grilling round; the terms | `feature.md` with EARS requirements; glossary entries |
| `/ticket-architecture <ticket>` | `feature.md` | the Seams and the Decisions | `architecture.md` |
| `/ticket-plan <ticket>` | `feature.md`, `architecture.md` | the plan as a whole: the heavy review | `plan.md` with steps and coverage |
| `/ticket-implement <ticket> [step]` | the next unblocked step | approve, give feedback, or stop | one commit per approved step |
| `/ticket-verify <ticket>` | the branch against `origin/main` | which simplifications and lessons to apply; whether to open the PR | `verification.md` |

## Under the hood

The skills are thin wrappers over the [mattpocock-skills](https://github.com/mattpocock/skills)
plugin, which the project enables in `.claude/settings.json`. The wrappers decide **where** files
go and **when** you decide; the plugin decides **how** to interview, model, design, test and
review. Its skills are referenced by name and never copied, so plugin updates arrive on their own.

### Dependency map

What each skill and agent uses, read from their files. A commit that changes what a skill or agent
uses updates this map too; the Standards review checks it against `.claude/rules/claude-md.md`.

| Skill or agent | Plugin skills | Spawns | Hook | Writes |
|---|---|---|---|---|
| `/ticket-feature` | `grilling`, `domain-modeling` | `researcher` | — | `feature.md`, `docs/knowledge/glossary.md`, `docs/knowledge/roadmap.md` |
| `/ticket-architecture` | `codebase-design`, `grilling` | `researcher` | — | `architecture.md` |
| `/ticket-plan` | — | `researcher` | — | `plan.md` |
| `/ticket-implement` | `code-review`; on a behaviour step the built-in `simplify`, with `codebase-design` as its vocabulary, and the built-in `code-review` | `implementer` (one worktree per parallel step, with its own `.env`, ports and MiniStack), `reviewer` (a third, Depth, axis on a behaviour step); `pr-review-toolkit:silent-failure-hunter` on a step with error handling, a retry or a store outside the transaction | `make-check.sh`, through `implementer` | `plan.md`, `architecture.md`, a decision's record in `docs/knowledge/decisions.md`, one commit per approved step |
| `/ticket-verify` | `code-review` | `verifier`, `reviewer` | — | `verification.md` |
| `implementer` | `tdd`, preloaded | — | `make-check.sh` on `Stop` (runs as `SubagentStop`) | the step's files |
| `reviewer` | one axis of `code-review` | — | — | nothing: read-only |
| `verifier` | — | — | — | nothing: read-only |
| `researcher` | — | — | — | nothing: read-only |

Plugin skills are `mattpocock-skills:<name>`; ticket files are in `docs/tickets/<ticket>/`.

```mermaid
graph LR
  subgraph ours [this repo]
    feature["/ticket-feature"]
    arch["/ticket-architecture"]
    plan["/ticket-plan"]
    impl["/ticket-implement"]
    verify["/ticket-verify"]
    researcher([researcher])
    implementer([implementer])
    reviewer([reviewer])
    verifier([verifier])
    hook[/make-check.sh/]
  end
  subgraph plugin [mattpocock-skills]
    grilling{{grilling}}
    modeling{{domain-modeling}}
    design{{codebase-design}}
    tdd{{tdd}}
    review{{code-review}}
  end
  subgraph builtin [built-in and pr-review-toolkit]
    simplify{{simplify}}
    bugs{{code-review, bugs}}
    hunter([silent-failure-hunter])
  end
  feature -.-> grilling & modeling
  feature --> researcher
  arch -.-> design & grilling
  arch --> researcher
  plan --> researcher
  impl --> implementer & reviewer
  impl -.-> review & simplify & bugs
  simplify -.-> design
  impl --> hunter
  implementer -.-> tdd
  implementer --> hook
  verify --> verifier & reviewer
  verify -.-> review
  reviewer -.-> review & design
```

Solid arrows spawn an agent or run a hook; dotted arrows use a plugin skill.

### What the wrappers override, and why

| Plugin behaviour | Override | Why |
|---|---|---|
| `domain-modeling` writes `GLOSSARY.md` at the root and ADRs to `docs/adr/` | glossary in `docs/knowledge/glossary.md`; ADR candidates become open questions, then `D…` decisions, and a binding one a record in `docs/knowledge/decisions.md` | one docs tree; a decision's history stays next to the ticket that made it, its living record in one page |
| `to-spec` and `to-tickets` write to `.scratch/` or an issue tracker, as user stories | `/ticket-feature` and `/ticket-plan` write EARS requirements and steps into the ticket folder | artifacts are reviewed and committed with the code |
| `tdd` asks the user to confirm seams before testing | the implementer takes them from `architecture.md › Seams`, confirmed earlier | a subagent cannot ask, and the seams were already agreed |
| `implement` commits on its own and reviews committed work | `/ticket-implement` reviews the uncommitted step and commits only after your OK | every commit is approved |
| `code-review` diffs from a fixed point to `HEAD` and spawns generic sub-agents | for a step: `git diff HEAD` plus untracked files, reviewed by read-only `reviewer` agents, each reading only the design parts the step cites and, on Standards, the rules `make review-rules` lists; the Spec axis also flags a diff that changes what a requirement asks | the step is reviewed before it is committed, by agents that cannot edit and read no more than the step needs, and `feature.md` changes with the requirement |
| `improve-codebase-architecture` scans the whole codebase, writes an HTML report, grills, and writes `GLOSSARY.md` and ADRs | the Depth axis of `/ticket-implement`: a read-only `reviewer` on a behaviour step's files and their callers, a text report, `docs/knowledge/decisions.md` and `architecture.md › Decisions` as the records not to re-litigate | the shape is questioned while the step is small, and no doc lands outside `docs/knowledge/` and the ticket |
| `research` writes a notes file into the repo | `researcher` answers in its report | facts reach the conversation, not the tree |

## The approval gate

A step runs through three stages before anything is committed:

1. **`implementer`** builds the step test-first at the agreed seam; the rules reach it through
   their path filters as it reads and edits files. A hook runs `make check` when
   it tries to finish and sends it back while the gate is red. Its only way out on red is a final
   message starting with `BLOCKED:`, which reaches you unchanged. On a step that writes
   behaviour, `simplify` then does the refactor `tdd` keeps out of its loop, judged by the rules
   and `codebase-design`'s deletion test, sparing the interim states the plan names, and
   `make check` runs again; a move skips it, since its files must keep their content for `git`
   to see the rename.
2. **`code-review`** runs two `reviewer` agents in parallel, each in a fresh context: **Standards**
   (the rules that bind the diff's files, which `make review-rules` lists, and the smell
   baseline) and **Spec** (the step, its requirements and the parts of the design it cites). The
   two reports stay separate, so one axis cannot hide the other. Neither axis
   hunts for bugs, so a behaviour step also gets the built-in `code-review` at `medium`, and one
   with error handling or a store outside the transaction `silent-failure-hunter`. A behaviour
   step gets a third `reviewer` too, **Depth**: `improve-codebase-architecture`'s search for
   shallow modules, limited to the step's files and their callers, as text; a candidate that
   contradicts a decision or reshapes a module comes to you as a question.
3. **You** read the report and both reviews, then approve, send feedback to the same implementer,
   or stop. Approval updates `plan.md`, records any decision, and commits with the proposed
   message.

Pushing, opening the PR and creating the remote each need their own OK.

## Roadmap and history

A ticket starts as an entry in [the roadmap](./roadmap.md), which says what an entry holds and how
`/ticket-feature` picks it up, and ends as one squash commit on `main`.

**`main` is the only long-lived branch.** It holds one commit per ticket: the squash, whose body
is the PR description, the history to read for *what* the template is and *why*. The *how*, step
by step, stays in two places that outlive the ticket branch: the merged PR's commit list on
GitHub, one commit per plan step, and the ticket folder's `plan.md` with each step's findings.
`chore/monorepo-setup` keeps the scaffold ticket's steps, which predate the PRs.

```mermaid
gitGraph
  commit id: "postgres-drizzle (squash)"
  branch refactor/effect-primitives
  commit id: "S28.1"
  commit id: "S28.2"
  checkout main
  commit id: "effect-primitives (squash)"
```

Ticket branches are cut from `main` and deleted on merge; nothing is merged back into a second
branch, so no merge commit is needed and the repository allows none.

## Lessons

`/ticket-verify` ends with **Lessons**: mistakes that recurred in two or more steps, each turned
into one proposed change. A mechanical mistake (an import shape, a banned API) gets a check: a Biome
rule, a test or a hook. A judgement call gets one line in a named skill or rule. A `CLAUDE.md`
never grows from a lesson, and nothing is applied without your OK. For a broader look at a whole
session, the plugin's `/mattpocock-skills:retro` is available to run by hand.

## Periodically

Two plugin skills look wider than one ticket. Both are run by hand, because the plugin marks them
user-invoked:

- `/mattpocock-skills:improve-codebase-architecture` scans the code for shallow modules and
  proposes deepening refactors. Run it every few tickets, once real product code has piled up.
  Tell it that the glossary is `docs/knowledge/glossary.md` and decisions are in
  `docs/knowledge/decisions.md` and each ticket's `architecture.md`, since it looks for
  `GLOSSARY.md` and `docs/adr/`.
- `/mattpocock-skills:retro` reviews a whole session and suggests changes to rules, checks and
  skills. Its findings go through the same OK as Lessons.

## After a plugin update

The plugin updates itself, so its behaviour can shift under the wrappers. After an update:

1. Read the plugin's changelog or diff for `grilling`, `domain-modeling`, `codebase-design`, `tdd`
   and `code-review`, the skills the map above delegates to.
2. Check that each override in the table above still targets something the skill does; a renamed
   file or step makes the override silently stale.
3. Run `/ticket-feature` on a throwaway slug in a scratch clone outside `~/.claude/` and settle one
   term. It must land in `docs/knowledge/glossary.md`, with no `GLOSSARY.md` or `docs/adr/`.
4. Record what changed as a lesson, or as a fix to the wrapper.

## Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `/ticket-*` is not offered when typing `/` | Claude Code was started outside the repository root | start it in the root; the skills live in `.claude/skills/` |
| plugin skills are missing, or `superpowers` is active | the plugin is not installed, or the session predates `enabledPlugins` | install `mattpocock-skills` from `claude-plugins-official` and restart the session |
| `implementer` never stops | `make check` stays red and the agent keeps fixing | stop it; resume with guidance, or let it report `BLOCKED:` |
| the `make check` hook never runs | the folder's workspace trust was never accepted (a `-p` session does not accept it) | open Claude Code interactively in the folder once and accept the trust dialog |
| a `GLOSSARY.md` or `docs/adr/` appeared | a plugin skill fired outside `/ticket-feature` | move the terms into `docs/knowledge/glossary.md` and delete the file |
| a verifier or reviewer cites a rule that the file no longer says | the session started before the rule changed, and its agents carry the old copy | run `/ticket-verify` in a new session, or tell each agent to read rules from disk |
| the map above disagrees with a skill or agent file | the file changed without the map | trust the file, fix the map in the next commit |
