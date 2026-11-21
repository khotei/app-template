---
paths:
  - "**/*.ts"
---

# A name, its signature and its body say one thing

A reader sees the call, not the body: what the name, the parameters and the result promise is
all they act on. Ask these six in order, of every public name a change adds, renames or gives a
new body; each builds on the one before. Which word a kind of work takes: [naming.md](naming.md).

1. **The name tells the intent** (intention-revealing name). Read the call aloud: it says what
   is true after it, not how. A call that needs a comment beside it, or a name of `process`,
   `handle`, `manage`, `data`, `helper`, fails.
2. **One word per concept, one concept per word.** Before a new name, grep the unit for its
   synonyms and for the word's other uses. A verb that means two acts in one flow is a pun; one
   act under two verbs is a synonym. A word the glossary gives a domain meaning is never used
   in its everyday sense, in a comment and a test's name as in code.

   ```ts
   const order = yield* placeOrder.place(cart) // stores the order
   yield* shipOrder.place(order)               // sends it to the warehouse: a pun on `place`
   ```

3. **The body does what the name and the types promise, no more, no less, never the opposite**
   (linguistic antipatterns). Read name, parameters, result and errors as one sentence.
   - *Does more:* a `get` or `is` that writes; an `is` that returns more than a boolean; a
     command that also answers a question about the world.
   - *Says more:* a `validate` that neither returns nor fails; a plural name returning one; a
     verb for work the body leaves to its caller.
   - *The opposite:* a name against its result type, a doc comment against its error type.

   The errors and the tests of a unit are named later and closer to the fact: when they use
   another word than the method (`OrderShippedError` beside `dispatch`), the method's is wrong.
4. **One level of abstraction in a body.** Its lines are steps of one size, one step below the
   name; a line smaller than its neighbours (a field test beside a rule's call, a query beside
   a move) goes to the unit that owns its level, under a name that passes 1. A step is cut out
   only when it has a name of the glossary, never to shorten a body.
5. **Know what holds a unit's methods together** (cohesion), from strongest to weakest:
   functional (one purpose) · sequential (one's result is the next one's input) · communicational
   (the same records) · procedural (a fixed order) · temporal (the same moment) · logical (one
   kind, picked by a flag) · coincidental (one folder). Measure, never argue: list per method
   what it requires, who calls it, and who would ask for its change. Sets that do not overlap
   are two units under one name. Below functional is allowed when it is chosen: say which kind
   and why in the unit's record ([composition.md](composition.md)).
6. **One sentence, no "and"** (hard to describe, hard to name). Write the doc comment before the
   body: a method's opens with the method's own verb, a unit's is one sentence. An "and", or a
   verb the name lacks, means one of two things: split the unit, or find the word one level up
   that is true of every part and check each part against it by 3. A name that will not come is
   a finding about the design; report it, never settle it with a vaguer word.

## In a review

A finding names the question's number, quotes the call or the comment that shows it, and gives
the name or the cut that would pass. A rename that only swaps a word for its synonym is no fix.

Sources: Beck, *Smalltalk Best Practice Patterns* (Intention Revealing Selector, Composed
Method); Martin, *Clean Code*, ch. 2; Arnaoudova et al., *Linguistic Anti-Patterns* (2013);
Yourdon and Constantine, *Structured Design*; Ousterhout, *A Philosophy of Software Design*,
ch. 14 and 15.
