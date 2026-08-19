# Orkestro Worker — Agent & Contributor Contract

> Read before any change. Agent CLIs load `AGENTS.md` from the working directory
> automatically, so these rules bind every run in this repository.
> `CLAUDE.md` points here; edit only this file.

This is the **execution node** of Orkestro: it connects to a master over
Socket.IO, consumes BullMQ jobs, adopts a persona, prepares the git workspace
and spawns the agent CLI. The master repository (`orkestro`) owns the board,
the database and the rules; this repository must stay compatible with its
socket and queue contract (`docs/ARCHITECTURE.md` there).

## The rules

1. **Tests first.** Unit tests for logic, integration tests for anything that
   crosses a boundary (stream transforms, socket payloads, job handling). See
   `docs/TESTING.md`.
2. **`npm run verify` must pass** before you commit — typecheck + tests +
   coverage thresholds (80%).
3. **Pure logic lives in `src/lib/`** and must not import socket.io-client,
   bullmq, ioredis, `child_process` or `fs`. That is what makes it testable, and
   it is where new logic belongs by default.
4. **`CHANGELOG.md` gets an entry** for every behavioural change; the
   pre-commit hook enforces it.
5. **Never commit secrets** (`.env` is ignored), never `sudo`, never
   force-push `main`.
6. **Changing the master contract is a two-repo change.** If you touch a socket
   event name, a queue name or a job payload field, the matching change and
   `docs/ARCHITECTURE.md` update in `orkestro` land together.

## Fast path

```bash
npm install       # installs git hooks via "prepare"
npm run dev       # watch mode against the configured MASTER_URL
npm test
npm run verify
```

Configuration lives in `.env` (see `.env.example`): `MASTER_URL`, `REDIS_URL`,
`WORKER_ID`, `WORKER_CAPACITY`, `WORKER_ROLES`,
`WORKER_IGNORE_HARDWARE_LIMITS`.
