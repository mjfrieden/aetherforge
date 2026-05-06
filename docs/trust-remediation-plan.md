# Cumulonimbus Trust Remediation Plan

## Launch blockers

1. Demo and live research must never share the same leaderboard, model registry, or training rows.
2. Read endpoints must not silently mutate replay state or consume broker market-data budget.
3. Model promotion must be earned on untouched future-ish data, not on the same rows used to fit the candidate.
4. Migrations must be safely replayable in local recovery and remote deploy workflows.

## Beta standard

- Demo history may exist, but only inside an explicitly labeled `demo` workspace.
- Broker-linked replay may exist, but only inside an explicitly labeled `live` workspace.
- Leaderboards, public bragging surfaces, and active live-model decisions may only use `live`.
- Candidate promotion must compare against the active model on a chronological holdout or later shadow window.
- Any synthetic history control must be demoted from growth CTA to practice tooling.

## Remediation waves

### Wave 1: Trust boundary

- Add `workspace` labels across research and model tables.
- Migrate legacy data conservatively, biasing ambiguous records away from `live`.
- Route seeded history and synthetic backfill into `demo` only.
- Route Tradier-linked scans, refreshes, and active live training into `live` only.
- Filter leaderboard to `live` only.

Status: implemented in this pass.

### Wave 2: Read/write separation

- Make `GET /api/research/dashboard` read-only.
- Move broker refresh and outcome resolution into an explicit action.
- Keep boot and page reloads cheap, predictable, and safe against rate-limit churn.

Status: implemented in this pass.

### Wave 3: Governance credibility

- Train first models on all eligible rows when no active benchmark exists.
- Train candidate models on an earlier slice.
- Score candidate and active on a later untouched holdout window before promotion.
- Record the holdout window in comparison metadata.

Status: implemented in this pass.

### Wave 4: Remaining pre-beta work

- Add a real shadow-period promotion path so candidates can prove themselves on future live decisions, not just a historical holdout.
- Add demo/live switch affordances if we want users to keep practicing in demo after linking a broker.
- Add cleanup tooling to purge demo workspaces and reset model timelines cleanly.
- Add monitoring for refresh failures, broker rate-limit errors, and migration drift.
- Add tests that exercise workspace isolation end-to-end across dashboard, scan, training, and leaderboard flows.

Status:
- Shadow-period promotion path: implemented.
- Workspace isolation integration tests: implemented.
- Demo/live workspace switching UI: still required if we want dual-workspace users.
- Cleanup tooling and monitoring: still required.

## Operational rules

- Never count `demo` toward public rank.
- Never auto-promote a candidate from in-sample deltas.
- Never let a read route create snapshots, resolve outcomes, or seed manifests/history.
- Never assume a migration file can be replayed safely without a migration ledger.

## What this pass changed

- Added an explicit `demo/live` workspace schema layer.
- Added an explicit live replay refresh endpoint.
- Removed hidden dashboard writes.
- Filtered live model reads and leaderboard queries by workspace.
- Switched candidate promotion to a chronological holdout plus future shadow comparison.
- Replaced one-shot migration scripts with a migration runner and ledger.
- Added integration tests for workspace isolation and shadow-promotion gating.
