### Stage design

The facts:

- **A2** — confirmed by a probe: `"Über Ça é".normalize('NFD')` passed through the slug's filter
  `/[^\p{L}\p{N} ]/gu` and lower-cased gave `uber ca e` (`bun -e`, Bun 1.4.3); the filter already
  drops the combining marks, since they are neither letters nor digits.
- Stage 1's `ticket.mjs` builds the folder's name before it copies the template, so a check fits
  between the two (read).
- `make ticket` prints nothing today (run in a `git clone --local`).

The stage fixes the refusal in `.misc/tickets/ticket.mjs` before the copy, its message on stderr
as `refused: <folder>/ already holds the slug <slug>`; the slug's `normalize('NFD')` in
`buildSlug`; and the two printed lines at the end of `ticket.mjs`. Its choices:

- **Exit 1 on a refusal** — set aside: 2 — fact: the repo's checks keep 2 for a check that could
  not run (`docs/knowledge/tooling.md › Commands`, `make doc-lint`) — used by: S4
- **The slug compared by the folder's suffix `_<slug>`** — set aside: a parse of the date — fact:
  every folder but `_template` is `<date>-<time>_<slug>` (`ls docs/tickets/`) — used by: S4
- **The path on one line, the command on the next** — set aside: one line holding both — fact:
  none forces it; the Direction's recommendation — used by: S6

### Steps

#### S4 — A taken slug is refused, nothing created

- **Delivers:** `make ticket` with a title whose slug a ticket already holds exits 1, names that
  ticket's folder on stderr and creates nothing.
- **Goal:** the identity of D2 (R5, D2).
- **Blocked by:** none.
- **Files:** `.misc/tickets/ticket.mjs`. Trap: compare the suffix `_<slug>`, so `my-sample-title`
  does not take `sample-title`.
- **Introduces:** none. Removes later: none.
- **Size:** ~15, docs ~2.
- **Test first:** the Seam `make ticket`, in a `git clone --local` — a second
  `make ticket TITLE="Sample title"` exits 1; before the step it exits 0 with a second folder.
- **Verify:**
  - the second run exits 1, its stderr naming the first folder, and `ls docs/tickets/` is
    unchanged;
  - `make ticket TITLE="My sample title"` after it succeeds;
  - `make check` passes.
- **Model:** `opus high`
- **Status:** todo

#### S5 — Accented letters become their base letters

- **Delivers:** `make slug TITLE="Über Ça"` prints `uber-ca`, and a ticket's folder follows.
- **Goal:** R3 inside `buildSlug` (R3, D1).
- **Blocked by:** none.
- **Files:** `.misc/tickets/ticket.mjs`: `normalize('NFD')` before the filter (A2).
- **Introduces:** none. Removes later: none.
- **Size:** ~5.
- **Test first:** the Seam `make slug` — `make slug TITLE="Über Ça"` prints `uber-ca`; before the
  step it prints `über-ça`.
- **Verify:** that command; `make check` passes.
- **Model:** `opus medium`
- **Status:** todo

#### S6 — `make ticket` prints the folder and the next command

- **Delivers:** a created ticket prints its folder's path, then `/ticket-feature <folder>`.
- **Goal:** R6, a caller reading a whole line (R6).
- **Blocked by:** S4.
- **Files:** `.misc/tickets/ticket.mjs`; the target's row in `docs/knowledge/tooling.md`.
- **Introduces:** none. Removes later: none.
- **Size:** ~10, docs ~2.
- **Test first:** the Seam `make ticket`, in a `git clone --local` — its last line is
  `/ticket-feature docs/tickets/<now>_sample-title/`; before the step it prints nothing.
- **Verify:** `make ticket TITLE="Sample title" | tail -n 2` prints the path, then the command;
  `make check` passes.
- **Model:** `opus high`
- **Status:** todo

### Stage review
