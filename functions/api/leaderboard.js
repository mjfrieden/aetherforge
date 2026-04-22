import { requireDb } from "../_lib/db.js";
import { json } from "../_lib/http.js";

export async function onRequestGet(context) {
  const rows = await requireDb(context.env)
    .prepare(
      "SELECT users.display_name, game_state.state_json, game_state.updated_at FROM game_state JOIN users ON users.id = game_state.user_id ORDER BY game_state.updated_at DESC LIMIT 100",
    )
    .all();
  const leaders = (rows.results || [])
    .map((row) => {
      let state = {};
      try {
        state = JSON.parse(row.state_json);
      } catch {
        state = {};
      }
      return {
        display_name: row.display_name,
        level: Number(state.level || 1),
        xp: Number(state.xp || 0),
        updated_at: row.updated_at,
      };
    })
    .sort((a, b) => b.xp - a.xp)
    .slice(0, 12);
  return json({ ok: true, leaders });
}
