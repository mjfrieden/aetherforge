import { randomBase64Url } from "../../_lib/encoding.js";
import { audit, requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, nowIso, readJson } from "../../_lib/http.js";
import { buildPromotionComparison, splitChronologicalHoldout, summarizeShadowPromotionPairs } from "../../_lib/model_governance.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { parseStoredModel, scoreStoredModel, trainLogisticModel } from "../../_lib/model.js";
import { researchFeatureKeys } from "../../_lib/research.js";
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
  const featureKeys = researchFeatureKeys(body.feature_keys);
  const db = requireDb(context.env);
  const workspace = await resolveResearchWorkspace(context.env, auth.session.user.id);
  const rows = await requireDb(context.env)
    .prepare(
      `SELECT rd.features_json, ro.outcome_label, ro.created_at
       FROM research_outcomes ro
       JOIN research_decisions rd ON rd.id = ro.decision_id
       WHERE ro.user_id = ?
         AND ro.workspace = ?
         AND COALESCE(json_extract(rd.rationale_json, '$.auto_shadow_candidate'), 0) = 0
         AND ro.outcome_label IN ('call_win', 'put_win')
       ORDER BY ro.created_at ASC
       LIMIT 500`,
    )
    .bind(auth.session.user.id, workspace)
    .all();
  const samples = (rows.results || []).map((row) => {
    const features = JSON.parse(row.features_json);
    return {
      ...features,
      created_at: row.created_at,
      label: row.outcome_label === "call_win" ? 1 : 0,
    };
  });
  const activeRow = await db
    .prepare(
      `SELECT *
       FROM models
       WHERE user_id = ? AND workspace = ? AND status = 'active'
       ORDER BY datetime(activated_at) DESC, datetime(updated_at) DESC
       LIMIT 1`,
    )
    .bind(auth.session.user.id, workspace)
    .first();
  const activeModel = parseStoredModel(activeRow);
  const { trainRows, holdoutRows, holdoutWindow } = splitChronologicalHoldout(samples);
  if (activeModel && holdoutRows.length < 1) {
    return json(
      { ok: false, error: "Collect at least 9 resolved replay outcomes before comparing a new candidate against the active model." },
      409,
    );
  }
  let model;
  try {
    model = trainLogisticModel(activeModel ? trainRows : samples, { featureKeys });
  } catch (error) {
    return json({ ok: false, error: error.message }, 409);
  }
  const candidateScore = activeModel ? scoreStoredModel({ ...model, id: "candidate" }, holdoutRows) : { accuracy: null, brier: null, rows: 0 };
  const activeScore = activeModel ? scoreStoredModel(activeModel, holdoutRows) : { accuracy: null, brier: null, rows: 0 };
  const comparison = buildPromotionComparison(
    activeModel,
    model,
    activeScore,
    candidateScore,
    holdoutWindow,
    summarizeShadowPromotionPairs([]),
  );
  const now = nowIso();
  const id = randomBase64Url(18);
  const name = String(body.name || "Cumulonimbus Replay Model").slice(0, 80);
  if (activeModel) {
    await db
      .prepare("UPDATE models SET status = 'archived', archived_at = COALESCE(archived_at, ?) WHERE user_id = ? AND workspace = ? AND status = 'candidate'")
      .bind(now, auth.session.user.id, workspace)
      .run();
  }
  const status = activeModel ? "candidate" : "active";
  await db
    .prepare(
      `INSERT INTO models
        (id, user_id, workspace, name, kind, weights_json, metrics_json, features_json, training_rows, status, promoted_from_model_id, promotion_reason, comparison_json, activated_at, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      id,
      auth.session.user.id,
      workspace,
      name,
      model.kind,
      JSON.stringify({ ...model.weights, bias: model.bias }),
      JSON.stringify(model.metrics),
      JSON.stringify(model.features),
      model.metrics.training_rows,
      status,
      activeModel?.id || null,
      activeModel ? null : "Initial model activation",
      JSON.stringify(comparison),
      status === "active" ? now : null,
      now,
      now,
    )
    .run();
  await audit(context.env, auth.session.user.id, "model.trained", {
    model_id: id,
    rows: model.metrics.training_rows,
    validation: model.metrics.validation,
    holdout_rows: holdoutRows.length,
    status,
    compared_to_model_id: activeModel?.id || null,
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
      status,
      promoted_from_model_id: activeModel?.id || null,
      comparison,
      created_at: now,
      updated_at: now,
    },
  });
}
