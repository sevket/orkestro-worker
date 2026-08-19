# Testing (worker)

Unit **and** integration tests are mandatory (`AGENTS.md`).

```bash
npm test                 # unit + integration
npm run test:unit
npm run test:integration
npm run test:coverage    # enforces 80% thresholds
npm run verify           # typecheck + coverage — what CI runs
```

## Layout

```
tests/
  unit/          pure logic in src/lib/
  integration/   the stream pipeline and anything crossing a boundary
```

## What belongs where

- **`src/lib/`** is pure: no socket.io-client, bullmq, ioredis, `child_process`
  or `fs`. Test it by calling it.
- **`src/runner.ts`** (`JsonLogSimplifier`) is a `Transform`; test it by piping
  realistic agent output through it and asserting what a Kanban card would show,
  including chunk boundaries splitting a JSON object in half.
- **`src/worker.ts`** is the composition root. Do not add logic here — extract
  it to `src/lib/` and unit-test it there. That constraint is the reason the
  worker is testable at all.

## Rules

- Arrange–Act–Assert, one behaviour per test, names that describe the behaviour.
- Cover the failure paths: a malformed planner payload, an out-of-credit agent,
  a crashed CLI, an unterminated JSON object.
- Never let a test talk to a real Redis, a real master, or a real agent CLI.
- Coverage thresholds are a floor, never to be lowered to make a build pass.
