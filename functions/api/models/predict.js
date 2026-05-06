import { requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { parseStoredModel, predictWithWeights } from "../../_lib/model.js";
import { resolveResearchWorkspace } from "../../_lib/research_workspace.js";

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
  const workspace = await resolveResearchWorkspace(context.env, auth.session.user.id);
  const row = await requireDb(context.env)
    .prepare(
      `SELECT *
       FROM models
       WHERE user_id = ?
         AND workspace = ?
       ORDER BY
         CASE WHEN status = 'active' THEN 0 ELSE 1 END,
         datetime(activated_at) DESC,
         datetime(updated_at) DESC
       LIMIT 1`,
    )
    .bind(auth.session.user.id, workspace)
    .first();
  if (!row) {
    return json({ ok: false, error: "Train a Cumulonimbus replay model before requesting predictions." }, 409);
  }
  const model = parseStoredModel(row);
  const prediction = predictWithWeights(model, body.features || {}, model.features);
  return json({
    ok: true,
    symbol: String(body.symbol || "SPY").toUpperCase().slice(0, 12),
    prediction,
    model: {
      id: row.id,
      name: row.name,
      workspace: row.workspace || workspace,
      updated_at: row.updated_at,
    },
  });
}
