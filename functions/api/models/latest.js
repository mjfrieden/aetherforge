import { requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json } from "../../_lib/http.js";
import { parseStoredModel } from "../../_lib/model.js";
import { resolveResearchWorkspace } from "../../_lib/research_workspace.js";

export async function onRequestGet(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  const workspace = await resolveResearchWorkspace(context.env, auth.session.user.id);
  const row = await requireDb(context.env)
    .prepare(
      `SELECT *
       FROM models
       WHERE user_id = ?
         AND workspace = ?
       ORDER BY
         CASE WHEN status = 'active' THEN 0 ELSE 1 END,
         datetime(activated_at) DESC,
         datetime(updated_at) DESC
       LIMIT 1`,
    )
    .bind(auth.session.user.id, workspace)
    .first();
  return json({ ok: true, model: parseStoredModel(row) });
}
