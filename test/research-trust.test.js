import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { loadResearchDashboard } from "../functions/_lib/research.js";
import { listModelVersions } from "../functions/_lib/model_forge.js";
import { trainLogisticModel } from "../functions/_lib/model.js";
import { onRequestGet as leaderboardGet } from "../functions/api/leaderboard.js";

const replayRows = [
  { created_at: "2026-04-01T14:30:00.000Z", change_pct: 0.62, intraday_range: 0.15, atm_iv: -0.25, liquidity: 0.72, call_put_skew: 0.4, label: 1 },
  { created_at: "2026-04-02T14:30:00.000Z", change_pct: 0.55, intraday_range: 0.22, atm_iv: -0.18, liquidity: 0.66, call_put_skew: 0.28, label: 1 },
  { created_at: "2026-04-03T14:30:00.000Z", change_pct: -0.48, intraday_range: 0.4, atm_iv: 0.34, liquidity: 0.31, call_put_skew: -0.35, label: 0 },
  { created_at: "2026-04-04T14:30:00.000Z", change_pct: -0.52, intraday_range: 0.38, atm_iv: 0.28, liquidity: 0.42, call_put_skew: -0.29, label: 0 },
  { created_at: "2026-04-05T14:30:00.000Z", change_pct: 0.41, intraday_range: 0.09, atm_iv: -0.31, liquidity: 0.68, call_put_skew: 0.22, label: 1 },
  { created_at: "2026-04-08T14:30:00.000Z", change_pct: -0.37, intraday_range: 0.33, atm_iv: 0.21, liquidity: 0.27, call_put_skew: -0.18, label: 0 },
  { created_at: "2026-04-09T14:30:00.000Z", change_pct: 0.35, intraday_range: 0.18, atm_iv: -0.14, liquidity: 0.54, call_put_skew: 0.17, label: 1 },
  { created_at: "2026-04-10T14:30:00.000Z", change_pct: -0.33, intraday_range: 0.29, atm_iv: 0.16, liquidity: 0.36, call_put_skew: -0.12, label: 0 },
];

class D1StatementShim {
  constructor(statement) {
    this.statement = statement;
    this.args = [];
  }

  bind(...args) {
    this.args = args;
    return this;
  }

  async all() {
    return { results: this.statement.all(...this.args) };
  }

  async first() {
    if (typeof this.statement.get === "function") {
      return this.statement.get(...this.args) || null;
    }
    return this.statement.all(...this.args)[0] || null;
  }

  async run() {
    return this.statement.run(...this.args);
  }
}

class D1DatabaseShim {
  constructor(database) {
    this.database = database;
  }

  prepare(sql) {
    return new D1StatementShim(this.database.prepare(sql));
  }

  exec(sql) {
    return this.database.exec(sql);
  }
}

function createEnv() {
  const sqlite = new DatabaseSync(":memory:");
  const db = new D1DatabaseShim(sqlite);
  for (const file of [
    "0001_init.sql",
    "0002_research.sql",
    "0003_model_forge.sql",
    "0004_model_registry.sql",
    "0005_research_workspaces.sql",
  ]) {
    db.exec(readFileSync(new URL(`../migrations/${file}`, import.meta.url), "utf8"));
  }
  return { DB: db };
}

async function insertUser(env, { id, email, displayName }) {
  await env.DB.prepare(
    "INSERT INTO users (id, email, display_name, password_salt, password_hash, password_iterations, created_at) VALUES (?, ?, ?, 'salt', 'hash', 1, '2026-05-01T00:00:00.000Z')",
  )
    .bind(id, email, displayName)
    .run();
}

function trainedModelPayload() {
  const trained = trainLogisticModel(replayRows);
  return {
    kind: trained.kind,
    weights: JSON.stringify({ ...trained.weights, bias: trained.bias }),
    metrics: JSON.stringify(trained.metrics),
    features: JSON.stringify(trained.features),
    trainingRows: trained.metrics.training_rows,
  };
}

async function insertModel(env, { id, userId, workspace, status, createdAt, comparison = {} }) {
  const payload = trainedModelPayload();
  await env.DB.prepare(
    `INSERT INTO models
      (id, user_id, workspace, name, kind, weights_json, metrics_json, features_json, training_rows, status, promoted_from_model_id, promotion_reason, comparison_json, activated_at, archived_at, created_at, updated_at)
     VALUES (?, ?, ?, 'Replay Model', ?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL, ?, ?)`,
  )
    .bind(
      id,
      userId,
      workspace,
      payload.kind,
      payload.weights,
      payload.metrics,
      payload.features,
      payload.trainingRows,
      status,
      JSON.stringify(comparison),
      status === "active" ? createdAt : null,
      createdAt,
      createdAt,
    )
    .run();
}

async function insertSnapshot(env, { id, userId, workspace, symbol, snapshotAt, price }) {
  const quote = {
    symbol,
    price,
    bid: price - 0.05,
    ask: price + 0.05,
    open: price - 1,
    high: price + 2,
    low: price - 2,
    prevclose: price - 0.5,
    volume: 1000000,
    averageVolume: 1100000,
    changePercent: 0.6,
    sector: "ETF",
    snapshotAt,
  };
  const features = {
    change_pct: 0.2,
    intraday_range: 0.1,
    atm_iv: -0.1,
    liquidity: 0.5,
    call_put_skew: 0.08,
  };
  await env.DB.prepare(
    "INSERT INTO research_snapshots (id, user_id, workspace, symbol, expiration_date, snapshot_at, quote_json, feature_json, created_at) VALUES (?, ?, ?, ?, '2026-05-16', ?, ?, ?, ?)",
  )
    .bind(id, userId, workspace, symbol, snapshotAt, JSON.stringify(quote), JSON.stringify(features), snapshotAt)
    .run();
  await env.DB.prepare(
    "INSERT INTO research_option_quotes (id, snapshot_id, option_symbol, contract_type, strike, expiration_date, bid, ask, last, mark, volume, open_interest, implied_volatility, delta, gamma, theta, vega, created_at) VALUES (?, ?, ?, 'call', ?, '2026-05-16', 1.1, 1.3, 1.2, 1.2, 100, 250, 0.22, 0.5, 0.1, -0.05, 0.08, ?)",
  )
    .bind(`${id}-call`, id, `${symbol}CALL`, price + 5, snapshotAt)
    .run();
  await env.DB.prepare(
    "INSERT INTO research_option_quotes (id, snapshot_id, option_symbol, contract_type, strike, expiration_date, bid, ask, last, mark, volume, open_interest, implied_volatility, delta, gamma, theta, vega, created_at) VALUES (?, ?, ?, 'put', ?, '2026-05-16', 1.0, 1.2, 1.1, 1.1, 90, 220, 0.24, -0.5, 0.1, -0.05, 0.08, ?)",
  )
    .bind(`${id}-put`, id, `${symbol}PUT`, price - 5, snapshotAt)
    .run();
}

async function insertDecisionOutcome(env, input) {
  const selectedSymbol = input.decision === "put" ? `${input.symbol}PUT` : input.decision === "call" ? `${input.symbol}CALL` : null;
  const rationale = {
    engine: "replay_model",
    ...(input.autoShadowCandidate ? { auto_shadow_candidate: true } : {}),
  };
  await env.DB.prepare(
    `INSERT INTO research_decisions
      (id, user_id, workspace, snapshot_id, model_id, mode, symbol, decision, probability, score, selected_option_symbol, selected_contract_type, selected_entry_mark, call_option_symbol, call_entry_mark, put_option_symbol, put_entry_mark, underlying_entry_price, features_json, rationale_json, created_at, resolved_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      input.id,
      input.userId,
      input.workspace,
      input.snapshotId,
      input.modelId || null,
      input.mode || "paper",
      input.symbol,
      input.decision,
      input.probability ?? 0.64,
      input.score ?? 0.72,
      selectedSymbol,
      input.decision === "no_trade" ? null : input.decision,
      input.decision === "no_trade" ? null : 1.2,
      `${input.symbol}CALL`,
      1.2,
      `${input.symbol}PUT`,
      1.1,
      input.underlyingPrice ?? 500,
      JSON.stringify({
        change_pct: 0.2,
        intraday_range: 0.1,
        atm_iv: -0.1,
        liquidity: 0.5,
        call_put_skew: 0.08,
      }),
      JSON.stringify(rationale),
      input.createdAt,
      input.resolvedAt || input.createdAt,
    )
    .run();
  await env.DB.prepare(
    `INSERT INTO research_outcomes
      (id, decision_id, user_id, workspace, entry_snapshot_id, exit_snapshot_id, outcome_label, selected_return, call_return, put_return, underlying_return, score, horizon_minutes, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 60, ?)`,
  )
    .bind(
      `${input.id}-outcome`,
      input.id,
      input.userId,
      input.workspace,
      input.snapshotId,
      input.snapshotId,
      input.outcomeLabel,
      input.outcomeLabel === "no_trade_win" ? null : 0.12,
      input.outcomeLabel === "call_win" ? 0.12 : -0.05,
      input.outcomeLabel === "put_win" ? 0.11 : -0.03,
      0.01,
      input.outcomeScore ?? 0.8,
      input.resolvedAt || input.createdAt,
    )
    .run();
}

test("loadResearchDashboard isolates demo and live workspaces", async () => {
  const env = createEnv();
  await insertUser(env, { id: "user-1", email: "one@example.com", displayName: "Trader One" });
  await insertModel(env, { id: "demo-model", userId: "user-1", workspace: "demo", status: "active", createdAt: "2026-05-01T09:00:00.000Z" });
  await insertModel(env, { id: "live-model", userId: "user-1", workspace: "live", status: "active", createdAt: "2026-05-02T09:00:00.000Z" });
  await insertSnapshot(env, { id: "demo-snap", userId: "user-1", workspace: "demo", symbol: "SPY", snapshotAt: "2026-05-03T14:30:00.000Z", price: 501 });
  await insertSnapshot(env, { id: "live-snap", userId: "user-1", workspace: "live", symbol: "SPY", snapshotAt: "2026-05-03T15:30:00.000Z", price: 601 });
  await insertDecisionOutcome(env, {
    id: "demo-decision",
    userId: "user-1",
    workspace: "demo",
    snapshotId: "demo-snap",
    modelId: "demo-model",
    symbol: "SPY",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.91,
    createdAt: "2026-05-03T14:31:00.000Z",
  });
  await insertDecisionOutcome(env, {
    id: "live-decision",
    userId: "user-1",
    workspace: "live",
    snapshotId: "live-snap",
    modelId: "live-model",
    symbol: "SPY",
    decision: "put",
    outcomeLabel: "put_win",
    outcomeScore: 0.62,
    createdAt: "2026-05-03T15:31:00.000Z",
  });

  const demoDashboard = await loadResearchDashboard(env, "user-1", { workspace: "demo", symbol: "SPY" });
  const liveDashboard = await loadResearchDashboard(env, "user-1", { workspace: "live", symbol: "SPY" });

  assert.equal(demoDashboard.workspace, "demo");
  assert.equal(demoDashboard.watchlist.length, 1);
  assert.equal(demoDashboard.watchlist[0].price, 501);
  assert.equal(demoDashboard.summary.decisionCount, 1);
  assert.equal(demoDashboard.model?.workspace, "demo");

  assert.equal(liveDashboard.workspace, "live");
  assert.equal(liveDashboard.watchlist.length, 1);
  assert.equal(liveDashboard.watchlist[0].price, 601);
  assert.equal(liveDashboard.summary.decisionCount, 1);
  assert.equal(liveDashboard.model?.workspace, "live");
});

test("candidate promotion waits for enough future shadow pairs and ignores hidden shadow rows in visible stats", async () => {
  const env = createEnv();
  await insertUser(env, { id: "user-1", email: "one@example.com", displayName: "Trader One" });
  await insertModel(env, { id: "active-model", userId: "user-1", workspace: "live", status: "active", createdAt: "2026-05-01T09:00:00.000Z" });
  await insertModel(env, {
    id: "candidate-model",
    userId: "user-1",
    workspace: "live",
    status: "candidate",
    createdAt: "2026-05-02T09:00:00.000Z",
    comparison: {
      activeAccuracy: 0.55,
      candidateAccuracy: 0.65,
      activeBrier: 0.24,
      candidateBrier: 0.2,
      evaluatedRows: 2,
      holdoutWindow: {
        starts_at: "2026-04-09T14:30:00.000Z",
        ends_at: "2026-04-10T14:30:00.000Z",
      },
    },
  });
  await insertSnapshot(env, { id: "snap-1", userId: "user-1", workspace: "live", symbol: "SPY", snapshotAt: "2026-05-03T10:00:00.000Z", price: 500 });
  await insertSnapshot(env, { id: "snap-2", userId: "user-1", workspace: "live", symbol: "QQQ", snapshotAt: "2026-05-03T11:00:00.000Z", price: 400 });
  await insertSnapshot(env, { id: "snap-3", userId: "user-1", workspace: "live", symbol: "NVDA", snapshotAt: "2026-05-03T12:00:00.000Z", price: 900 });

  await insertDecisionOutcome(env, {
    id: "active-1",
    userId: "user-1",
    workspace: "live",
    snapshotId: "snap-1",
    modelId: "active-model",
    symbol: "SPY",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.61,
    createdAt: "2026-05-03T10:01:00.000Z",
  });
  await insertDecisionOutcome(env, {
    id: "candidate-1",
    userId: "user-1",
    workspace: "live",
    snapshotId: "snap-1",
    modelId: "candidate-model",
    symbol: "SPY",
    mode: "shadow",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.73,
    createdAt: "2026-05-03T10:01:30.000Z",
    autoShadowCandidate: true,
  });
  await insertDecisionOutcome(env, {
    id: "active-2",
    userId: "user-1",
    workspace: "live",
    snapshotId: "snap-2",
    modelId: "active-model",
    symbol: "QQQ",
    decision: "put",
    outcomeLabel: "put_win",
    outcomeScore: 0.58,
    createdAt: "2026-05-03T11:01:00.000Z",
  });
  await insertDecisionOutcome(env, {
    id: "candidate-2",
    userId: "user-1",
    workspace: "live",
    snapshotId: "snap-2",
    modelId: "candidate-model",
    symbol: "QQQ",
    mode: "shadow",
    decision: "put",
    outcomeLabel: "put_win",
    outcomeScore: 0.7,
    createdAt: "2026-05-03T11:01:30.000Z",
    autoShadowCandidate: true,
  });

  let versions = await listModelVersions(env, "user-1", 8, "live");
  let candidate = versions.find((version) => version.id === "candidate-model");
  assert.equal(candidate?.canPromote, false);
  assert.equal(candidate?.comparison?.shadowEvaluation?.evaluatedPairs, 2);

  const liveDashboard = await loadResearchDashboard(env, "user-1", { workspace: "live", symbol: "SPY" });
  assert.equal(liveDashboard.summary.decisionCount, 2);
  assert.equal(liveDashboard.recentReviews.length, 1);
  assert.equal(liveDashboard.latestDecision?.id, "active-1");

  await insertDecisionOutcome(env, {
    id: "active-3",
    userId: "user-1",
    workspace: "live",
    snapshotId: "snap-3",
    modelId: "active-model",
    symbol: "NVDA",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.56,
    createdAt: "2026-05-03T12:01:00.000Z",
  });
  await insertDecisionOutcome(env, {
    id: "candidate-3",
    userId: "user-1",
    workspace: "live",
    snapshotId: "snap-3",
    modelId: "candidate-model",
    symbol: "NVDA",
    mode: "shadow",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.71,
    createdAt: "2026-05-03T12:01:30.000Z",
    autoShadowCandidate: true,
  });

  versions = await listModelVersions(env, "user-1", 8, "live");
  candidate = versions.find((version) => version.id === "candidate-model");
  assert.equal(candidate?.canPromote, true);
  assert.equal(candidate?.comparison?.shadowEvaluation?.evaluatedPairs, 3);
  assert.equal(candidate?.comparison?.promotionGate?.minimumShadowPairs, 3);
});

test("leaderboard excludes demo rows and hidden auto-shadow candidate outcomes", async () => {
  const env = createEnv();
  await insertUser(env, { id: "user-1", email: "one@example.com", displayName: "Trader One" });
  await insertUser(env, { id: "user-2", email: "two@example.com", displayName: "Trader Two" });
  await insertModel(env, { id: "live-model-1", userId: "user-1", workspace: "live", status: "active", createdAt: "2026-05-01T09:00:00.000Z" });
  await insertModel(env, { id: "demo-model-1", userId: "user-1", workspace: "demo", status: "active", createdAt: "2026-05-01T09:00:00.000Z" });
  await insertModel(env, { id: "live-model-2", userId: "user-2", workspace: "live", status: "active", createdAt: "2026-05-01T09:00:00.000Z" });
  await insertSnapshot(env, { id: "u1-live", userId: "user-1", workspace: "live", symbol: "SPY", snapshotAt: "2026-05-03T10:00:00.000Z", price: 500 });
  await insertSnapshot(env, { id: "u1-demo", userId: "user-1", workspace: "demo", symbol: "SPY", snapshotAt: "2026-05-03T09:00:00.000Z", price: 480 });
  await insertSnapshot(env, { id: "u2-live", userId: "user-2", workspace: "live", symbol: "QQQ", snapshotAt: "2026-05-03T11:00:00.000Z", price: 400 });

  await insertDecisionOutcome(env, {
    id: "u1-live-decision",
    userId: "user-1",
    workspace: "live",
    snapshotId: "u1-live",
    modelId: "live-model-1",
    symbol: "SPY",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.6,
    createdAt: "2026-05-03T10:01:00.000Z",
  });
  await insertDecisionOutcome(env, {
    id: "u1-demo-decision",
    userId: "user-1",
    workspace: "demo",
    snapshotId: "u1-demo",
    modelId: "demo-model-1",
    symbol: "SPY",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.99,
    createdAt: "2026-05-03T09:01:00.000Z",
  });
  await insertDecisionOutcome(env, {
    id: "u1-hidden-shadow",
    userId: "user-1",
    workspace: "live",
    snapshotId: "u1-live",
    modelId: "live-model-1",
    symbol: "SPY",
    mode: "shadow",
    decision: "call",
    outcomeLabel: "call_win",
    outcomeScore: 0.98,
    createdAt: "2026-05-03T10:01:30.000Z",
    autoShadowCandidate: true,
  });
  await insertDecisionOutcome(env, {
    id: "u2-live-decision",
    userId: "user-2",
    workspace: "live",
    snapshotId: "u2-live",
    modelId: "live-model-2",
    symbol: "QQQ",
    decision: "put",
    outcomeLabel: "put_win",
    outcomeScore: 0.72,
    createdAt: "2026-05-03T11:01:00.000Z",
  });

  const response = await leaderboardGet({ env });
  const payload = await response.json();
  assert.equal(payload.ok, true);
  assert.equal(payload.leaders.length, 2);
  assert.equal(payload.leaders[0].display_name, "Trader Two");
  const traderOne = payload.leaders.find((leader) => leader.display_name === "Trader One");
  assert.equal(traderOne.avg_score, 0.6);
  assert.equal(traderOne.evaluated_decisions, 1);
});
