import test from "node:test";
import assert from "node:assert/strict";
import { predictWithWeights, trainLogisticModel } from "../functions/_lib/model.js";

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

test("trainLogisticModel returns walk-forward metrics", () => {
  const model = trainLogisticModel(replayRows, {
    featureKeys: ["change_pct", "intraday_range", "atm_iv", "liquidity", "call_put_skew"],
  });
  assert.equal(model.kind, "cumulonimbus_replay_logistic_v2");
  assert.equal(model.metrics.validation, "walk_forward");
  assert.ok(model.metrics.training_rows >= 8);
  assert.ok(model.metrics.evaluation_rows >= 1);
  assert.ok(model.metrics.accuracy >= 0);
  assert.ok(model.metrics.accuracy <= 1);
  assert.ok(model.metrics.brier >= 0);
  assert.ok(model.metrics.brier <= 1);
});

test("predictWithWeights classifies bounded replay probabilities", () => {
  const model = trainLogisticModel(replayRows);
  const prediction = predictWithWeights(model, {
    change_pct: 0.58,
    intraday_range: 0.1,
    atm_iv: -0.2,
    liquidity: 0.71,
    call_put_skew: 0.33,
  });
  assert.ok(prediction.probability >= 0);
  assert.ok(prediction.probability <= 1);
  assert.ok(["call_edge", "put_edge", "no_trade"].includes(prediction.class));
});
