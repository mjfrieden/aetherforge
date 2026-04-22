import { randomBase64Url } from "../../_lib/encoding.js";
import { audit, requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, nowIso, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { trainLogisticModel } from "../../_lib/model.js";

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
  const samples = Array.isArray(body.samples) ? body.samples.slice(-200) : [];
  const model = trainLogisticModel(samples);
  const now = nowIso();
  const id = randomBase64Url(18);
  const name = String(body.name || "Cloud Oracle").slice(0, 80);
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
