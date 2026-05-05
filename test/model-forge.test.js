import test from "node:test";
import assert from "node:assert/strict";
import { buildVersionTimeline, systemFeatureManifestTemplates } from "../functions/_lib/model_forge.js";

test("buildVersionTimeline assigns descending versions and current marker", () => {
  const rows = [
    {
      id: "m1",
      name: "Model",
      kind: "demo",
      weights_json: JSON.stringify({ change_pct: 0.2, bias: 0.1 }),
      metrics_json: JSON.stringify({ accuracy: 0.61, brier: 0.22, training_rows: 8 }),
      features_json: JSON.stringify(["change_pct"]),
      training_rows: 8,
      created_at: "2026-04-20T10:00:00.000Z",
      updated_at: "2026-04-20T10:00:00.000Z",
    },
    {
      id: "m2",
      name: "Model",
      kind: "demo",
      weights_json: JSON.stringify({ change_pct: 0.3, liquidity: 0.1, bias: 0.12 }),
      metrics_json: JSON.stringify({ accuracy: 0.67, brier: 0.18, training_rows: 12 }),
      features_json: JSON.stringify(["change_pct", "liquidity"]),
      training_rows: 12,
      created_at: "2026-04-25T10:00:00.000Z",
      updated_at: "2026-04-25T10:00:00.000Z",
    },
  ];

  const versions = buildVersionTimeline(rows);
  assert.equal(versions.length, 2);
  assert.equal(versions[0].version, "v2");
  assert.equal(versions[0].isCurrent, true);
  assert.equal(versions[1].version, "v1");
  assert.equal(versions[1].isCurrent, false);
});

test("systemFeatureManifestTemplates exposes starter packs", () => {
  const templates = systemFeatureManifestTemplates();
  assert.ok(templates.length >= 3);
  assert.equal(templates[0].slug, "core-default-pack");
  assert.ok(Array.isArray(templates[0].featureKeys));
  assert.ok(templates[0].featureKeys.includes("change_pct"));
});
