import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { loadTradierAccount } from "../../_lib/tradier.js";
import { backfillSeededReplayHistory } from "../../_lib/model_forge.js";
import { loadInitialBalance, loadResearchDashboard } from "../../_lib/research.js";
import { RESEARCH_WORKSPACE_DEMO } from "../../_lib/research_workspace.js";

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
  if (account) {
    return json(
      {
        ok: false,
        error: "Replay backfill is demo-only right now so it does not mix synthetic history into a live-linked account.",
      },
      409,
    );
  }

  const symbols = Array.isArray(body.symbols)
    ? body.symbols
    : body.symbol
      ? [body.symbol]
      : [];
  const result = await backfillSeededReplayHistory(context.env, auth.session.user.id, symbols);
  const focusSymbol =
    (Array.isArray(symbols) && symbols[0] ? String(symbols[0]) : String(body.symbol || "")).trim().toUpperCase() || "SPY";
  const dashboard = await loadResearchDashboard(context.env, auth.session.user.id, {
    mode: body.mode === "shadow" ? "shadow" : "paper",
    symbol: focusSymbol,
    initialBalance: await loadInitialBalance(context.env, auth.session.user.id),
    workspace: RESEARCH_WORKSPACE_DEMO,
  });

  return json({
    ok: true,
    connected: false,
    workspace: RESEARCH_WORKSPACE_DEMO,
    backfill: result,
    dashboard,
  });
}
