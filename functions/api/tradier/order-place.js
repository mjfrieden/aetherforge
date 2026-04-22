import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import {
  loadTradierAccount,
  submitTradierOrder,
  validateOrderInput,
} from "../../_lib/tradier.js";

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
  const validation = validateOrderInput(body, context.env, { placement: true });
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400);
  }
  const account = await loadTradierAccount(context.env, auth.session.user.id);
  if (!account) {
    return json({ ok: false, error: "Tradier is not connected for this user." }, 409);
  }
  if (account.mode === "live") {
    if (String(context.env.GLOBAL_LIVE_TRADING_ENABLED || "").toLowerCase() !== "true") {
      return json({ ok: false, error: "Live placement is globally disabled for this deployment." }, 412);
    }
    if (!account.live_trading_enabled) {
      return json({ ok: false, error: "Live placement is not armed for this user." }, 412);
    }
    if (String(body.confirm_phrase || "") !== "PLACE LIVE ORDER") {
      return json({ ok: false, error: "Type PLACE LIVE ORDER to place a live order." }, 409);
    }
  } else if (String(body.confirm_phrase || "") !== "PLACE PAPER ORDER") {
    return json({ ok: false, error: "Type PLACE PAPER ORDER to place a sandbox order." }, 409);
  }
  return submitTradierOrder(context.env, auth.session.user.id, account, validation.order, false);
}
