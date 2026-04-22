import { audit, requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, nowIso, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";

function sanitizeGameState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    level: Math.max(1, Math.min(99, Number.parseInt(String(state.level || 1), 10) || 1)),
    xp: Math.max(0, Math.min(1000000, Number.parseInt(String(state.xp || 0), 10) || 0)),
    essence: {
      momentum: Math.max(0, Math.min(999, Number(state.essence?.momentum || 0))),
      volatility: Math.max(0, Math.min(999, Number(state.essence?.volatility || 0))),
      sentiment: Math.max(0, Math.min(999, Number(state.essence?.sentiment || 0))),
      liquidity: Math.max(0, Math.min(999, Number(state.essence?.liquidity || 0))),
      iv_rank: Math.max(0, Math.min(999, Number(state.essence?.iv_rank || 0))),
    },
    samples: Array.isArray(state.samples) ? state.samples.slice(-80) : [],
    last_symbol: String(state.last_symbol || "SPY").toUpperCase().slice(0, 12),
  };
}

export async function onRequestGet(context) {
  const auth = await requireSession(context);
  if (auth.response) {
    return auth.response;
  }
  const row = await requireDb(context.env)
    .prepare("SELECT state_json, updated_at FROM game_state WHERE user_id = ?")
    .bind(auth.session.user.id)
    .first();
  return json({
    ok: true,
    state: row ? JSON.parse(row.state_json) : null,
    updated_at: row?.updated_at || null,
  });
}

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
  const state = sanitizeGameState(body.state);
  const updatedAt = nowIso();
  await requireDb(context.env)
    .prepare("INSERT OR REPLACE INTO game_state (user_id, state_json, updated_at) VALUES (?, ?, ?)")
    .bind(auth.session.user.id, JSON.stringify(state), updatedAt)
    .run();
  await audit(context.env, auth.session.user.id, "game.state_saved", {
    level: state.level,
    xp: state.xp,
  });
  return json({ ok: true, state, updated_at: updatedAt });
}
