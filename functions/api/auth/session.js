import { pruneExpiredSessions, publicUser, readSession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";

export async function onRequestGet(context) {
  await pruneExpiredSessions(context.env);
  const session = await readSession(context.request, context.env);
  if (!session) {
    return json({ authenticated: false, user: null });
  }
  return json({
    authenticated: true,
    csrf_token: session.csrf_token,
    user: publicUser(session.user),
  });
}
