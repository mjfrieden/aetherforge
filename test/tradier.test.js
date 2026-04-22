import test from "node:test";
import assert from "node:assert/strict";
import { isOccOptionSymbol, validateOrderInput } from "../functions/_lib/tradier.js";

test("OCC symbol validation accepts compact option symbols", () => {
  assert.equal(isOccOptionSymbol("SPY260515C00500000"), true);
  assert.equal(isOccOptionSymbol("SPY"), false);
});

test("order validation caps risky inputs", () => {
  const env = { MAX_ORDER_QUANTITY: "3", MAX_NOTIONAL_USD: "500" };
  const result = validateOrderInput(
    {
      asset_class: "equity",
      symbol: "SPY",
      side: "buy",
      quantity: 4,
      type: "limit",
      limit_price: 100,
    },
    env,
    { placement: true },
  );
  assert.equal(result.ok, false);
  assert.match(result.error, /Quantity/);
});
