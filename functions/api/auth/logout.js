import { destroySession, requireSession } from "../../_lib/auth.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";

export async function onRequestPost(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  const csrf = await requireSameOriginAndCsrf(context, auth.session);
  if (csrf) {
    return csrf;
  }
  return destroySession(context);
}
