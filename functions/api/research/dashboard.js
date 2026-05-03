import { requireSession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import {
  DEFAULT_WATCHLIST,
  buildReplaySnapshot,
  evaluateOpenResearch,
  loadInitialBalance,
  loadResearchDashboard,
} from "../../_lib/research.js";
import { loadTradierAccount } from "../../_lib/tradier.js";

export async function onRequestGet(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }

  const requestUrl = new URL(context.request.url);
  const requestedSymbols = (requestUrl.searchParams.get("symbols") || "")
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean)
    .slice(0, 5);
  const symbols = requestedSymbols.length ? requestedSymbols : DEFAULT_WATCHLIST;
  const mode = requestUrl.searchParams.get("mode") === "shadow" ? "shadow" : "paper";
  const selectedSymbol = requestUrl.searchParams.get("symbol") || symbols[0];
  const initialBalance = await loadInitialBalance(context.env, auth.session.user.id);

  const account = await loadTradierAccount(context.env, auth.session.user.id);
  if (account) {
    for (const symbol of symbols) {
      try {
        const snapshot = await buildReplaySnapshot(context.env, auth.session.user.id, account, symbol);
        await evaluateOpenResearch(context.env, auth.session.user.id, snapshot);
      } catch {
        // Keep the dashboard usable even if one symbol fails to refresh.
      }
    }
  }

  const dashboard = await loadResearchDashboard(context.env, auth.session.user.id, {
    mode,
    symbol: selectedSymbol,
    initialBalance,
  });

  if (!account && !dashboard.watchlist.length) {
    return json({
      ok: true,
      connected: false,
      message: "Connect Tradier to begin building the Cumulonimbus replay store.",
      dashboard,
    });
  }

  return json({
    ok: true,
    connected: Boolean(account),
    dashboard,
  });
}
