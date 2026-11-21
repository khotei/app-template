---
paths:
  - "**/*.ts"
---

# A name, its signature, its body and its doc say one thing

A reader sees the call, not the body: name, parameters, result and doc are all they act on. Ask
these six in order of every public name a change adds, renames or gives a new body. This rule
heads the naming rules: another rule's line that asks for a name, body or doc these refuse is a
defect of that line, fixed or reported with the change ([naming.md](naming.md) holds the words,
[composition.md](composition.md) one purpose per unit). Examples: `-` wrong, why; `+` passes.

1. **The name tells the intent.** Read the call aloud: it says what is true after it, not how
   (`orders.update(order, { status: 'shipped' })` → `shipments.ship(order)`). A call that needs a
   comment beside it fails, and so does a name that is only `process`, `handle`, `manage`, `data`
   or `helper`; a glossary term that holds one (a handler) passes.
2. **One word per concept, one concept per word.** Before a new name, grep the unit for its
   synonyms and for the word's other uses. One verb for two acts in one flow is a pun; one act
   under two words, across a method, its model's function, its errors and its tests, a synonym. A
   word of the [glossary](../../docs/knowledge/glossary.md) means only what its entry says.
   ```diff
     yield* orders.place(cart)       // stores the order
   - yield* shipments.place(order)   // sends it to the warehouse: a pun on `place`
   + yield* shipments.dispatch(order)
   ```
3. **The body does what the name and the types promise, no more, no less, never the opposite.**
   Read name, parameters, result and errors as one sentence. *Does more:* a `getProfile()` that
   stamps the visit → `getProfile()` and `touchLastSeen()`; `isValid(order): string[]` →
   `findOrderProblems(order)`. *Says more:* a `validate` that neither returns nor fails;
   `getOrders()` returning one. *The opposite:* `disable(): Enabled`; "never fails" over an error
   type. Errors and tests are named later and closer to the fact: `OrderShippedError` beside
   `dispatch` says the method's word is wrong.
4. **One level of abstraction in a body.** Its lines are steps of one size, one step below the
   name. A step is cut out under a name that passes 1 when its level is below its caller's, two
   callers share it, or it is a piece of its model's rule; else it stays in place, piped.
   ```diff
   - if (Arr.isReadonlyArrayEmpty(order.lines)) return yield* new OrderEmptyError() // a field test
   + yield* ensureOrderNotEmpty(order)                              // a piece of the model's rule
   ```
5. **Know what holds a unit's methods together** (cohesion), strongest first: functional (one
   purpose) · sequential (one's result feeds the next) · communicational (the same stored
   values) · procedural (a fixed order) · temporal (the same moment or process) · logical (one
   kind, picked by a flag) · coincidental (one folder). Measure, never argue: list per method what
   it requires, who calls it and who would ask for its change; sets that do not overlap are two
   units under one name. A `<Model>Service` and a repository are communicational by design; any
   other unit below functional names its kind in the decision that binds it.
6. **One sentence, no "and".** Before the body, say the method in one sentence: a command's opens
   with its own verb, a query's names what it returns. An "and", or a verb the name lacks, means
   split the unit or find the word one level up true of every part, checked by 3
   (`Validates the order and saves it` → `placeOrder`, two steps). A name that will not come is a
   design finding: report it, never settle it with a vaguer word.

## What stays as a comment

None by default: a stale comment is acted on with full confidence. The sentence of 6 stays as a
TSDoc `/** … */` only when a caller cannot get it from the name, the types or a rule; an optional
second paragraph says why. A comment says why, never what: a decision and its rejected
alternative, a gotcha or a coupling surprising from a distance, an invariant the type cannot
express (once, on the port or the repository), a usage constraint.
```diff
- // loop over the lines and add up the totals
+ // the queue may deliver a job twice, so this write must stay idempotent
```
Never step markers, a doc that repeats the name, a `@param` that restates a type, `@since`,
`@category`, layering or a ticket id (the commit's `Refs:`). A change that makes a comment wrong
shows it restated code: delete it. `biome-ignore`, `@ts-expect-error` and pragmas are code: keep.

## When two rules pull apart

Before settling a choice, list each rule line that applies. When two ask for different code,
never pick silently: say what each protects and what goes wrong here if it loses; apply the one
whose loss does concrete harm, and when neither does, leave the code. Write the trade-off as one
`Decision:` paragraph; when both losses are concrete, give both options with their cost and ask.
The owner's word is no rule line: it stands, and the line it changes is named with its cost.

## In a review

A finding names the question's number, quotes the call or comment that shows it, and gives the
name or cut that passes. A rename that swaps a word for its synonym is no fix.
