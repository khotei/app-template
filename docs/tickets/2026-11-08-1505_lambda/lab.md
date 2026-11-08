# Lambda

Flow: lab

## Intent

api and worker as lambda. It should work in dev mode first, but in future have the ability to
extend to AWS prod. SQS should call the worker lambda, the worker should not pull.

## Map

<The only place for a step's status: todo, in progress or done.>

| Step | Goal | Kind | Status |
|---|---|---|---|
| L1 | <one goal you can see> | learn \| build | todo |

## L1 — <goal>

Reference: <the example, and how it was run as is> · Budget: reference + <N> lines

### Shape

<The owner's: the functions and services, where the rule lives, the errors; or the path of the
contract in code.>

### Notes

<The markers, one per line, each answer indented under what it answers: [Q], [A:ai] with its
path:line or run, [R], [DO], [D:ai] then [D], [!].>

### Pieces

<[N:ai] L1.1 <what it gives> · visible: <command or link>>

### Output

<Proposed by the agent, accepted by the owner. A learn step: the answer and its proof (a command,
a snippet of at most 20 lines), ending "Can you write the signature now?". A build step: the code
accepted and how to see it.>

## Knowledge

<Only an accepted [D] or Output, written in the commit that settles it.>

## Numbers

<At the close, from git: time from the intent to the PR; lines against each step's budget; lines
reworked after the owner saw a piece (the OWNER rounds); stops by signal; claims without a
source.>
