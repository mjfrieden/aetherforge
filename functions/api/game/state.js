import { audit, requireDb } from "../../_lib/db.js";
import { requireSession } from "../../_lib/auth.js";
import { json, nowIso, readJson } from "../../_lib/http.js";
import { requireSameOriginAndCsrf } from "../../_lib/security.js";

function sanitizeGameState(value) {
  const state = value && typeof value === "object" ? value : {};
  const profession = state.profession && typeof state.profession === "object" ? state.profession : {};
  const forecast = profession.forecast && typeof profession.forecast === "object" ? profession.forecast : null;
  const forecastFeatures = forecast?.features && typeof forecast.features === "object" ? forecast.features : {};
  const cockpit = state.cockpit && typeof state.cockpit === "object" ? state.cockpit : {};
  const roster = Array.isArray(state.roster)
    ? state.roster.slice(0, 8).map((creature) => ({
        id: String(creature?.id || "").slice(0, 32),
        name: String(creature?.name || "").slice(0, 48),
        archetype: String(creature?.archetype || "").slice(0, 32),
        role: String(creature?.role || "").slice(0, 48),
        sprite: String(creature?.sprite || "").slice(0, 32),
        level: Math.max(1, Math.min(99, Number.parseInt(String(creature?.level || 1), 10) || 1)),
        xp: Math.max(0, Math.min(100000, Number.parseInt(String(creature?.xp || 0), 10) || 0)),
        maxHp: Math.max(40, Math.min(500, Number.parseInt(String(creature?.maxHp || 100), 10) || 100)),
      }))
    : [];
  return {
    level: Math.max(1, Math.min(99, Number.parseInt(String(state.level || 1), 10) || 1)),
    xp: Math.max(0, Math.min(1000000, Number.parseInt(String(state.xp || 0), 10) || 0)),
    wins: Math.max(0, Math.min(100000, Number.parseInt(String(state.wins || 0), 10) || 0)),
    activeCreatureId: String(state.activeCreatureId || "").slice(0, 32),
    roster,
    player: {
      x: Math.max(0, Math.min(5000, Number(state.player?.x || 0))),
      y: Math.max(0, Math.min(5000, Number(state.player?.y || 0))),
    },
    profession: {
      signalsCollected: Math.max(
        0,
        Math.min(100000, Number.parseInt(String(profession.signalsCollected || state.wins || 0), 10) || 0),
      ),
      questStage: Math.max(0, Math.min(20, Number.parseInt(String(profession.questStage || 0), 10) || 0)),
      contractBias: ["auto", "call", "put"].includes(String(profession.contractBias))
        ? String(profession.contractBias)
        : "auto",
      forecast: forecast
        ? {
            symbol: String(forecast.symbol || state.last_symbol || "SPY").toUpperCase().slice(0, 12),
            contract: ["call", "put", "wait"].includes(String(forecast.contract)) ? String(forecast.contract) : "wait",
            probability: Math.max(0, Math.min(1, Number(forecast.probability || 0))),
            class: String(forecast.class || "").slice(0, 32),
            features: {
              momentum: Math.max(-1, Math.min(1, Number(forecastFeatures.momentum || 0))),
              volatility: Math.max(-1, Math.min(1, Number(forecastFeatures.volatility || 0))),
              sentiment: Math.max(-1, Math.min(1, Number(forecastFeatures.sentiment || 0))),
              liquidity: Math.max(-1, Math.min(1, Number(forecastFeatures.liquidity || 0))),
              iv_rank: Math.max(-1, Math.min(1, Number(forecastFeatures.iv_rank || 0))),
            },
          }
        : null,
    },
    cockpit: {
      balance: Math.max(0, Math.min(100000000, Number(cockpit.balance || 10000))),
      initialBalance: Math.max(0, Math.min(100000000, Number(cockpit.initialBalance || 10000))),
      paperMode: cockpit.paperMode === "shadow" ? "shadow" : "paper",
      pnlHistory: Array.isArray(cockpit.pnlHistory)
        ? cockpit.pnlHistory.slice(-24).map((point) => ({
            time: String(point?.time || "").slice(0, 16),
            value: Math.max(0, Math.min(100000000, Number(point?.value || 0))),
          }))
        : [],
      trades: Array.isArray(cockpit.trades)
        ? cockpit.trades.slice(0, 20).map((trade) => ({
            id: String(trade?.id || "").slice(0, 80),
            time: String(trade?.time || "").slice(0, 16),
            symbol: String(trade?.symbol || "").toUpperCase().slice(0, 12),
            optionSymbol: String(trade?.optionSymbol || "").toUpperCase().slice(0, 24),
            side: trade?.side === "put" ? "put" : "call",
            debit: Math.max(0, Math.min(1000000, Number(trade?.debit || 0))),
            quantity: Math.max(1, Math.min(1000, Number.parseInt(String(trade?.quantity || 1), 10) || 1)),
            pnl: Math.max(-100000000, Math.min(100000000, Number(trade?.pnl || 0))),
            score: Math.max(0, Math.min(1, Number(trade?.score || 0))),
          }))
        : [],
      pipeline:
        cockpit.pipeline && typeof cockpit.pipeline === "object"
          ? {
              architecture: String(cockpit.pipeline.architecture || "Random Forest").slice(0, 48),
              architectureType: String(cockpit.pipeline.architectureType || "Ensemble").slice(0, 48),
              optimizer: String(cockpit.pipeline.optimizer || "AdamW").slice(0, 48),
              features: Array.isArray(cockpit.pipeline.features)
                ? cockpit.pipeline.features
                    .filter((feature) => ["momentum", "volatility", "sentiment", "liquidity", "iv_rank"].includes(String(feature)))
                    .slice(0, 5)
                : ["momentum", "volatility", "liquidity"],
            }
          : {
              architecture: "Random Forest",
              architectureType: "Ensemble",
              optimizer: "AdamW",
              features: ["momentum", "volatility", "liquidity"],
            },
    },
    essence: {
      momentum: Math.max(0, Math.min(999, Number(state.essence?.momentum || 0))),
      volatility: Math.max(0, Math.min(999, Number(state.essence?.volatility || 0))),
      sentiment: Math.max(0, Math.min(999, Number(state.essence?.sentiment || 0))),
      liquidity: Math.max(0, Math.min(999, Number(state.essence?.liquidity || 0))),
      iv_rank: Math.max(0, Math.min(999, Number(state.essence?.iv_rank || 0))),
    },
    samples: Array.isArray(state.samples) ? state.samples.slice(-160) : [],
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
