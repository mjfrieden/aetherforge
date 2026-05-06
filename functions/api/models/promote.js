import { audit, requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, nowIso, readJson } from "../../_lib/http.js";
import { buildPromotionComparison, loadShadowPromotionPairs, summarizeShadowPromotionPairs } from "../../_lib/model_governance.js";
import { parseStoredModel } from "../../_lib/model.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
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

  const modelId = String(body.model_id || "");
  if (!modelId) {
    return json({ ok: false, error: "model_id is required." }, 400);
  }
  const workspace = await resolveResearchWorkspace(context.env, auth.session.user.id);

  const db = requireDb(context.env);
  const candidate = await db
    .prepare("SELECT * FROM models WHERE id = ? AND user_id = ? AND workspace = ? LIMIT 1")
    .bind(modelId, auth.session.user.id, workspace)
    .first();
  if (!candidate) {
    return json({ ok: false, error: "Model not found." }, 404);
  }
  if ((candidate.status || "active") !== "candidate") {
    return json({ ok: false, error: "Only candidate models can be promoted." }, 409);
  }
  const active = await db
    .prepare("SELECT * FROM models WHERE user_id = ? AND workspace = ? AND status = 'active' LIMIT 1")
    .bind(auth.session.user.id, workspace)
    .first();
  const parsedCandidate = parseStoredModel(candidate);
  const parsedActive = parseStoredModel(active);
  const baseComparison = JSON.parse(candidate.comparison_json || "{}");
  const shadowPairs = await loadShadowPromotionPairs(db, auth.session.user.id, workspace, candidate, active);
  const comparison = buildPromotionComparison(
    parsedActive,
    parsedCandidate,
    {
      accuracy: baseComparison.activeAccuracy ?? null,
      brier: baseComparison.activeBrier ?? null,
      rows: baseComparison.evaluatedRows ?? 0,
    },
    {
      accuracy: baseComparison.candidateAccuracy ?? null,
      brier: baseComparison.candidateBrier ?? null,
      rows: baseComparison.evaluatedRows ?? 0,
    },
    baseComparison.holdoutWindow || { starts_at: null, ends_at: null },
    summarizeShadowPromotionPairs(shadowPairs),
  );
  if (comparison?.promotionGate?.passed === false) {
    return json({ ok: false, error: comparison.summary || "This candidate has not passed its promotion gate yet." }, 409);
  }

  const now = nowIso();
  const reason = String(body.reason || "Promoted from the Improve workspace after comparison review.").slice(0, 240);
  await db
    .prepare("UPDATE models SET status = 'archived', archived_at = COALESCE(archived_at, ?) WHERE user_id = ? AND workspace = ? AND status = 'active'")
    .bind(now, auth.session.user.id, workspace)
    .run();
  await db
    .prepare("UPDATE models SET status = 'active', activated_at = ?, archived_at = NULL, promotion_reason = ? WHERE id = ? AND user_id = ? AND workspace = ?")
    .bind(now, reason, modelId, auth.session.user.id, workspace)
    .run();

  await audit(context.env, auth.session.user.id, "model.promoted", {
    model_id: modelId,
    reason,
  });
  return json({ ok: true, promoted_model_id: modelId, promoted_at: now, reason, workspace });
}
