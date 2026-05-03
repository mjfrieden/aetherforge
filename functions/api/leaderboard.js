import { requireDb } from "../_lib/db.js";
import { json } from "../_lib/http.js";

export async function onRequestGet(context) {
  const rows = await requireDb(context.env)
    .prepare(
      `SELECT
         users.display_name,
         COUNT(ro.id) AS evaluated_decisions,
         AVG(ro.score) AS avg_score,
         AVG(CASE WHEN ro.outcome_label = 'no_trade_win' THEN 1 ELSE 0 END) AS no_trade_win_rate,
         AVG(CASE WHEN rd.mode = 'shadow' THEN ro.score END) AS shadow_score
       FROM users
       LEFT JOIN research_outcomes ro ON ro.user_id = users.id
       LEFT JOIN research_decisions rd ON rd.id = ro.decision_id
       GROUP BY users.id, users.display_name
       HAVING evaluated_decisions > 0
       ORDER BY avg_score DESC, evaluated_decisions DESC
       LIMIT 100`,
    )
    .all();

  const leaders = (rows.results || []).map((row) => ({
    display_name: row.display_name,
    evaluated_decisions: Number(row.evaluated_decisions || 0),
    avg_score: row.avg_score === null ? null : Number(Number(row.avg_score).toFixed(4)),
    no_trade_win_rate: row.no_trade_win_rate === null ? null : Number(Number(row.no_trade_win_rate).toFixed(4)),
    shadow_score: row.shadow_score === null ? null : Number(Number(row.shadow_score).toFixed(4)),
  }));
  return json({ ok: true, leaders });
}
