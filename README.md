# agentic-harness.core

Pi-agnostic business logic for [agentic-harness](https://github.com/Jitsusama/agentic-harness.pi):
state machines, guardian decisions, the quest domain model. Each domain is a
pure, host-agnostic TypeScript module plus a stateless-per-invocation CLI;
adapters (pi, Claude Code, ...) own persistence, presentation and how their
host surfaces things like confirmation.

## CLI

Each invocation reads/writes its own small JSON state file — no daemon, no
long-lived process. This is the shape a Bash-invoked skill or a hook
dispatcher needs.

```sh
echo '{}' | agentic-harness-core quest list

agentic-harness-core hook pre-bash < payload.json
```

The quest domain keeps its loaded state in `.agentic-harness/quest-state.json`
relative to the current directory; pass `--state-file` to put it elsewhere.

## Development

```sh
npm install
npm run build      # compiles src/ + bin/ to dist/
npm test           # builds, then runs the vitest suite (unit + CLI)
npm run typecheck
npm run lint
```
