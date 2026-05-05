import { randomBase64Url } from "./encoding.js";
import { audit, requireDb } from "./db.js";
import { nowIso } from "./http.js";
import { cleanSymbol, tradierRequest } from "./tradier.js";
import { listFeatureManifests, listModelVersions } from "./model_forge.js";
import { parseStoredModel, predictWithWeights } from "./model.js";

export const DEFAULT_WATCHLIST = ["SPY", "QQQ", "NVDA", "TSLA", "AAPL"];
export const RESEARCH_FEATURES = ["change_pct", "intraday_range", "atm_iv", "liquidity", "call_put_skew"];

function clamp(value, min = -1, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(min, Math.min(max, number));
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function asArray(value) {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === null || value === undefined) {
    return [];
  }
  return [value];
}

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function toInteger(value, fallback = 0) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) ? number : fallback;
}

function timestampToIso(value) {
  const raw = Number(value);
  if (Number.isFinite(raw) && raw > 0) {
    return new Date(raw).toISOString();
  }
  return nowIso();
}

function jsonParse(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function optionMark(option) {
  const bid = toNumber(option?.bid, NaN);
  const ask = toNumber(option?.ask, NaN);
  if (Number.isFinite(bid) && Number.isFinite(ask) && bid > 0 && ask > 0) {
    return Number(((bid + ask) / 2).toFixed(2));
  }
  const last = toNumber(option?.last, NaN);
  if (Number.isFinite(last) && last > 0) {
    return Number(last.toFixed(2));
  }
  return 0;
}

function normalizeQuote(payload, requestedSymbol) {
  const quote = payload?.quotes?.quote ?? payload?.quote ?? {};
  const row = Array.isArray(quote) ? quote[0] || {} : quote;
  const symbol = cleanSymbol(row?.symbol || requestedSymbol);
  const last = toNumber(row?.last || row?.close || row?.prevclose);
  const prevclose = toNumber(row?.prevclose || last);
  const high = toNumber(row?.high || last);
  const low = toNumber(row?.low || last);
  const open = toNumber(row?.open || prevclose || last);
  const changePercent = toNumber(row?.change_percentage, prevclose ? ((last - prevclose) / prevclose) * 100 : 0);
  return {
    symbol,
    price: last,
    bid: toNumber(row?.bid, 0),
    ask: toNumber(row?.ask, 0),
    open,
    high,
    low,
    prevclose,
    volume: toInteger(row?.volume, 0),
    averageVolume: toInteger(row?.average_volume, 0),
    changePercent: Number(changePercent.toFixed(2)),
    sector: symbol === "SPY" || symbol === "QQQ" ? "ETF" : "Equity",
    snapshotAt: timestampToIso(row?.trade_date || row?.bid_date || row?.ask_date),
  };
}

function normalizeOptionRow(option) {
  const contractType = option?.option_type === "put" ? "put" : "call";
  const greeks = option?.greeks || {};
  return {
    optionSymbol: cleanSymbol(option?.symbol),
    type: contractType,
    strike: toNumber(option?.strike, 0),
    expiration: String(option?.expiration_date || ""),
    bid: toNumber(option?.bid, 0),
    ask: toNumber(option?.ask, 0),
    lastPrice: toNumber(option?.last, 0),
    mark: optionMark(option),
    volume: toInteger(option?.volume, 0),
    openInterest: toInteger(option?.open_interest, 0),
    impliedVolatility: toNumber(greeks?.mid_iv ?? greeks?.smv_vol ?? option?.implied_volatility, 0),
    delta: toNumber(greeks?.delta, 0),
    gamma: toNumber(greeks?.gamma, 0),
    theta: toNumber(greeks?.theta, 0),
    vega: toNumber(greeks?.vega, 0),
  };
}

function normalizeChain(payload) {
  const rows = asArray(payload?.options?.option ?? payload?.option).map(normalizeOptionRow);
  return rows.filter((row) => row.optionSymbol && row.strike > 0 && row.mark > 0);
}

function chooseExpiration(payload) {
  const today = nowIso().slice(0, 10);
  const dates = asArray(payload?.expirations?.date ?? payload?.expirations?.expiration ?? payload?.expirations)
    .map((value) => String(value || ""))
    .filter((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))
    .sort();
  return dates.find((date) => date >= today) || dates[0] || today;
}

function spreadQuality(option) {
  const mark = Math.max(option.mark, 0.01);
  const spread = Math.max(0, option.ask - option.bid);
  return clamp01(1 - spread / mark);
}

function liquidityQuality(option) {
  const oi = clamp01(toNumber(option.openInterest) / 2500);
  const volume = clamp01(toNumber(option.volume) / 1000);
  return clamp01(oi * 0.55 + volume * 0.25 + spreadQuality(option) * 0.2);
}

function candidateScore(option, quotePrice) {
  const distance = Math.abs(option.strike - quotePrice) / Math.max(quotePrice, 1);
  return liquidityQuality(option) * 0.75 + clamp01(1 - distance * 12) * 0.25;
}

function bestContract(options, type, quotePrice) {
  return options
    .filter((option) => option.type === type)
    .sort((left, right) => candidateScore(right, quotePrice) - candidateScore(left, quotePrice))[0] || null;
}

function averageIv(option) {
  return clamp(toNumber(option?.impliedVolatility, 0.25), 0, 3);
}

export function buildResearchFeatures(quote, options) {
  const call = bestContract(options, "call", quote.price);
  const put = bestContract(options, "put", quote.price);
  const liquidity = clamp(((liquidityQuality(call || {}) + liquidityQuality(put || {})) / 2) * 2 - 1);
  const totalCallOi = options.filter((option) => option.type === "call").reduce((sum, option) => sum + toNumber(option.openInterest), 0);
  const totalPutOi = options.filter((option) => option.type === "put").reduce((sum, option) => sum + toNumber(option.openInterest), 0);
  const oiBase = Math.max(totalCallOi + totalPutOi, 1);
  const callPutSkew = clamp((totalCallOi - totalPutOi) / oiBase);
  const intradayRange = quote.prevclose > 0 ? (quote.high - quote.low) / quote.prevclose : 0;
  const atmIv = (averageIv(call) + averageIv(put)) / (call && put ? 2 : 1);
  return {
    change_pct: clamp(quote.changePercent / 4),
    intraday_range: clamp(intradayRange * 8),
    atm_iv: clamp((atmIv - 0.3) / 0.25),
    liquidity,
    call_put_skew: callPutSkew,
  };
}

function parseFeatureKeys(value) {
  const requested = Array.isArray(value) ? value.map((item) => String(item || "")) : [];
  const selected = requested.filter((item, index) => RESEARCH_FEATURES.includes(item) && requested.indexOf(item) === index);
  return selected.length ? selected : RESEARCH_FEATURES;
}

function scoreFromModel(features, model) {
  const prediction = predictWithWeights(model, features);
  const liquidity = (toNumber(features.liquidity) + 1) / 2;
  const ivPressure = clamp01(Math.max(0, toNumber(features.atm_iv)));
  const margin = Math.abs(prediction.probability - 0.5) * 2;
  const noTradePressure = clamp01((1 - liquidity) * 0.45 + ivPressure * 0.35 + (1 - margin) * 0.2);
  const noTrade = noTradePressure >= 0.52 || margin < 0.16;
  const directionalScore = clamp01(margin * 0.62 + liquidity * 0.28 + (1 - ivPressure) * 0.1);
  const abstentionScore = clamp01(noTradePressure * 0.7 + (1 - margin) * 0.3);
  const decision = noTrade ? "no_trade" : prediction.probability >= 0.5 ? "call" : "put";
  return {
    engine: model ? "replay_model" : "heuristic",
    decision,
    probability: Number(prediction.probability.toFixed(4)),
    score: Number((decision === "no_trade" ? abstentionScore : directionalScore).toFixed(4)),
    className: decision === "no_trade" ? "no_trade" : decision === "call" ? "call_edge" : "put_edge",
    noTradePressure: Number(noTradePressure.toFixed(4)),
  };
}

function scoreHeuristic(features) {
  const momentum = toNumber(features.change_pct);
  const volatility = Math.abs(toNumber(features.intraday_range));
  const skew = toNumber(features.call_put_skew);
  const liquidity = (toNumber(features.liquidity) + 1) / 2;
  const ivPressure = clamp01(Math.max(0, toNumber(features.atm_iv)));
  const callBias = 0.5 + momentum * 0.18 + skew * 0.12;
  const putBias = 0.5 - momentum * 0.18 - skew * 0.12 + volatility * 0.06;
  const probability = clamp01(callBias / Math.max(callBias + putBias, 0.01));
  const margin = Math.abs(probability - 0.5) * 2;
  const noTradePressure = clamp01((1 - liquidity) * 0.4 + ivPressure * 0.35 + (1 - margin) * 0.25);
  const noTrade = noTradePressure >= 0.58 || margin < 0.14;
  const directionalScore = clamp01(margin * 0.55 + liquidity * 0.3 + (1 - ivPressure) * 0.15);
  return {
    engine: "heuristic",
    decision: noTrade ? "no_trade" : probability >= 0.5 ? "call" : "put",
    probability: Number(probability.toFixed(4)),
    score: Number((noTrade ? noTradePressure : directionalScore).toFixed(4)),
    className: noTrade ? "no_trade" : probability >= 0.5 ? "call_edge" : "put_edge",
    noTradePressure: Number(noTradePressure.toFixed(4)),
  };
}

function outcomeReturn(entry, exit) {
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(exit) || exit <= 0) {
    return null;
  }
  return Number(((exit - entry) / entry).toFixed(4));
}

function latestSnapshotTime(snapshot) {
  return snapshot?.snapshotAt || snapshot?.createdAt || nowIso();
}

function minutesBetween(left, right) {
  return Math.max(1, Math.round((new Date(right).getTime() - new Date(left).getTime()) / 60000));
}

function outcomeLabelForDecision(decision, callReturn, putReturn, underlyingReturn) {
  const bestDirectional = Math.max(callReturn ?? -1, putReturn ?? -1);
  const quietTape = bestDirectional < 0.08 && Math.abs(underlyingReturn ?? 0) < 0.012;
  if (decision === "no_trade") {
    return quietTape ? "no_trade_win" : (callReturn ?? -1) >= (putReturn ?? -1) ? "call_win" : "put_win";
  }
  if (decision === "call") {
    if ((callReturn ?? -1) > 0.05 && (callReturn ?? -1) >= (putReturn ?? -1)) return "call_win";
    if (quietTape) return "no_trade_win";
    return (putReturn ?? -1) > (callReturn ?? -1) ? "put_win" : "mixed";
  }
  if ((putReturn ?? -1) > 0.05 && (putReturn ?? -1) >= (callReturn ?? -1)) return "put_win";
  if (quietTape) return "no_trade_win";
  return (callReturn ?? -1) > (putReturn ?? -1) ? "call_win" : "mixed";
}

function scoreOutcome(decision, label, callReturn, putReturn, underlyingReturn) {
  const bestDirectional = Math.max(callReturn ?? -1, putReturn ?? -1);
  if (decision === "no_trade") {
    if (label === "no_trade_win") return 1;
    return clamp01(0.45 - bestDirectional * 0.4 - Math.abs(underlyingReturn ?? 0) * 6);
  }
  const directionalReturn = decision === "call" ? callReturn : putReturn;
  const oppositeReturn = decision === "call" ? putReturn : callReturn;
  if (label === `${decision}_win`) {
    return clamp01(0.6 + toNumber(directionalReturn, 0) * 0.8 - Math.max(0, toNumber(oppositeReturn, 0)) * 0.15);
  }
  if (label === "no_trade_win") {
    return clamp01(0.35 - Math.max(0, toNumber(directionalReturn, 0)) * 0.25);
  }
  return clamp01(0.2 + toNumber(directionalReturn, -0.3) * 0.3 - Math.max(0, toNumber(oppositeReturn, 0)) * 0.4);
}

export async function loadLatestModel(env, userId) {
  const row = await requireDb(env)
    .prepare("SELECT * FROM models WHERE user_id = ? ORDER BY updated_at DESC LIMIT 1")
    .bind(userId)
    .first();
  return parseStoredModel(row);
}

export async function buildReplaySnapshot(env, userId, account, symbol) {
  const normalizedSymbol = cleanSymbol(symbol);
  const expirations = await tradierRequest(account, `/markets/options/expirations?symbol=${encodeURIComponent(normalizedSymbol)}`);
  const expiration = chooseExpiration(expirations);
  const [quotePayload, chainPayload] = await Promise.all([
    tradierRequest(account, `/markets/quotes?symbols=${encodeURIComponent(normalizedSymbol)}`),
    tradierRequest(
      account,
      `/markets/options/chains?symbol=${encodeURIComponent(normalizedSymbol)}&expiration=${encodeURIComponent(expiration)}&greeks=true`,
    ),
  ]);
  const quote = normalizeQuote(quotePayload, normalizedSymbol);
  const options = normalizeChain(chainPayload);
  const features = buildResearchFeatures(quote, options);
  const createdAt = nowIso();
  const snapshotAt = quote.snapshotAt || createdAt;
  const snapshotId = randomBase64Url(18);
  await requireDb(env)
    .prepare(
      "INSERT INTO research_snapshots (id, user_id, symbol, expiration_date, snapshot_at, quote_json, feature_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(snapshotId, userId, normalizedSymbol, expiration, snapshotAt, JSON.stringify(quote), JSON.stringify(features), createdAt)
    .run();

  for (const option of options) {
    await requireDb(env)
      .prepare(
        "INSERT INTO research_option_quotes (id, snapshot_id, option_symbol, contract_type, strike, expiration_date, bid, ask, last, mark, volume, open_interest, implied_volatility, delta, gamma, theta, vega, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        randomBase64Url(18),
        snapshotId,
        option.optionSymbol,
        option.type,
        option.strike,
        option.expiration,
        option.bid,
        option.ask,
        option.lastPrice,
        option.mark,
        option.volume,
        option.openInterest,
        option.impliedVolatility,
        option.delta,
        option.gamma,
        option.theta,
        option.vega,
        createdAt,
      )
      .run();
  }

  return {
    id: snapshotId,
    symbol: normalizedSymbol,
    expiration,
    snapshotAt,
    createdAt,
    quote,
    options,
    features,
  };
}

export function computeReplayDecision(snapshot, model) {
  const features = snapshot.features || buildResearchFeatures(snapshot.quote, snapshot.options);
  const scored = model ? scoreFromModel(features, model) : scoreHeuristic(features);
  const call = bestContract(snapshot.options, "call", snapshot.quote.price);
  const put = bestContract(snapshot.options, "put", snapshot.quote.price);
  const selected = scored.decision === "call" ? call : scored.decision === "put" ? put : null;
  return {
    symbol: snapshot.symbol,
    snapshotId: snapshot.id,
    snapshotAt: snapshot.snapshotAt,
    features,
    probability: scored.probability,
    score: scored.score,
    decision: scored.decision,
    className: scored.className,
    engine: scored.engine,
    noTradePressure: scored.noTradePressure,
    selectedOption: selected,
    callOption: call,
    putOption: put,
    quote: snapshot.quote,
    options: snapshot.options,
  };
}

export async function storeReplayDecision(env, userId, mode, model, replayDecision) {
  const id = randomBase64Url(18);
  const createdAt = nowIso();
  const selected = replayDecision.selectedOption;
  await requireDb(env)
    .prepare(
      "INSERT INTO research_decisions (id, user_id, snapshot_id, model_id, mode, symbol, decision, probability, score, selected_option_symbol, selected_contract_type, selected_entry_mark, call_option_symbol, call_entry_mark, put_option_symbol, put_entry_mark, underlying_entry_price, features_json, rationale_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      id,
      userId,
      replayDecision.snapshotId,
      model?.id || null,
      mode,
      replayDecision.symbol,
      replayDecision.decision,
      replayDecision.probability,
      replayDecision.score,
      selected?.optionSymbol || null,
      selected?.type || null,
      selected?.mark || null,
      replayDecision.callOption?.optionSymbol || null,
      replayDecision.callOption?.mark || null,
      replayDecision.putOption?.optionSymbol || null,
      replayDecision.putOption?.mark || null,
      replayDecision.quote.price,
      JSON.stringify(replayDecision.features),
      JSON.stringify({
        engine: replayDecision.engine,
        noTradePressure: replayDecision.noTradePressure,
        selectedOptionSymbol: selected?.optionSymbol || null,
      }),
      createdAt,
    )
    .run();
  await audit(env, userId, "research.decision_recorded", {
    decision_id: id,
    symbol: replayDecision.symbol,
    mode,
    decision: replayDecision.decision,
    score: replayDecision.score,
  });
  return { ...replayDecision, id, mode, createdAt };
}

export async function evaluateOpenResearch(env, userId, snapshot) {
  const db = requireDb(env);
  const optionsBySymbol = new Map(snapshot.options.map((option) => [option.optionSymbol, option]));
  const openDecisions = await db
    .prepare(
      "SELECT * FROM research_decisions WHERE user_id = ? AND symbol = ? AND resolved_at IS NULL AND created_at < ? ORDER BY created_at ASC",
    )
    .bind(userId, snapshot.symbol, snapshot.createdAt)
    .all();
  for (const decision of openDecisions.results || []) {
    const callReturn = outcomeReturn(toNumber(decision.call_entry_mark, NaN), toNumber(optionsBySymbol.get(decision.call_option_symbol)?.mark, NaN));
    const putReturn = outcomeReturn(toNumber(decision.put_entry_mark, NaN), toNumber(optionsBySymbol.get(decision.put_option_symbol)?.mark, NaN));
    const selectedReturn = outcomeReturn(
      toNumber(decision.selected_entry_mark, NaN),
      toNumber(optionsBySymbol.get(decision.selected_option_symbol)?.mark, NaN),
    );
    const underlyingReturn = outcomeReturn(toNumber(decision.underlying_entry_price, NaN), toNumber(snapshot.quote.price, NaN));
    const label = outcomeLabelForDecision(decision.decision, callReturn, putReturn, underlyingReturn);
    const score = scoreOutcome(decision.decision, label, callReturn, putReturn, underlyingReturn);
    await db
      .prepare(
        "INSERT OR REPLACE INTO research_outcomes (id, decision_id, user_id, entry_snapshot_id, exit_snapshot_id, outcome_label, selected_return, call_return, put_return, underlying_return, score, horizon_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        randomBase64Url(18),
        decision.id,
        userId,
        decision.snapshot_id,
        snapshot.id,
        label,
        selectedReturn,
        callReturn,
        putReturn,
        underlyingReturn,
        score,
        minutesBetween(decision.created_at, latestSnapshotTime(snapshot)),
        nowIso(),
      )
      .run();
    await db
      .prepare("UPDATE research_decisions SET resolved_at = ? WHERE id = ?")
      .bind(snapshot.snapshotAt, decision.id)
      .run();
  }

  const openTrades = await db
    .prepare(
      "SELECT * FROM research_paper_trades WHERE user_id = ? AND symbol = ? AND status = 'open' AND opened_at < ? ORDER BY opened_at ASC",
    )
    .bind(userId, snapshot.symbol, snapshot.createdAt)
    .all();
  for (const trade of openTrades.results || []) {
    const exitOption = optionsBySymbol.get(trade.option_symbol);
    if (!exitOption) continue;
    const exitPrice = toNumber(exitOption.mark, NaN);
    if (!Number.isFinite(exitPrice) || exitPrice <= 0) continue;
    const pnl = Number((((exitPrice - toNumber(trade.entry_price)) * 100 * toInteger(trade.quantity, 1))).toFixed(2));
    await db
      .prepare(
        "UPDATE research_paper_trades SET status = 'closed', closed_at = ?, exit_snapshot_id = ?, exit_price = ?, pnl = ?, outcome_label = ? WHERE id = ?",
      )
      .bind(
        snapshot.snapshotAt,
        snapshot.id,
        exitPrice,
        pnl,
        pnl >= 0 ? "win" : "loss",
        trade.id,
      )
      .run();
  }
}

export async function createPaperTrade(env, userId, body) {
  const db = requireDb(env);
  const snapshot = await db.prepare("SELECT * FROM research_snapshots WHERE id = ?").bind(String(body.snapshot_id || "")).first();
  if (!snapshot) {
    throw new Error("Snapshot not found for paper trade.");
  }
  const option = await db
    .prepare("SELECT * FROM research_option_quotes WHERE snapshot_id = ? AND option_symbol = ?")
    .bind(snapshot.id, cleanSymbol(body.option_symbol))
    .first();
  if (!option) {
    throw new Error("Option contract not found for this snapshot.");
  }
  const quantity = Math.max(1, Math.min(10, toInteger(body.quantity, 1)));
  const tradeId = randomBase64Url(18);
  const createdAt = nowIso();
  const decisionId = String(body.decision_id || "") || null;
  const quote = jsonParse(snapshot.quote_json, {});
  await db
    .prepare(
      "INSERT INTO research_paper_trades (id, user_id, decision_id, snapshot_id, mode, symbol, option_symbol, side, quantity, entry_price, entry_underlying_price, entry_score, status, opened_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)",
    )
    .bind(
      tradeId,
      userId,
      decisionId,
      snapshot.id,
      body.mode === "shadow" ? "shadow" : "paper",
      snapshot.symbol,
      option.option_symbol,
      option.contract_type,
      quantity,
      toNumber(option.mark, 0),
      toNumber(quote.price, 0),
      clamp01(toNumber(body.entry_score, 0)),
      createdAt,
    )
    .run();
  await audit(env, userId, "research.paper_trade_opened", {
    trade_id: tradeId,
    symbol: snapshot.symbol,
    option_symbol: option.option_symbol,
    mode: body.mode === "shadow" ? "shadow" : "paper",
  });
  return {
    id: tradeId,
    snapshotId: snapshot.id,
    symbol: snapshot.symbol,
    optionSymbol: option.option_symbol,
    side: option.contract_type,
    quantity,
    entryPrice: toNumber(option.mark, 0),
    mode: body.mode === "shadow" ? "shadow" : "paper",
    openedAt: createdAt,
  };
}

export async function addResearchEvent(env, userId, input) {
  const id = randomBase64Url(18);
  const snapshotId = String(input.snapshot_id || "") || null;
  const symbol = cleanSymbol(input.symbol);
  const title = String(input.title || "").trim().slice(0, 120);
  const body = String(input.body || "").trim().slice(0, 1200);
  const source = String(input.source || "Manual note").trim().slice(0, 80) || "Manual note";
  if (!symbol || !title || !body) {
    throw new Error("symbol, title, and body are required.");
  }
  await requireDb(env)
    .prepare(
      "INSERT INTO research_events (id, user_id, snapshot_id, symbol, title, body, source, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(id, userId, snapshotId, symbol, title, body, source, nowIso())
    .run();
  await audit(env, userId, "research.event_added", { event_id: id, symbol });
  return { id, snapshotId, symbol, title, body, source, created_at: nowIso() };
}

async function recentEvents(env, userId, symbol = null) {
  const query = symbol
    ? "SELECT * FROM research_events WHERE user_id = ? AND symbol = ? ORDER BY created_at DESC LIMIT 6"
    : "SELECT * FROM research_events WHERE user_id = ? ORDER BY created_at DESC LIMIT 6";
  const params = symbol ? [userId, symbol] : [userId];
  const rows = await requireDb(env).prepare(query).bind(...params).all();
  return (rows.results || []).map((row) => ({
    id: row.id,
    snapshot_id: row.snapshot_id,
    symbol: row.symbol,
    title: row.title,
    body: row.body,
    source: row.source,
    created_at: row.created_at,
  }));
}

function equityHistoryFromTrades(initialBalance, trades) {
  const chron = [...trades].sort((left, right) => String(left.closed_at || left.opened_at).localeCompare(String(right.closed_at || right.opened_at)));
  let balance = Number(initialBalance);
  const history = [{ time: "Start", value: Number(balance.toFixed(2)) }];
  for (const trade of chron) {
    if (trade.status !== "closed") continue;
    balance += toNumber(trade.pnl, 0);
    history.push({
      time: new Date(String(trade.closed_at || trade.opened_at)).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      value: Number(balance.toFixed(2)),
    });
  }
  return history.slice(-24);
}

export async function loadResearchDashboard(env, userId, { mode = "paper", symbol = null, initialBalance = 10000 } = {}) {
  const db = requireDb(env);
  const watchSnapshotRows = await db
    .prepare(
      `SELECT rs.*
       FROM research_snapshots rs
       JOIN (
         SELECT symbol, MAX(created_at) AS latest_created_at
         FROM research_snapshots
         WHERE user_id = ?
         GROUP BY symbol
       ) latest
       ON latest.symbol = rs.symbol AND latest.latest_created_at = rs.created_at
       WHERE rs.user_id = ?
       ORDER BY rs.created_at DESC`,
    )
    .bind(userId, userId)
    .all();

  const watchlist = (watchSnapshotRows.results || []).map((row) => {
    const quote = jsonParse(row.quote_json, {});
    return {
      symbol: row.symbol,
      snapshotId: row.id,
      snapshotAt: row.snapshot_at,
      price: toNumber(quote.price, 0),
      changePercent: toNumber(quote.changePercent, 0),
      sector: quote.sector || (row.symbol === "SPY" || row.symbol === "QQQ" ? "ETF" : "Equity"),
    };
  });

  const selectedSymbol = cleanSymbol(symbol || watchlist[0]?.symbol || DEFAULT_WATCHLIST[0]);
  const snapshotRow = await db
    .prepare("SELECT * FROM research_snapshots WHERE user_id = ? AND symbol = ? ORDER BY created_at DESC LIMIT 1")
    .bind(userId, selectedSymbol)
    .first();
  const selectedSnapshot = snapshotRow
    ? {
        id: snapshotRow.id,
        symbol: snapshotRow.symbol,
        expiration: snapshotRow.expiration_date,
        snapshotAt: snapshotRow.snapshot_at,
        quote: jsonParse(snapshotRow.quote_json, {}),
        features: jsonParse(snapshotRow.feature_json, {}),
        options: (
          await db
            .prepare("SELECT * FROM research_option_quotes WHERE snapshot_id = ? ORDER BY strike ASC, contract_type ASC")
            .bind(snapshotRow.id)
            .all()
        ).results.map((row) => ({
          optionSymbol: row.option_symbol,
          type: row.contract_type,
          strike: toNumber(row.strike, 0),
          expiration: row.expiration_date,
          bid: toNumber(row.bid, 0),
          ask: toNumber(row.ask, 0),
          lastPrice: toNumber(row.last, 0),
          mark: toNumber(row.mark, 0),
          volume: toInteger(row.volume, 0),
          openInterest: toInteger(row.open_interest, 0),
          impliedVolatility: toNumber(row.implied_volatility, 0),
          delta: toNumber(row.delta, 0),
          gamma: toNumber(row.gamma, 0),
          theta: toNumber(row.theta, 0),
          vega: toNumber(row.vega, 0),
        })),
      }
    : null;

  const latestDecision = selectedSnapshot
    ? await db
        .prepare("SELECT * FROM research_decisions WHERE user_id = ? AND snapshot_id = ? ORDER BY created_at DESC LIMIT 1")
        .bind(userId, selectedSnapshot.id)
        .first()
    : null;
  const latestOutcome = latestDecision
    ? await db.prepare("SELECT * FROM research_outcomes WHERE decision_id = ?").bind(latestDecision.id).first()
    : null;

  const tradeRows = await db
    .prepare("SELECT * FROM research_paper_trades WHERE user_id = ? AND mode = ? ORDER BY opened_at DESC LIMIT 24")
    .bind(userId, mode === "shadow" ? "shadow" : "paper")
    .all();
  const trades = (tradeRows.results || []).map((row) => ({
    id: row.id,
    decisionId: row.decision_id,
    snapshotId: row.snapshot_id,
    mode: row.mode,
    symbol: row.symbol,
    optionSymbol: row.option_symbol,
    side: row.side,
    quantity: toInteger(row.quantity, 1),
    entryPrice: toNumber(row.entry_price, 0),
    entryUnderlyingPrice: toNumber(row.entry_underlying_price, 0),
    entryScore: toNumber(row.entry_score, 0),
    status: row.status,
    openedAt: row.opened_at,
    closedAt: row.closed_at,
    exitPrice: toNumber(row.exit_price, 0),
    pnl: row.pnl === null ? null : toNumber(row.pnl, 0),
    outcomeLabel: row.outcome_label || null,
  }));

  const summaryRow =
    await db
      .prepare(
        `SELECT
            COUNT(*) AS decision_count,
            AVG(ro.score) AS avg_score,
            AVG(CASE WHEN outcome_label = 'no_trade_win' THEN 1 ELSE 0 END) AS no_trade_win_rate,
            AVG(CASE WHEN rd.mode = 'shadow' THEN ro.score END) AS shadow_score
         FROM research_outcomes ro
         JOIN research_decisions rd ON rd.id = ro.decision_id
         WHERE ro.user_id = ?`,
      )
      .bind(userId)
      .first();

  const latestModel = await loadLatestModel(env, userId);
  const [modelVersions, featureManifests] = await Promise.all([
    listModelVersions(env, userId, 8),
    listFeatureManifests(env, userId),
  ]);
  const setups = [];
  for (const row of watchlist) {
    const watchSnapshot = await db.prepare("SELECT * FROM research_snapshots WHERE id = ?").bind(row.snapshotId).first();
    if (!watchSnapshot) continue;
    const optionRows = await db
      .prepare("SELECT * FROM research_option_quotes WHERE snapshot_id = ? ORDER BY strike ASC, contract_type ASC")
      .bind(row.snapshotId)
      .all();
    const replayDecision = computeReplayDecision(
      {
        id: watchSnapshot.id,
        symbol: watchSnapshot.symbol,
        expiration: watchSnapshot.expiration_date,
        snapshotAt: watchSnapshot.snapshot_at,
        quote: jsonParse(watchSnapshot.quote_json, {}),
        features: jsonParse(watchSnapshot.feature_json, {}),
        options: (optionRows.results || []).map((option) => ({
          optionSymbol: option.option_symbol,
          type: option.contract_type,
          strike: toNumber(option.strike, 0),
          expiration: option.expiration_date,
          bid: toNumber(option.bid, 0),
          ask: toNumber(option.ask, 0),
          lastPrice: toNumber(option.last, 0),
          mark: toNumber(option.mark, 0),
          volume: toInteger(option.volume, 0),
          openInterest: toInteger(option.open_interest, 0),
          impliedVolatility: toNumber(option.implied_volatility, 0),
          delta: toNumber(option.delta, 0),
          gamma: toNumber(option.gamma, 0),
          theta: toNumber(option.theta, 0),
          vega: toNumber(option.vega, 0),
        })),
      },
      latestModel,
    );
    setups.push({
      symbol: row.symbol,
      snapshotId: row.snapshotId,
      snapshotAt: row.snapshotAt,
      regime:
        replayDecision.features.intraday_range > 0.4
          ? "Stormy"
          : replayDecision.features.change_pct > 0.2
            ? "Risk-on"
            : replayDecision.features.change_pct < -0.2
              ? "Defensive"
              : "Balanced",
      decision: replayDecision.decision,
      probability: replayDecision.probability,
      score: replayDecision.score,
      engine: replayDecision.engine,
      optionSymbol: replayDecision.selectedOption?.optionSymbol || replayDecision.callOption?.optionSymbol || replayDecision.putOption?.optionSymbol || "",
      debit: replayDecision.selectedOption?.mark || 0,
    });
  }

  const paperPnl = trades.filter((trade) => trade.status === "closed").reduce((sum, trade) => sum + toNumber(trade.pnl, 0), 0);
  const events = await recentEvents(env, userId, selectedSymbol);
  return {
    watchlist,
    setups: setups.sort((left, right) => right.score - left.score),
    selectedSnapshot,
    latestDecision: latestDecision
      ? {
          id: latestDecision.id,
          snapshotId: latestDecision.snapshot_id,
          mode: latestDecision.mode,
          symbol: latestDecision.symbol,
          decision: latestDecision.decision,
          probability: toNumber(latestDecision.probability, 0),
          score: toNumber(latestDecision.score, 0),
          features: jsonParse(latestDecision.features_json, {}),
          rationale: jsonParse(latestDecision.rationale_json, {}),
          selectedOptionSymbol: latestDecision.selected_option_symbol,
        }
      : null,
    latestOutcome: latestOutcome
      ? {
          label: latestOutcome.outcome_label,
          score: toNumber(latestOutcome.score, 0),
          selectedReturn: latestOutcome.selected_return === null ? null : toNumber(latestOutcome.selected_return, 0),
          callReturn: latestOutcome.call_return === null ? null : toNumber(latestOutcome.call_return, 0),
          putReturn: latestOutcome.put_return === null ? null : toNumber(latestOutcome.put_return, 0),
          underlyingReturn:
            latestOutcome.underlying_return === null ? null : toNumber(latestOutcome.underlying_return, 0),
        }
      : null,
    trades,
    events,
    summary: {
      decisionCount: toInteger(summaryRow?.decision_count, 0),
      avgScore: summaryRow?.avg_score === null ? null : toNumber(summaryRow.avg_score, 0),
      noTradeWinRate: summaryRow?.no_trade_win_rate === null ? null : toNumber(summaryRow.no_trade_win_rate, 0),
      shadowScore: summaryRow?.shadow_score === null ? null : toNumber(summaryRow.shadow_score, 0),
      paperPnl: Number(paperPnl.toFixed(2)),
      openTrades: trades.filter((trade) => trade.status === "open").length,
      balance: Number((Number(initialBalance) + paperPnl).toFixed(2)),
      equityHistory: equityHistoryFromTrades(initialBalance, trades),
    },
    model: latestModel,
    modelVersions,
    featureManifests,
  };
}

export function researchFeatureKeys(value) {
  return parseFeatureKeys(value);
}

export async function loadInitialBalance(env, userId) {
  const row = await requireDb(env)
    .prepare("SELECT state_json FROM game_state WHERE user_id = ?")
    .bind(userId)
    .first();
  const state = jsonParse(row?.state_json, {});
  return toNumber(state?.cockpit?.initialBalance, 10000);
}
