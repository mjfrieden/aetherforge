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
  const validation = validateOrderInput(body, context.env, { placement: false });
  if (!validation.ok) {
    return json({ ok: false, error: validation.error }, 400);
  }
  const account = await loadTradierAccount(context.env, auth.session.user.id);
  if (!account) {
    return json({ ok: false, error: "Tradier is not connected for this user." }, 409);
  }
  return submitTradierOrder(context.env, auth.session.user.id, account, validation.order, true);
}
