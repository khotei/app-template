# Claimed findings

A `claimed` finding states a failure that no command showed. Send each to its own `researcher`
on `model: opus`, all in parallel, its brief the finding verbatim and the diff command, so it is
not anchored on the reviewer's reading. Its verdict decides what the user sees:

- `confirmed`: present it as the finding;
- `refuted`: drop it as rejected;
- `unclear`: ask it as a question, with what the researcher could not settle.
