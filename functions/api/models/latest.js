import { requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { parseStoredModel } from "../../_lib/model.js";

export async function onRequestGet(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  const row = await requireDb(context.env)
    .prepare("SELECT * FROM models WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
    .bind(auth.session.user.id)
    .first();
  return json({ ok: true, model: parseStoredModel(row) });
}
