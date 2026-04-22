import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { loadTradierAccount, setLiveTradingEnabled } from "../../_lib/tradier.js";

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
  const enabled = Boolean(body.enabled);
  const account = await loadTradierAccount(context.env, auth.session.user.id);
  if (!account) {
    return json({ ok: false, error: "Connect Tradier before changing live-trading settings." }, 409);
  }
  if (enabled && account.mode !== "live") {
    return json({ ok: false, error: "Live arming requires a live-mode Tradier account." }, 409);
  }
  if (enabled && String(body.confirm_phrase || "") !== "ARM LIVE TRADING") {
    return json({ ok: false, error: "Type ARM LIVE TRADING to arm live-mode placement." }, 409);
  }
  await setLiveTradingEnabled(context.env, auth.session.user.id, enabled);
  return json({ ok: true, enabled });
}
