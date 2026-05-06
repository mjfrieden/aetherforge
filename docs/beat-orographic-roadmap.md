# Cumulonimbus Roadmap To Outgrow Orographic

Date: 2026-05-04

## Strategic Thesis

Cumulonimbus should not try to beat Orographic by becoming a slightly nicer copy of Orographic.

Orographic is strongest where pipeline architecture, scan discipline, shadow governance, and contract-selection rigor matter most. Cumulonimbus should borrow those lessons, then win on surfaces Orographic is not built to own:

- true multi-user identity and progression
- per-user broker isolation and auditability
- replay-first training and post-trade learning
- league, coaching, and social learning loops
- model/version history that normal users can understand

The goal is to become the operating system for options learning, not only a smart scanner.

## Where We Already Lead

Today Cumulonimbus already has structural advantages:

- D1-backed self-serve accounts instead of environment-secret user lists
- per-user encrypted Tradier credentials instead of deployment-level broker state
- authenticated replay cockpit instead of a mostly static operator dashboard
- server-stored snapshots, decisions, outcomes, and model artifacts per user
- leaderboard and challenge framing that can grow into real leagues

These foundations matter because they let us compound user history, trust, and community over time.

## Where Orographic Is Still Stronger

Orographic still has better research maturity in a few important areas:

- clearer Scout -> Forge -> Council separation
- deeper backtest and strict-real replay language
- stronger promotion-gate discipline for shadow features
- richer portfolio construction and abstention logic
- better diagnostics explaining why ideas were rejected

This roadmap closes those gaps without losing the parts that make Cumulonimbus different.

## Product Principles

Every major feature should reinforce these rules:

1. The replay ledger is the source of truth.
2. No-trade is a first-class win condition.
3. Explanations matter as much as scores.
4. Models must earn promotion through visible evidence.
5. Multiplayer should improve judgment, not gamify recklessness.

## Wave 1: Research And Trust Foundation

Target window: next 30 days

### Outcome

Make Cumulonimbus feel measurably more serious than a lightweight replay app.

### Deliverables

- Historical replay backfill
  - ingest older option-chain snapshots and resolved outcomes so new users can train immediately
  - seed symbol histories for the main watchlist before a user connects Tradier
- Model registry v1
  - show every trained model version, feature set, training rows, validation mode, and walk-forward score
  - let users compare the active model against the previous model before promotion
- Promotion gates
  - shadow, candidate, active, and retired model states
  - require minimum resolved rows and minimum walk-forward thresholds before activation
- Decision diagnostics
  - explain why each replay decision was `call`, `put`, or `no_trade`
  - show liquidity pressure, IV pressure, confidence margin, and abstention triggers
- Outcome review screen
  - for every resolved decision, show what happened, what the model predicted, and whether abstaining would have won

### Why This Beats Orographic

Orographic has stronger governance language, but Cumulonimbus can make governance visible and interactive for every user instead of keeping it as an expert-only artifact trail.

### Success Metrics

- a new account can train its first model on day one
- at least 80% of resolved decisions have human-readable rationale
- active-vs-previous model comparison exists before every promotion
- no-trade outcomes are visible in the same workflow as directional wins

## Wave 2: Council And Coaching Layer

Target window: days 31-60

### Outcome

Move from single-idea scoring to disciplined portfolio behavior.

### Deliverables

- Council layer for Cumulonimbus
  - side-balance guardrails
  - sector and symbol concentration limits
  - normalized budget sizing rules
  - “why this was demoted to no-trade or shadow” explanations
- Exit discipline and trade review
  - attach exits to replay decisions and paper trades
  - grade entries, exits, hold-too-long behavior, and early-profit-taking
- Coaching engine v1
  - explain spread quality, extrinsic burden, gamma risk, IV crush risk, and liquidity danger in plain English
  - convert expert diagnostics into short, reusable lesson cards
- Feature pack system
  - starter pack, volatility pack, event pack, and macro pack
  - allow controlled import and comparison of feature packs without mixing unknown features into active models
- Arena upgrade
  - rank users on normalized out-of-sample performance, not raw activity
  - separate aggression from discipline with abstention and shadow metrics

### Why This Beats Orographic

Orographic can score and gate ideas, but Cumulonimbus can turn that logic into a teaching system with persistent identity, feedback loops, and user-specific growth paths.

### Success Metrics

- every paper trade shows explicit entry and exit review
- leaderboard includes no-trade and shadow-quality metrics
- users can compare at least two feature packs without touching production status
- Council-style rejections are visible in UI rather than hidden in logs

## Wave 3: League And Network Effects

Target window: days 61-90

### Outcome

Turn Cumulonimbus into a product that gets stronger when more skilled users join.

### Deliverables

- League rooms
  - private or public cohorts with shared watchlists and season resets
  - normalized starting capital and risk rules per season
- Mentor and rivalry loops
  - compare two users on the same snapshots
  - show disagreement maps: where one user traded, another abstained, and who was right
- Shared replay challenges
  - event-driven competitions built from the same point-in-time data
  - post-round breakdowns on process, not only returns
- Reputation system
  - badges for discipline, calibration, patience, and model stewardship
  - avoid rewarding only frequency or risk-taking
- Coaching summaries
  - weekly “what improved” and “what keeps hurting you” recaps for each user

### Why This Beats Orographic

Orographic is fundamentally an expert-operated system. Cumulonimbus can become a learning network where reputation, collaboration, and replay history compound into a durable moat.

### Success Metrics

- users can participate in a season without connecting a live broker
- leagues compare process quality as well as P&L
- disagreement and abstention analytics become a visible product feature
- retention depends on replay and coaching loops, not only market novelty

## Engineering Workstreams

These workstreams should run in parallel across the three waves:

- Data substrate
  - historical backfill jobs
  - richer event tagging
  - snapshot freshness and coverage diagnostics
- Model governance
  - model states, comparison views, promotion criteria, rollback paths
- Portfolio intelligence
  - Council rules, sizing, concentration, and exit review
- UX and explanation
  - dense cockpit surfaces
  - rationale cards and post-trade review flows
- Social systems
  - league schema, room state, invites, and season scoring

## Metrics That Matter

If we are serious about beating Orographic, we should track:

- time to first trainable model
- resolved decisions per active user
- no-trade win rate
- active model promotion frequency and rollback frequency
- shadow-to-active feature adoption rate
- paper-trade review completion rate
- weekly returning users who engage with replay, not just watchlists
- league participation and challenge completion

## Anti-Goals

We should explicitly avoid these traps:

- rebuilding a static scanner-first dashboard and calling it progress
- adding more features before model governance exists
- rewarding users for trade count rather than disciplined edge
- shipping fake AI commentary that does not map to actual decision inputs
- over-investing in decorative game surfaces before replay, coaching, and Council logic are strong

## Recommended Build Order

If scope gets tight, do the work in this order:

1. historical backfill
2. model registry and promotion gates
3. decision diagnostics and outcome review
4. Council layer and exit review
5. coaching engine
6. feature packs
7. league rooms and reputation systems

## Bottom Line

Orographic can remain the more research-heavy sibling for a while and that is fine.

Cumulonimbus wins by combining good research discipline with identity, memory, coaching, and multiplayer trust. If we execute this roadmap well, Orographic becomes a source of ideas, while Cumulonimbus becomes the place users actually want to return to.
