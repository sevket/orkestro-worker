# Changelog

All notable changes to the Orkestro worker are recorded here, following
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

**Every behavioural change must add an entry under `## [Unreleased]` in the same
commit** — the pre-commit hook enforces it.

## [Unreleased]

### Added
- Contributor contract (`AGENTS.md`, `CLAUDE.md`) and `docs/TESTING.md`.
- Test infrastructure: vitest with unit and integration suites and 80% coverage
  thresholds over `src/lib/**` and `src/runner.ts`. 41 tests at introduction.
- `src/lib/`: extracted pure, unit-tested core — `plannerTasks.ts` (planner JSON
  extraction with its three fallbacks), `capacity.ts` (hardware-aware
  concurrency budget), `agentErrors.ts` (agent failure diagnosis).
- CI (`.github/workflows/ci.yml`): typecheck, unit + integration tests, coverage.
- Git hooks (`.githooks/`): pre-commit runs typecheck, unit tests, a changelog
  check and a secret scan; pre-push runs the full verification.
- npm scripts: `test`, `test:unit`, `test:integration`, `test:coverage`,
  `typecheck`, `verify`.

### Changed
- The pre-commit changelog check skips merge commits: requiring an entry for
  someone else's merged work forced `--no-verify`, which trains people to skip
  the gate entirely.

### Fixed
- A failed agent run with a **nested** API error payload produced no diagnosis
  at all: the non-greedy regex captured an unparseable fragment and the error
  message was silently dropped. Replaced with a balanced-brace JSON scanner, so
  the card now shows the provider's actual message.

## [1.0.0] — before 2026-08-19

Pre-restart history was not tracked in a changelog; see `git log`.
