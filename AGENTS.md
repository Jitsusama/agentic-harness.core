# AGENTS.md

agentic-harness.core is the host-agnostic library under
[agentic-harness.pi][pi]: the logic of its guardians, quests,
reviews, trees and integrations, with no pi in it. A host (pi,
Claude Code, a hook dispatcher) owns persistence, presentation and
how it asks a person; this package decides. It is published to npm
as `@jitsusama/agentic-harness.core`, and `bin/` is its CLI.

## Map

Each top-level folder is one domain, with an `index.ts` that is its
public surface and opens by saying what the domain is for. Read
that first.

| Folders | Hold |
| --- | --- |
| `gate`, `guardian`, `prose`, `sections`, `title` | judging authored text: the gate that blocks once and relents, and the prose, section and title rules it applies |
| `command`, `shell`, `git-cli`, `github-cli` | reading a bash command line, and what git and gh commands may not do |
| `attribution` | saying where AI took part in a commit, PR or issue |
| `exec`, `process`, `clock`, `remote`, `thinking`, `ui` | small shared vocabularies: running a command, naming a process, timeouts, remotes, thinking levels, counts said aloud |
| `completion`, `verify`, `terminal` | a one-off model call, a project's check command, and terminals to open and type into |
| `quest`, `notes`, `memory`, `governance`, `refs` | the documents and facts a session keeps: quests, notes, retained facts, captured rules, references to other systems |
| `result`, `observability`, `advisor` | stored tool answers, run telemetry for fleets and councils, and the advisor's decisions |
| `work`, `tree`, `review` | working on a change (branches, commits, trees, stacks) and reviewing one, whatever hosts it |
| `google`, `slack`, `lsp`, `web` | integrations: Google Workspace, Slack, language servers, and driving a browser |
| `internal/` | the parts of several domains their barrels don't export; `package.json`'s `exports` decides what is public, and publishes some of these under their domain's name |
| `bin/` | the `agentic-harness-core` CLI, one adapter per domain it serves |
| `tests/` | the tests, mirroring the tree; `tests/browser/` drives a real Chrome and `tests/bin/` runs the built CLI |

## Rules

- Nothing here imports pi or any host. A host-specific need is a
  parameter or an injected dependency, never an import.
- A domain's `index.ts` is its contract. Add to it deliberately;
  what isn't exported there or in `package.json`'s `exports` may
  change without notice.
- Every file opens with a comment saying what it is for, and every
  exported function has a JSDoc comment.
- The [repository quality standard][standard] applies; the
  bindings below say how this repository holds it.

## Commands

```sh
pnpm check                     # everything, once, before merging
pnpm lint:fix                  # Biome's fixes, then verify
pnpm typecheck                 # tsc over the whole project
pnpm test                      # builds dist/, then the unit and CLI tests
pnpm test:browser              # the browser tests, against a real Chrome
pnpm exec vitest run <paths>   # the tests a change touches, as you go
```

pnpm is the package manager; `pnpm-lock.yaml` is the only lockfile.
The typecheck reads the built `dist/` for one self-import, so run
`pnpm build` first in a fresh checkout.

## Bindings

How this repository holds the standard's rules today, and what it
doesn't hold yet:

- **The gate:** `pnpm check` runs Biome, tsc, the unit and CLI
  tests and the browser tests.
- **Linters:** Biome's recommended rules and tsc's `strict`. Not
  yet: Biome's stricter rules, and tsc's `noUncheckedIndexedAccess`
  and `exactOptionalPropertyTypes`, which would raise 621 and 163
  errors as the code stands.
- **Programs in their own files:** not yet. About 33 page scripts
  for the browser and 19 SQL statements are strings in TypeScript.
- **Tests that can't run:** not yet. The browser tests skip without
  Chrome rather than failing the gate.

[pi]: https://github.com/Jitsusama/agentic-harness.pi
[standard]: https://github.com/Jitsusama/agentic-harness.pi/blob/main/skills/repo-quality-standard/SKILL.md
