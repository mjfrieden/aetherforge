import { requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { predictWithWeights } from "../../_lib/model.js";

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
  const row = await requireDb(context.env)
    .prepare("SELECT * FROM models WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
    .bind(auth.session.user.id)
    .first();
  if (!row) {
    return json({ ok: false, error: "Train an oracle model before requesting predictions." }, 409);
  }
  const weights = JSON.parse(row.weights_json);
  const bias = Number(weights.bias || 0);
  delete weights.bias;
  const prediction = predictWithWeights({ weights, bias }, body.features || {});
  return json({
    ok: true,
    symbol: String(body.symbol || "SPY").toUpperCase().slice(0, 12),
    prediction,
    model: {
      id: row.id,
      name: row.name,
      updated_at: row.updated_at,
    },
  });
}
