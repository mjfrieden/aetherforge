import { randomBase64Url } from "../../_lib/encoding.js";
import { audit, requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, nowIso, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { trainLogisticModel } from "../../_lib/model.js";
import { researchFeatureKeys } from "../../_lib/research.js";

export async function onRequestPost(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  const csrf = await requireSameOriginAndCsrf(context, auth.session);
  if (csrf) {
    return csrf;
  }
  let body;
  try {
    body = await readJson(context.request);
  } catch (error) {
    return json({ ok: false, error: error.message }, 400);
  }
  const featureKeys = researchFeatureKeys(body.feature_keys);
  const rows = await requireDb(context.env)
    .prepare(
      `SELECT rd.features_json, ro.outcome_label, ro.created_at
       FROM research_outcomes ro
       JOIN research_decisions rd ON rd.id = ro.decision_id
       WHERE ro.user_id = ?
         AND ro.outcome_label IN ('call_win', 'put_win')
       ORDER BY ro.created_at ASC
       LIMIT 500`,
    )
    .bind(auth.session.user.id)
    .all();
  const samples = (rows.results || []).map((row) => {
    const features = JSON.parse(row.features_json);
    return {
      ...features,
      created_at: row.created_at,
      label: row.outcome_label === "call_win" ? 1 : 0,
    };
  });
  let model;
  try {
    model = trainLogisticModel(samples, { featureKeys });
  } catch (error) {
    return json({ ok: false, error: error.message }, 409);
  }
  const now = nowIso();
  const id = randomBase64Url(18);
  const name = String(body.name || "Cumulonimbus Replay Model").slice(0, 80);
  await requireDb(context.env)
    .prepare(
      "INSERT INTO models (id, user_id, name, kind, weights_json, metrics_json, features_json, training_rows, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      auth.session.user.id,
      name,
      model.kind,
      JSON.stringify({ ...model.weights, bias: model.bias }),
      JSON.stringify(model.metrics),
      JSON.stringify(model.features),
      model.metrics.training_rows,
      now,
      now,
    )
    .run();
  await audit(context.env, auth.session.user.id, "model.trained", {
    model_id: id,
    rows: model.metrics.training_rows,
    validation: model.metrics.validation,
  });
  return json({
    ok: true,
    model: {
      id,
      name,
      kind: model.kind,
      weights: { ...model.weights, bias: model.bias },
      features: model.features,
      metrics: model.metrics,
      training_rows: model.metrics.training_rows,
      created_at: now,
      updated_at: now,
    },
  });
}
