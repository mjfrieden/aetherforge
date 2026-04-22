# Orographic And Cirrus Evaluation

Date: 2026-04-21

## Executive Read

Orographic is the stronger base for a deployable trading game because it already has a Cloudflare Pages surface, protected login flow, server-side Tradier proxy routes, and a Scout -> Forge -> Council architecture that maps cleanly into game verbs. Cirrus is the stronger base for research discipline because it has playbooks, a no-trade gate, empirical edge checks, and lightweight live-versus-shadow performance tracking.

The new Aetherforge project borrows the operating shape from both without copying their secrets or brokerage assumptions: Orographic contributes the "server owns broker credentials" pattern, while Cirrus contributes playbook gates, abstention, and auditability.

## Orographic Findings

Strengths:

- Clean first-party layers: Scout for directional candidates, Forge for tradable contracts, Council for portfolio selection.
- Cloudflare Pages deployment model already exists.
- Existing auth and Tradier bridge correctly keep the broker token out of browser JavaScript.
- Live order submission is preview-first and gated by role, mode, live flags, and snapshot freshness.
- Good model-governance language around shadow mode and promotion gates.

Risks:

- Current auth is environment-secret user lists rather than true multi-user self-service accounts.
- Tradier configuration is deployment-level, so it does not isolate multiple users' brokerage tokens or accounts.
- The game loop is useful as a single-player execution shell, but not yet a durable per-user game/account system.
- Earlier report cards still call out model/live-parity issues: real-chain coverage, replay/live drift, and Scout labels that are not direct option-payoff labels.

## Cirrus Findings

Strengths:

- Playbooks and no-trade gate are clear, auditable, and safer than forced picks.
- Performance ledger tracks live and shadow ideas separately.
- Research outputs include Markdown and JSON artifacts for later inspection.
- Backtest code states its limitations clearly: proxy OHLCV ranking, not historical option-chain PnL.

Risks:

- It is a Python scanner, not a hosted multi-user web app.
- There is no brokerage adapter or order state machine.
- Current strategy behavior appears narrow, especially same-week downside continuation puts in risk-off regimes.
- The pipeline is still tightly coupled around ingestion, ranking, reporting, and persistence.

## Product Direction For Aetherforge

Aetherforge is intentionally a new multi-user app:

- Browser game first screen with a cloud-temple trading theme.
- D1-backed accounts, sessions, saved progress, model artifacts, audit logs, and leaderboard state.
- Per-user encrypted Tradier token/account storage.
- Server-side Tradier calls only; the browser never receives a broker token.
- Sandbox-first order preview and placement with live trading globally disabled unless explicitly armed.
- A small per-user logistic model that players train from game-collected samples before making forecasts.

## Security Posture

The first implementation uses:

- HttpOnly SameSite session cookies.
- Server-side session storage for revocation.
- CSRF tokens for state-changing requests.
- PBKDF2 password hashing with per-user salts.
- D1 rate limiting for login and registration attempts.
- AES-GCM encryption for per-user Tradier tokens.
- Strict security headers through Pages Functions middleware.
- UUID-like random IDs instead of incrementing public IDs.
- Audit logs for auth, model training, broker linking, and trade-intent events.

Live trading remains blocked by default. A user can save live-mode Tradier credentials, but placement requires deployment-level `GLOBAL_LIVE_TRADING_ENABLED=true`, per-user live arming, and an exact confirmation phrase.
