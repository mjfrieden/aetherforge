import { requireSession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { loadTradierAccount, tradierRequest, tradierStatus } from "../../_lib/tradier.js";

export async function onRequestGet(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  let account;
  try {
    account = await loadTradierAccount(context.env, auth.session.user.id);
  } catch (error) {
    return json({ ok: false, error: error.message, broker: { configured: false } }, 503);
  }
  if (!account) {
    return json({ ok: true, broker: tradierStatus(null) });
  }
  let profile = null;
  try {
    const payload = await tradierRequest(account, "/user/profile");
    profile = {
      id: payload?.profile?.id || null,
      name: payload?.profile?.name || null,
    };
  } catch {
    profile = null;
  }
  return json({ ok: true, broker: tradierStatus(account), profile });
}
