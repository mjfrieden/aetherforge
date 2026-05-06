import { requireSession } from "../../_lib/auth.js";
import { requireDb } from "../../_lib/db.js";
import { json, readJson } from "../../_lib/http.js";
import { parseStoredModel } from "../../_lib/model.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import {
  buildReplaySnapshot,
  computeReplayDecision,
  evaluateOpenResearch,
  loadInitialBalance,
  loadLatestModel,
  loadResearchDashboard,
  storeReplayDecision,
} from "../../_lib/research.js";
import { loadTradierAccount } from "../../_lib/tradier.js";
import { RESEARCH_WORKSPACE_LIVE } from "../../_lib/research_workspace.js";

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

  const account = await loadTradierAccount(context.env, auth.session.user.id);
  if (!account) {
    return json({ ok: false, error: "Connect Tradier before capturing replay scans." }, 409);
  }

  const mode = body.mode === "shadow" ? "shadow" : "paper";
  const snapshot = await buildReplaySnapshot(context.env, auth.session.user.id, account, body.symbol || "SPY", RESEARCH_WORKSPACE_LIVE);
  await evaluateOpenResearch(context.env, auth.session.user.id, snapshot, RESEARCH_WORKSPACE_LIVE);
  const model = await loadLatestModel(context.env, auth.session.user.id, RESEARCH_WORKSPACE_LIVE);
  const replayDecision = computeReplayDecision(snapshot, model);
  const decision = await storeReplayDecision(context.env, auth.session.user.id, mode, model, replayDecision, RESEARCH_WORKSPACE_LIVE);
  const candidateRow = await requireDb(context.env)
    .prepare(
      `SELECT *
       FROM models
       WHERE user_id = ?
         AND workspace = ?
         AND status = 'candidate'
       ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC
       LIMIT 1`,
    )
    .bind(auth.session.user.id, RESEARCH_WORKSPACE_LIVE)
    .first();
  const candidateModel = parseStoredModel(candidateRow);
  if (candidateModel) {
    const candidateDecision = computeReplayDecision(snapshot, candidateModel);
    await storeReplayDecision(
      context.env,
      auth.session.user.id,
      "shadow",
      candidateModel,
      candidateDecision,
      RESEARCH_WORKSPACE_LIVE,
      { autoShadowCandidate: true, suppressAudit: true },
    );
  }
  const dashboard = await loadResearchDashboard(context.env, auth.session.user.id, {
    mode,
    symbol: snapshot.symbol,
    initialBalance: await loadInitialBalance(context.env, auth.session.user.id),
    workspace: RESEARCH_WORKSPACE_LIVE,
  });

  return json({
    ok: true,
    connected: true,
    workspace: RESEARCH_WORKSPACE_LIVE,
    decision,
    dashboard,
  });
}
