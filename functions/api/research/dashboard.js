import { requireSession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { DEFAULT_WATCHLIST, loadInitialBalance, loadResearchDashboard } from "../../_lib/research.js";
import { loadTradierAccount } from "../../_lib/tradier.js";
import { researchWorkspaceFromAccount } from "../../_lib/research_workspace.js";

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
  const workspace = researchWorkspaceFromAccount(account);

  const dashboard = await loadResearchDashboard(context.env, auth.session.user.id, {
    mode,
    symbol: selectedSymbol,
    initialBalance,
    workspace,
  });

  if (!account && !dashboard.watchlist.length) {
    return json({
      ok: true,
      connected: false,
      workspace,
      message: "Demo workspace is empty. Load demo history for practice or connect Tradier to start the live replay store.",
      dashboard,
    });
  }

  return json({
    ok: true,
    connected: Boolean(account),
    workspace,
    message: account
      ? undefined
      : "Demo workspace active. Synthetic history stays isolated from live training and the leaderboard.",
    dashboard,
  });
}
