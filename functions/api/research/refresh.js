import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { DEFAULT_WATCHLIST, buildReplaySnapshot, evaluateOpenResearch, loadInitialBalance, loadResearchDashboard } from "../../_lib/research.js";
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
    return json({ ok: false, error: "Connect Tradier before refreshing the live replay workspace." }, 409);
  }

  const requestedSymbols = Array.isArray(body.symbols)
    ? body.symbols
    : body.symbol
      ? [body.symbol]
      : DEFAULT_WATCHLIST;
  const symbols = requestedSymbols
    .map((symbol) => String(symbol || "").trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 5);

  let refreshed = 0;
  for (const symbol of symbols.length ? symbols : DEFAULT_WATCHLIST) {
    try {
      const snapshot = await buildReplaySnapshot(
        context.env,
        auth.session.user.id,
        account,
        symbol,
        RESEARCH_WORKSPACE_LIVE,
      );
      await evaluateOpenResearch(context.env, auth.session.user.id, snapshot, RESEARCH_WORKSPACE_LIVE);
      refreshed += 1;
    } catch {
      // Keep the explicit refresh usable even if one symbol fails.
    }
  }

  const focusSymbol = String(body.symbol || symbols[0] || DEFAULT_WATCHLIST[0]).trim().toUpperCase();
  const dashboard = await loadResearchDashboard(context.env, auth.session.user.id, {
    mode: body.mode === "shadow" ? "shadow" : "paper",
    symbol: focusSymbol,
    initialBalance: await loadInitialBalance(context.env, auth.session.user.id),
    workspace: RESEARCH_WORKSPACE_LIVE,
  });

  return json({
    ok: true,
    connected: true,
    workspace: RESEARCH_WORKSPACE_LIVE,
    refreshed_symbols: refreshed,
    dashboard,
  });
}
