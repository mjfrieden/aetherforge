import test from "node:test";
import assert from "node:assert/strict";
import { defaultSamples, predictWithWeights, trainLogisticModel } from "../functions/_lib/model.js";

test("trainLogisticModel returns bounded predictions", () => {
  const model = trainLogisticModel(defaultSamples());
  const prediction = predictWithWeights(model, {
    momentum: 0.8,
    volatility: -0.3,
    sentiment: 0.5,
    liquidity: 0.9,
    iv_rank: -0.4,
  });
  assert.equal(model.kind, "logistic_edge_v1");
  assert.ok(prediction.probability >= 0);
  assert.ok(prediction.probability <= 1);
  assert.ok(["call_edge", "put_hedge", "no_trade"].includes(prediction.class));
});
