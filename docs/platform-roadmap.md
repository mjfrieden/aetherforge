# Option Oracle Arena Platform Roadmap

## Recommendation

Option Oracle Arena should be an options trading and learning cockpit first. The main product surface is now the `/game` trading desk, not an explorable MMO map. The game layer should show up through progression, leagues, challenges, model versions, badges, and season framing while the user's core loop stays close to real options work.

The ideal long-term product stack is:

- Vite + TypeScript for the authenticated cockpit.
- Dedicated `/login`, `/register`, and `/game` pages.
- A paper-trading ledger with normalized league seasons.
- Server-side market data and option-chain ingestion.
- Server-side model training/prediction routes with model version history.
- A real-time presence layer for league rooms, shared watchlists, and mentor sessions.
- Server-side Tradier routes for broker previews and gated order placement.

## Current Practical Boundary

This repo already has working Cloudflare Pages Functions for auth, encrypted per-user Tradier token storage, CSRF, sessions, D1 persistence, model storage, game state, and order gating. Those security-sensitive routes were preserved during the cockpit pivot so trading protection did not regress.

The current cockpit includes:

1. Trading Desk: watchlist, synthetic paper option chain, equity curve, paper trades, active model stats.
2. Model Lab: architecture/features/optimizer selection with server-backed training.
3. Leagues: D1-backed leaderboard plus learning challenge framing.
4. Broker Vault: encrypted Tradier connection and gated single-leg preview/placement.

The next high-value backend pass is replacing the synthetic paper feed with real server-side market data and a historical option-chain replay store.

## Product Direction

Near-term work should favor:

- Real options-chain snapshots from Tradier or another licensed provider.
- A paper trade ledger table instead of storing trades only inside `game_state`.
- Model version comparison, feature importance history, and promotion gates.
- No-trade scoring so patience beats forced trades.
- League rooms with season resets, risk limits, and normalized starting capital.
- AI coaching that explains risk, liquidity, IV, and sizing instead of pretending to be a data vendor.

## Image Budget Discipline

The cockpit does not need fresh generated art for every iteration. The existing arena background remains useful for login/landing atmosphere, while the main app should prioritize dense, readable trading UI. No OpenAI key is exposed to the browser.
