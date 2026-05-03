import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
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
  const snapshot = await buildReplaySnapshot(context.env, auth.session.user.id, account, body.symbol || "SPY");
  await evaluateOpenResearch(context.env, auth.session.user.id, snapshot);
  const model = await loadLatestModel(context.env, auth.session.user.id);
  const replayDecision = computeReplayDecision(snapshot, model);
  const decision = await storeReplayDecision(context.env, auth.session.user.id, mode, model, replayDecision);
  const dashboard = await loadResearchDashboard(context.env, auth.session.user.id, {
    mode,
    symbol: snapshot.symbol,
    initialBalance: await loadInitialBalance(context.env, auth.session.user.id),
  });

  return json({
    ok: true,
    connected: true,
    decision,
    dashboard,
  });
}
