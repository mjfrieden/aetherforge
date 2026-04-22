import { requireSession } from "../../_lib/auth.js";
import { json, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";
import { saveTradierAccount } from "../../_lib/tradier.js";

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
    const result = await saveTradierAccount(context.env, auth.session.user.id, body);
    return json(result, result.ok ? 200 : 400);
  } catch (error) {
    return json({ ok: false, error: error.message }, 503);
  }
}
