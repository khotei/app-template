# Toolkit quality — the probes of S39

> Ticket: `2026-11-04-1009_toolkit-quality` · Requirements: [feature.md](./feature.md) (R8) ·
> Replay: [replay.md › The probes of every scope](./replay.md#the-probes-of-every-scope--modular-monolith-s39-s13)

`modular-monolith` S39 (`dbb29d488a`) rewrites `biome.json` whole, 48 overrides at `8572da12bf`
and nine after, and adds the plugin `biome-imports.grit`. `/ticket-plan` step 3 then asks for a
probe per ban of every scope: each override's restriction groups, the root config's bans, and the
plugin's diagnostics as an added scope's own.

- **The list:** 180 probes. `P<o>.<g>` is group `g` of override `o`, both counted from 0 in the
  order of `biome.json` at `8572da12bf`: 176 probes for 176 groups. R1 and R2 are the root's bans
  (its relative-path pattern, `noImportCycles`), G1 and G2 the plugin's two diagnostics. R2 plants
  a second file, `application/chat/domain/probe-cycle-b.ts`, importing `y` from
  `#chat/domain/probe-cycle-a`.
- **Where each probe sits:** at a path whose last matching override is its own (Biome reads
  `includes` in order, the last match decides), never importing its own workspace. The probes of
  the overrides on one file (`application/*/index.ts`, `apps/*/layer.ts`, `apps/web/main.ts`) are
  appended to that file, hence their line numbers.
- **How each import was chosen:** the first of a fixed list of candidate imports, ranked by the
  probe's top folder (a module's probe reaches another module, a kernel part's another part), that
  the group's message alone refuses at `8572da12bf`. P8.1 takes its own module's file instead of
  the first, another module's, which the plugin also refuses after S39.
- **The run:** a script with no agent, in `git archive` exports of both commits in the session's
  scratch folder. Each probe is a file of its own, the import and `export const y = x`, linted
  alone with `biome lint --vcs-enabled=false --reporter=json <path>` (Biome 2.5.15), then deleted
  or its file restored. The 360 runs take 33.6 s; choosing the imports took about ten minutes.
- **The checks, each red on a planted hit first:** one probe dropped, two probes on one group and
  one probe that passes each fail the per-override count; a G1 that the plugin allows fails the
  after-check.
- **Before (`8572da12bf`):** 179 of 180 fail. The distinct messages per override equal its groups
  in all 48 overrides: 176 for 176, the `jq` count of `verification.md` run 1, R8. 172 probes are
  refused by their group alone. Seven are refused by two (P1.2, P2.4, P3.2, P7.2, P9.2, P10.4,
  P12.2): a module source's "imports no test support" group `#testing/**` always comes with the
  module group `#*/** !#<module>/**`, which matches every `#testing/…`. A rewrite that drops the
  first leaves its probe failing on the second message. G1 passes. G2 fails on the root's pattern,
  with the same text: no relative import was free at `8572da12bf`.
- **After (`dbb29d488a`):** of the 176 override probes, 71 pass, 85 fail on the plugin alone, 13
  on their own message and 7 on a group S39 reworded. R1, G1 and G2 fail on the plugin, R2 on
  `noImportCycles`. Each ban of the nine overrides S39 leaves fails on its own probe, alone (*After
  S39's bans*).
- **Against L8:** each group of the four overrides L8 names has its probe. The groups of
  `apps/api/**` (P38.0–P38.2), `apps/worker/**` (P41.0–P41.2), `deployment/**` (P46.0–P46.2) and
  the domain tests' `application/chat/__tests__/**` (P4.0–P4.3) pass after S39. Their
  relative-path groups (P38.3, P41.3, P46.3, P4.5) and P4.4, another module's file, fail on the
  plugin.

## After S39's bans

The nine overrides of `biome.json` at `dbb29d488a` hold 15 bans, `<o>.<g>` counted from 0 as
above. Each fails, after S39, on the probes below and on no other message there.

| Ban | Scope | Message | Probes |
|---|---|---|---|
| 0.0 | `http-api/**` | "http-api is the HTTP boundary shared by the apps …" | P0.0 |
| 0.1 | `http-api/**` | "of a module's entry http-api takes only its contract …" | P0.1 |
| 1.0 | `apps/web/**` | "web client code may import only …" | P44.0 |
| 2.0 | `application/*/contract/**` | "a module contract imports no workspace and no …" (reworded) | P8.0 |
| 2.1 | `application/*/contract/**` | "a module contract imports none of its module's other files …" | P8.1 |
| 3.0 | `application/*/domain/**` | "a module's domain is pure and ships to the browser …" (reworded) | P1.0 |
| 3.1 | `application/*/domain/**` | "a module's domain imports neither its services nor …" | P1.1, P9.1 |
| 4.0 | `application/*/services/**` | "a module's services import no workspace but …" (reworded) | P2.0 |
| 4.1 | `application/*/services/**` | "of @app-template/kernel/aws a module's services …" | P2.1, P10.1 |
| 4.2 | `application/*/services/**` | "of @app-template/kernel/data a module's services …" | P2.2, P10.2 |
| 4.3 | `application/*/services/**` | "a module's services reach its infrastructure only …" | P2.3, P10.3 |
| 5.0 | `application/*/infrastructure/**` | "a module's infrastructure implements its …" (reworded) | P3.1 |
| 6.0 | `application/use-cases/**` | "the use cases import no workspace but a module's …" | P13.0 |
| 7.0 | `application/*/index.ts` | "an entry of application/ re-exports its own …" (reworded) | P7.0, P12.0 |
| 8.0 | `kernel/data/**` | "the data layer imports no workspace but …" (reworded) | P16.0 |

## Probes

`biome.json` at `8572da12bf`, run at plan time; `biome lint --vcs-enabled=false <path>`. Each
message is quoted to its first words.

- P0.0 `http-api/**` — `http-api/probe.ts`: `import { x } from '@app-template/application/use-cases'` → `1:19` "http-api is the HTTP boundary shared by the apps: …" — after: fails, own message
- P0.1 `http-api/**` — `http-api/probe.ts`: `import { chatFromEntity as x } from '@app-template/application/chat'` → `1:10` "of a module's entry http-api takes only its …" — after: fails, own message
- P0.2 `http-api/**` — `http-api/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P1.0 `application/chat/domain/**` — `application/chat/domain/probe.ts`: `import { x } from '@app-template/application/use-cases'` → `1:19` "a module's domain is pure and ships to the browser: …" — after: fails, reworded "a module's domain is pure and ships to the …"
- P1.1 `application/chat/domain/**` — `application/chat/domain/probe.ts`: `import { x } from '#chat/services/x'` → `1:19` "a module's domain imports neither its services nor …" — after: fails, own message
- P1.2 `application/chat/domain/**` — `application/chat/domain/probe.ts`: `import { x } from '#testing/chat/x'` → `1:19` "a module's source imports no test support, its own …" and `1:19` "a module reaches its own files through #<module>/… …" — after: passes
- P1.3 `application/chat/domain/**` — `application/chat/domain/probe.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P1.4 `application/chat/domain/**` — `application/chat/domain/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P2.0 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { x } from '@app-template/application/use-cases'` → `1:19` "a module's services import no workspace but …" — after: fails, reworded "a module's services import no workspace but …"
- P2.1 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { sqsClientFromConfig as x } from '@app-template/kernel/aws'` → `1:10` "of @app-template/kernel/aws a module's services …" — after: fails, own message
- P2.2 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { Db as x } from '@app-template/kernel/data'` → `1:10` "of @app-template/kernel/data a module's services …" — after: fails, own message
- P2.3 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { x } from '#chat/infrastructure/x'` → `1:19` "a module's services reach its infrastructure only …" — after: fails, own message
- P2.4 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { x } from '#testing/chat/x'` → `1:19` "a module's source imports no test support, its own …" and `1:19` "a module reaches its own files through #<module>/… …" — after: passes
- P2.5 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P2.6 `application/chat/services/**` — `application/chat/services/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P3.0 `application/chat/infrastructure/**` — `application/chat/infrastructure/probe.ts`: `import { x } from '@app-template/application/use-cases'` → `1:19` "a module's infrastructure imports no workspace but …" — after: passes
- P3.1 `application/chat/infrastructure/**` — `application/chat/infrastructure/probe.ts`: `import { x } from '#chat/services/x'` → `1:19` "a module's infrastructure implements its domain's …" — after: fails, reworded "a module's infrastructure implements its …"
- P3.2 `application/chat/infrastructure/**` — `application/chat/infrastructure/probe.ts`: `import { x } from '#testing/chat/x'` → `1:19` "a module's source imports no test support, its own …" and `1:19` "a module reaches its own files through #<module>/… …" — after: passes
- P3.3 `application/chat/infrastructure/**` — `application/chat/infrastructure/probe.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P3.4 `application/chat/infrastructure/**` — `application/chat/infrastructure/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P4.0 `application/chat/__tests__/**` — `application/chat/__tests__/domain/probe.test.ts`: `import { x } from '@app-template/application/use-cases'` → `1:19` "a module's tests import no workspace but …" — after: passes
- P4.1 `application/chat/__tests__/**` — `application/chat/__tests__/domain/probe.test.ts`: `import { sqsClientFromConfig as x } from '@app-template/kernel/aws'` → `1:10` "of @app-template/kernel/aws a module's tests take …" — after: passes
- P4.2 `application/chat/__tests__/**` — `application/chat/__tests__/domain/probe.test.ts`: `import { Db as x } from '@app-template/kernel/data'` → `1:10` "of @app-template/kernel/data a module's tests take …" — after: passes
- P4.3 `application/chat/__tests__/**` — `application/chat/__tests__/domain/probe.test.ts`: `import { x } from '#testing/chat/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P4.4 `application/chat/__tests__/**` — `application/chat/__tests__/domain/probe.test.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P4.5 `application/chat/__tests__/**` — `application/chat/__tests__/domain/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P5.0 `application/chat/__tests__/testing/**` — `application/chat/__tests__/testing/probe.ts`: `import { x } from '@app-template/application/use-cases'` → `1:19` "a module's test support imports no workspace but …" — after: passes
- P5.1 `application/chat/__tests__/testing/**` — `application/chat/__tests__/testing/probe.ts`: `import { Db as x } from '@app-template/kernel/data'` → `1:10` "of @app-template/kernel/data a module's test …" — after: passes
- P5.2 `application/chat/__tests__/testing/**` — `application/chat/__tests__/testing/probe.ts`: `import { x } from '#testing/chat/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P5.3 `application/chat/__tests__/testing/**` — `application/chat/__tests__/testing/probe.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P5.4 `application/chat/__tests__/testing/**` — `application/chat/__tests__/testing/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P6.0 `application/chat/__tests__/infrastructure/**` — `application/chat/__tests__/infrastructure/probe.test.ts`: `import { x } from '@app-template/application/use-cases'` → `1:19` "a module's infrastructure tests import no workspace …" — after: passes
- P6.1 `application/chat/__tests__/infrastructure/**` — `application/chat/__tests__/infrastructure/probe.test.ts`: `import { x } from '#chat/services/x'` → `1:19` "a module's infrastructure implements its domain's …" — after: passes
- P6.2 `application/chat/__tests__/infrastructure/**` — `application/chat/__tests__/infrastructure/probe.test.ts`: `import { x } from '#testing/chat/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P6.3 `application/chat/__tests__/infrastructure/**` — `application/chat/__tests__/infrastructure/probe.test.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P6.4 `application/chat/__tests__/infrastructure/**` — `application/chat/__tests__/infrastructure/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P7.0 `application/chat/index.ts` — `application/chat/index.ts`: `import { x } from '@app-template/application/identity'` → `4:19` "a module's entry re-exports its own layers' barrels …" — after: fails, reworded "an entry of application/ re-exports its own …"
- P7.1 `application/chat/index.ts` — `application/chat/index.ts`: `import { x } from '#identity/domain/x'` → `4:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P7.2 `application/chat/index.ts` — `application/chat/index.ts`: `import { x } from '#testing/chat/x'` → `4:19` "a module reaches its own files through #<module>/… …" and `4:19` "a module's source imports no test support, its own …" — after: passes
- P7.3 `application/chat/index.ts` — `application/chat/index.ts`: `import { x } from './x'` → `4:19` "inside a workspace import through its …" — after: fails, plugin
- P8.0 `application/identity/contract/**` — `application/identity/contract/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a module contract imports no workspace and no …" — after: fails, reworded "a module contract imports no workspace and …"
- P8.1 `application/identity/contract/**` — `application/identity/contract/probe.ts`: `import { x } from '#identity/domain/x'` → `1:19` "a module contract imports none of its module's …" — after: fails, own message
- P8.2 `application/identity/contract/**` — `application/identity/contract/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P9.0 `application/identity/domain/**` — `application/identity/domain/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a module's domain is pure and ships to the browser: …" — after: passes
- P9.1 `application/identity/domain/**` — `application/identity/domain/probe.ts`: `import { x } from '#identity/services/x'` → `1:19` "a module's domain imports neither its services nor …" — after: fails, own message
- P9.2 `application/identity/domain/**` — `application/identity/domain/probe.ts`: `import { x } from '#testing/chat/x'` → `1:19` "a module's source imports no test support, its own …" and `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P9.3 `application/identity/domain/**` — `application/identity/domain/probe.ts`: `import { x } from '#chat/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P9.4 `application/identity/domain/**` — `application/identity/domain/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P10.0 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a module's services import no workspace but …" — after: passes
- P10.1 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { sqsClientFromConfig as x } from '@app-template/kernel/aws'` → `1:10` "of @app-template/kernel/aws a module's services …" — after: fails, own message
- P10.2 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { Db as x } from '@app-template/kernel/data'` → `1:10` "of @app-template/kernel/data a module's services …" — after: fails, own message
- P10.3 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { x } from '#identity/infrastructure/x'` → `1:19` "a module's services reach its infrastructure only …" — after: fails, own message
- P10.4 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { x } from '#testing/chat/x'` → `1:19` "a module's source imports no test support, its own …" and `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P10.5 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { x } from '#chat/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P10.6 `application/identity/services/**` — `application/identity/services/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P11.0 `application/identity/__tests__/**` — `application/identity/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a module's tests import no workspace but …" — after: passes
- P11.1 `application/identity/__tests__/**` — `application/identity/__tests__/probe.test.ts`: `import { sqsClientFromConfig as x } from '@app-template/kernel/aws'` → `1:10` "of @app-template/kernel/aws a module's tests take …" — after: passes
- P11.2 `application/identity/__tests__/**` — `application/identity/__tests__/probe.test.ts`: `import { Db as x } from '@app-template/kernel/data'` → `1:10` "of @app-template/kernel/data a module's tests take …" — after: passes
- P11.3 `application/identity/__tests__/**` — `application/identity/__tests__/probe.test.ts`: `import { x } from '#testing/identity/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P11.4 `application/identity/__tests__/**` — `application/identity/__tests__/probe.test.ts`: `import { x } from '#chat/domain/x'` → `1:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P11.5 `application/identity/__tests__/**` — `application/identity/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P12.0 `application/identity/index.ts` — `application/identity/index.ts`: `import { x } from '@app-template/http-api'` → `4:19` "a module's entry re-exports its own layers' barrels …" — after: fails, reworded "an entry of application/ re-exports its own …"
- P12.1 `application/identity/index.ts` — `application/identity/index.ts`: `import { x } from '#chat/domain/x'` → `4:19` "a module reaches its own files through #<module>/… …" — after: fails, plugin
- P12.2 `application/identity/index.ts` — `application/identity/index.ts`: `import { x } from '#testing/chat/x'` → `4:19` "a module reaches its own files through #<module>/… …" and `4:19` "a module's source imports no test support, its own …" — after: fails, plugin
- P12.3 `application/identity/index.ts` — `application/identity/index.ts`: `import { x } from './x'` → `4:19` "inside a workspace import through its …" — after: fails, plugin
- P13.0 `application/use-cases/**` — `application/use-cases/probe.ts`: `import { x } from '@app-template/http-api'` → `1:19` "the use cases import no workspace but a module's …" — after: fails, own message
- P13.1 `application/use-cases/**` — `application/use-cases/probe.ts`: `import { x } from '#testing/use-cases/x'` → `1:19` "a use case's source imports no test support …" — after: passes
- P13.2 `application/use-cases/**` — `application/use-cases/probe.ts`: `import { x } from '#chat/domain/x'` → `1:19` "the use cases reach their own files through …" — after: fails, plugin
- P13.3 `application/use-cases/**` — `application/use-cases/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P14.0 `application/use-cases/__tests__/**` — `application/use-cases/__tests__/probe.test.ts`: `import { x } from '@app-template/http-api'` → `1:19` "the use cases import no workspace but a module's …" — after: passes
- P14.1 `application/use-cases/__tests__/**` — `application/use-cases/__tests__/probe.test.ts`: `import { x } from '#testing/use-cases/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P14.2 `application/use-cases/__tests__/**` — `application/use-cases/__tests__/probe.test.ts`: `import { x } from '#chat/domain/x'` → `1:19` "the use cases reach their own files through …" — after: fails, plugin
- P14.3 `application/use-cases/__tests__/**` — `application/use-cases/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P15.0 `kernel/**` — `kernel/probe/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a kernel part with no override of its own imports …" — after: passes
- P15.1 `kernel/**` — `kernel/probe/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P16.0 `kernel/data/**` — `kernel/data/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the data layer imports no workspace but packages/*: …" — after: fails, reworded "the data layer imports no workspace but …"
- P16.1 `kernel/data/**` — `kernel/data/probe.ts`: `import { x } from '#kernel/config/x'` → `1:19` "the data layer imports no other kernel part …" — after: fails, plugin
- P16.2 `kernel/data/**` — `kernel/data/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P17.0 `kernel/*/__tests__/**` — `kernel/aws/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the tests of a kernel part with no override of …" — after: passes
- P17.1 `kernel/*/__tests__/**` — `kernel/aws/__tests__/probe.test.ts`: `import { x } from '#testing/config/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: fails, plugin
- P17.2 `kernel/*/__tests__/**` — `kernel/aws/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P18.0 `kernel/data/__tests__/**` — `kernel/data/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the data layer and its memory repositories import …" — after: passes
- P18.1 `kernel/data/__tests__/**` — `kernel/data/__tests__/probe.test.ts`: `import { x } from '#kernel/config/x'` → `1:19` "the data layer and its memory repositories import …" — after: fails, plugin
- P18.2 `kernel/data/__tests__/**` — `kernel/data/__tests__/probe.test.ts`: `import { x } from '#testing/config/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: fails, plugin
- P18.3 `kernel/data/__tests__/**` — `kernel/data/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P19.0 `kernel/*/__e2e__/**` — `kernel/config/__e2e__/probe.e2e.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the e2e of a kernel part with no override of their …" — after: passes
- P19.1 `kernel/*/__e2e__/**` — `kernel/config/__e2e__/probe.e2e.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P20.0 `kernel/aws/**` — `kernel/aws/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "kernel/aws and its e2e support import no workspace …" — after: passes
- P20.1 `kernel/aws/**` — `kernel/aws/probe.ts`: `import { x } from '#kernel/config/x'` → `1:19` "a kernel part reaches another only through its …" — after: fails, plugin
- P20.2 `kernel/aws/**` — `kernel/aws/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P21.0 `kernel/llm/**` — `kernel/llm/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "kernel/llm imports no workspace but packages/* and …" — after: passes
- P21.1 `kernel/llm/**` — `kernel/llm/probe.ts`: `import { x } from '#kernel/config/x'` → `1:19` "a kernel part reaches another only through its …" — after: fails, plugin
- P21.2 `kernel/llm/**` — `kernel/llm/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P22.0 `kernel/postgres/**` — `kernel/postgres/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "kernel/postgres and its e2e import no workspace but …" — after: passes
- P22.1 `kernel/postgres/**` — `kernel/postgres/probe.ts`: `import { x } from '#kernel/config/x'` → `1:19` "a kernel part reaches another only through its …" — after: fails, plugin
- P22.2 `kernel/postgres/**` — `kernel/postgres/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P23.0 `kernel/queue/**` — `kernel/queue/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "kernel/queue, its e2e and their support import no …" — after: passes
- P23.1 `kernel/queue/**` — `kernel/queue/probe.ts`: `import { x } from '#kernel/config/x'` → `1:19` "a kernel part reaches another only through its …" — after: fails, plugin
- P23.2 `kernel/queue/**` — `kernel/queue/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P24.0 `kernel/config/**` — `kernel/config/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "kernel/config and its tests import no workspace but …" — after: passes
- P24.1 `kernel/config/**` — `kernel/config/probe.ts`: `import { x } from '#kernel/data/x'` → `1:19` "a kernel part reaches another only through its …" — after: fails, plugin
- P24.2 `kernel/config/**` — `kernel/config/probe.ts`: `import { x } from '#testing/config/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P24.3 `kernel/config/**` — `kernel/config/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P25.0 `kernel/data/__e2e__/**` — `kernel/data/__e2e__/probe.e2e.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the e2e of the data layer and their support import …" — after: passes
- P25.1 `kernel/data/__e2e__/**` — `kernel/data/__e2e__/probe.e2e.ts`: `import { x } from '#kernel/config/x'` → `1:19` "a kernel part reaches another only through its …" — after: fails, plugin
- P25.2 `kernel/data/__e2e__/**` — `kernel/data/__e2e__/probe.e2e.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P26.0 `packages/**` — `packages/probe/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "a package with no override of its own imports no …" — after: passes
- P26.1 `packages/**` — `packages/probe/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P27.0 `packages/*/__tests__/**` — `packages/llm/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the tests of a package with no override of their …" — after: passes
- P27.1 `packages/*/__tests__/**` — `packages/llm/__tests__/probe.test.ts`: `import { x } from '#testing/db/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: fails, plugin
- P27.2 `packages/*/__tests__/**` — `packages/llm/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P28.0 `packages/aws/**` — `packages/aws/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "packages/aws imports no workspace but none: a …" — after: passes
- P28.1 `packages/aws/**` — `packages/aws/probe.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P28.2 `packages/aws/**` — `packages/aws/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P29.0 `packages/aws/__tests__/**` — `packages/aws/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the tests of packages/aws import no workspace but …" — after: passes
- P29.1 `packages/aws/__tests__/**` — `packages/aws/__tests__/probe.test.ts`: `import { x } from '#testing/aws/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P29.2 `packages/aws/__tests__/**` — `packages/aws/__tests__/probe.test.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P29.3 `packages/aws/__tests__/**` — `packages/aws/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P30.0 `packages/db/**` — `packages/db/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "packages/db imports no workspace but …" — after: passes
- P30.1 `packages/db/**` — `packages/db/probe.ts`: `import { x } from '#aws/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P30.2 `packages/db/**` — `packages/db/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P31.0 `packages/db/__tests__/**` — `packages/db/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the tests of packages/db import no workspace but …" — after: passes
- P31.1 `packages/db/__tests__/**` — `packages/db/__tests__/probe.test.ts`: `import { x } from '#testing/db/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P31.2 `packages/db/__tests__/**` — `packages/db/__tests__/probe.test.ts`: `import { x } from '#aws/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P31.3 `packages/db/__tests__/**` — `packages/db/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P32.0 `packages/llm/**` — `packages/llm/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "packages/llm imports no workspace but none: a …" — after: passes
- P32.1 `packages/llm/**` — `packages/llm/probe.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P32.2 `packages/llm/**` — `packages/llm/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P33.0 `packages/queue/**` — `packages/queue/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "packages/queue imports no workspace but …" — after: passes
- P33.1 `packages/queue/**` — `packages/queue/probe.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P33.2 `packages/queue/**` — `packages/queue/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P34.0 `packages/queue/__tests__/**` — `packages/queue/__tests__/probe.test.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "the tests of packages/queue import no workspace but …" — after: passes
- P34.1 `packages/queue/__tests__/**` — `packages/queue/__tests__/probe.test.ts`: `import { x } from '#testing/queue/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P34.2 `packages/queue/__tests__/**` — `packages/queue/__tests__/probe.test.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P34.3 `packages/queue/__tests__/**` — `packages/queue/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P35.0 `packages/s3/**` — `packages/s3/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "packages/s3 imports no workspace but …" — after: passes
- P35.1 `packages/s3/**` — `packages/s3/probe.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P35.2 `packages/s3/**` — `packages/s3/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P36.0 `packages/testing/**` — `packages/testing/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "packages/testing imports no workspace but none: a …" — after: passes
- P36.1 `packages/testing/**` — `packages/testing/probe.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P36.2 `packages/testing/**` — `packages/testing/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P37.0 `packages/ui/**` — `packages/ui/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "packages/ui imports no workspace but none: a …" — after: passes
- P37.1 `packages/ui/**` — `packages/ui/probe.ts`: `import { x } from '#db/x'` → `1:19` "a package reaches its own files through …" — after: fails, plugin
- P37.2 `packages/ui/**` — `packages/ui/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P38.0 `apps/api/**` — `apps/api/probe.ts`: `import { x } from '@app-template/worker'` → `1:19` "apps/api imports no workspace but the modules' and …" — after: passes
- P38.1 `apps/api/**` — `apps/api/probe.ts`: `import { x } from '@app-template/kernel/data'` → `1:19` "a handler calls one service method or one use case, …" — after: passes
- P38.2 `apps/api/**` — `apps/api/probe.ts`: `import { chatFromEntity as x } from '@app-template/application/chat'` → `1:10` "a handler never maps an entity: the module's …" — after: passes
- P38.3 `apps/api/**` — `apps/api/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P39.0 `apps/api/layer.ts` — `apps/api/layer.ts`: `import { x } from '@app-template/worker'` → `73:19` "apps/api imports no workspace but the modules' and …" — after: passes
- P39.1 `apps/api/layer.ts` — `apps/api/layer.ts`: `import { x } from './x'` → `73:19` "inside a workspace import through its …" — after: fails, plugin
- P40.0 `apps/api/__tests__/**` — `apps/api/__tests__/probe.test.ts`: `import { x } from '@app-template/worker'` → `1:19` "the tests of apps/api import no workspace but the …" — after: passes
- P40.1 `apps/api/__tests__/**` — `apps/api/__tests__/probe.test.ts`: `import { x } from '@app-template/kernel/data'` → `1:19` "a handler calls one service method or one use case, …" — after: passes
- P40.2 `apps/api/__tests__/**` — `apps/api/__tests__/probe.test.ts`: `import { chatFromEntity as x } from '@app-template/application/chat'` → `1:10` "a handler never maps an entity: the module's …" — after: passes
- P40.3 `apps/api/__tests__/**` — `apps/api/__tests__/probe.test.ts`: `import { x } from '#testing/aws/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P40.4 `apps/api/__tests__/**` — `apps/api/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P41.0 `apps/worker/**` — `apps/worker/probe.ts`: `import { x } from '@app-template/http-api'` → `1:19` "apps/worker imports no workspace but the modules' …" — after: passes
- P41.1 `apps/worker/**` — `apps/worker/probe.ts`: `import { x } from '@app-template/kernel/data'` → `1:19` "a handler calls one service method or one use case, …" — after: passes
- P41.2 `apps/worker/**` — `apps/worker/probe.ts`: `import { chatFromEntity as x } from '@app-template/application/chat'` → `1:10` "a handler never maps an entity: the module's …" — after: passes
- P41.3 `apps/worker/**` — `apps/worker/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P42.0 `apps/worker/layer.ts` — `apps/worker/layer.ts`: `import { x } from '@app-template/http-api'` → `45:19` "apps/worker imports no workspace but the modules' …" — after: passes
- P42.1 `apps/worker/layer.ts` — `apps/worker/layer.ts`: `import { x } from './x'` → `45:19` "inside a workspace import through its …" — after: fails, plugin
- P43.0 `apps/worker/__tests__/**` — `apps/worker/__tests__/probe.test.ts`: `import { x } from '@app-template/http-api'` → `1:19` "the tests of apps/worker import no workspace but …" — after: passes
- P43.1 `apps/worker/__tests__/**` — `apps/worker/__tests__/probe.test.ts`: `import { x } from '@app-template/kernel/data'` → `1:19` "a handler calls one service method or one use case, …" — after: passes
- P43.2 `apps/worker/__tests__/**` — `apps/worker/__tests__/probe.test.ts`: `import { chatFromEntity as x } from '@app-template/application/chat'` → `1:10` "a handler never maps an entity: the module's …" — after: passes
- P43.3 `apps/worker/__tests__/**` — `apps/worker/__tests__/probe.test.ts`: `import { x } from '#testing/aws/e2e/x'` → `1:19` "a unit test and its support import no e2e support …" — after: passes
- P43.4 `apps/worker/__tests__/**` — `apps/worker/__tests__/probe.test.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P44.0 `apps/web/**` — `apps/web/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "web client code may import only …" — after: fails, own message
- P44.1 `apps/web/**` — `apps/web/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P45.0 `apps/web/main.ts` — `apps/web/main.ts`: `import { x } from '@app-template/application/chat'` → `33:19` "the web server entry imports only …" — after: passes
- P45.1 `apps/web/main.ts` — `apps/web/main.ts`: `import { x } from './x'` → `33:19` "inside a workspace import through its …" — after: fails, plugin
- P46.0 `deployment/**` — `deployment/probe.ts`: `import { x } from '@app-template/application/chat'` → `1:19` "deployment may import only packages/* and of the …" — after: passes
- P46.1 `deployment/**` — `deployment/probe.ts`: `import { sqsClientFromConfig as x } from '@app-template/kernel/aws'` → `1:10` "of @app-template/kernel/aws deployment takes only …" — after: passes
- P46.2 `deployment/**` — `deployment/probe.ts`: `import { x } from '@app-template/kernel/data'` → `1:10` "of @app-template/kernel/data deployment takes only …" — after: passes
- P46.3 `deployment/**` — `deployment/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- P47.0 `apps/e2e/**` — `apps/e2e/probe.ts`: `import { x } from '@app-template/api'` → `1:19` "the e2e import no workspace but the processes' test …" — after: passes
- P47.1 `apps/e2e/**` — `apps/e2e/probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- R1 root, noRestrictedImports — `probe.ts`: `import { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
- R2 root, noImportCycles — `application/chat/domain/probe-cycle-a.ts`: `import { b as x } from '#chat/domain/probe-cycle-b'` → `1:24` "This import is part of a cycle." — after: fails, `noImportCycles`
- G1 plugin `biome-imports.grit`, another unit's file — `kernel/aws/__tests__/probe-g1.test.ts`: `import { x } from '#kernel/config/x'` → no diagnostic, exit 0 — after: fails, plugin
- G2 plugin `biome-imports.grit`, relative path — `probe-g2.ts`: `export { x } from './x'` → `1:19` "inside a workspace import through its …" — after: fails, plugin
