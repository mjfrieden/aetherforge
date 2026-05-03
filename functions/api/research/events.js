import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { addResearchEvent, loadInitialBalance, loadResearchDashboard } from "../../_lib/research.js";

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

  try {
    const event = await addResearchEvent(context.env, auth.session.user.id, body);
    const dashboard = await loadResearchDashboard(context.env, auth.session.user.id, {
      mode: body.mode === "shadow" ? "shadow" : "paper",
      symbol: body.symbol || event.symbol,
      initialBalance: await loadInitialBalance(context.env, auth.session.user.id),
    });
    return json({ ok: true, event, dashboard });
  } catch (error) {
    return json({ ok: false, error: error.message || String(error) }, 400);
  }
}
