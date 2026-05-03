# Cumulonimbus Platform Roadmap

## Recommendation

Cumulonimbus should be an options trading and learning cockpit first. The main product surface is now the `/game` replay desk, not an explorable MMO map. The game layer should show up through progression, leagues, challenges, model versions, badges, and season framing while the user's core loop stays close to real options work.

The ideal long-term product stack is:

- Vite + TypeScript for the authenticated cockpit.
- Dedicated `/login`, `/register`, and `/game` pages.
- A replay-backed paper-trading ledger with normalized league seasons.
- Server-side market data and option-chain ingestion.
- Server-side model training/prediction routes with model version history.
- A real-time presence layer for league rooms, shared watchlists, and mentor sessions.
- Server-side Tradier routes for broker previews and gated order placement.

## Current Practical Boundary

This repo already has working Cloudflare Pages Functions for auth, encrypted per-user Tradier token storage, CSRF, sessions, D1 persistence, model storage, game state, and order gating. Those security-sensitive routes were preserved during the cockpit pivot so trading protection did not regress.

The current cockpit now includes:

1. Mission Control: watchlist, replay option chain, equity curve, paper/shadow scans, active model stats.
2. Model Lab: real feature selection, replay-model training, timestamped event overlays, and walk-forward framing.
3. Arena: leaderboard driven by out-of-sample decision scoring plus learning challenge framing.
4. Broker Vault: encrypted Tradier connection and gated single-leg preview/placement.

The replay substrate is now in place: server-side market snapshots, normalized research tables, replay decisions, resolved outcomes, and paper trades no longer live primarily inside `game_state`.

## Product Direction

Near-term work should favor:

- Historical backfill so the replay store can train faster than live accumulation alone.
- Model version comparison, feature importance history, and promotion gates.
- Richer no-trade scoring so patience beats forced trades.
- League rooms with season resets, risk limits, and normalized starting capital.
- AI coaching that explains risk, liquidity, IV, and sizing instead of pretending to be a data vendor.

## Image Budget Discipline

The cockpit does not need fresh generated art for every iteration. The existing arena background remains useful for login/landing atmosphere, while the main app should prioritize dense, readable trading UI. No OpenAI key is exposed to the browser.
