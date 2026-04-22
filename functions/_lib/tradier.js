import { randomBase64Url } from "./encoding.js";
import { audit, requireDb } from "./db.js";
import { decryptSecret, encryptSecret } from "./crypto_box.js";
import { json, maskAccountId, nowIso } from "./http.js";

const BASE_URLS = {
  sandbox: "https://sandbox.tradier.com/v1",
  live: "https://api.tradier.com/v1",
};

const EQUITY_SIDES = new Set(["buy", "sell", "buy_to_cover", "sell_short"]);
const OPTION_SIDES = new Set(["buy_to_open", "buy_to_close", "sell_to_open", "sell_to_close"]);
const DURATIONS = new Set(["day", "gtc"]);

function positiveInteger(value, fallback = 1) {
  const number = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function positiveMoney(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) {
    return null;
  }
  return Number(number.toFixed(2));
}

export function cleanSymbol(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, "")
    .slice(0, 24);
}

export function isOccOptionSymbol(value) {
  return /^[A-Z]{1,6}\d{6}[CP]\d{8}$/.test(String(value || "").trim().toUpperCase());
}

export function validateOrderInput(input, env, { placement = false } = {}) {
  const assetClass = String(input?.asset_class || "equity").toLowerCase();
  const side = String(input?.side || "").toLowerCase();
  const orderType = String(input?.type || "limit").toLowerCase();
  const duration = String(input?.duration || "day").toLowerCase();
  const quantity = positiveInteger(input?.quantity, 1);
  const maxQuantity = positiveInteger(env.MAX_ORDER_QUANTITY, 10);
  const maxNotional = Number(env.MAX_NOTIONAL_USD || 5000);
  const limitPrice = positiveMoney(input?.limit_price ?? input?.price);
  const symbol = cleanSymbol(input?.symbol);
  const optionSymbol = cleanSymbol(input?.option_symbol);

  if (assetClass !== "equity" && assetClass !== "option") {
    return { ok: false, error: "asset_class must be equity or option." };
  }
  if (!symbol) {
    return { ok: false, error: "symbol is required." };
  }
  if (assetClass === "equity" && !EQUITY_SIDES.has(side)) {
    return { ok: false, error: "Unsupported equity side." };
  }
  if (assetClass === "option") {
    if (!OPTION_SIDES.has(side)) {
      return { ok: false, error: "Unsupported option side." };
    }
    if (!isOccOptionSymbol(optionSymbol)) {
      return { ok: false, error: "option_symbol must be a valid OCC option symbol." };
    }
  }
  if (placement && orderType !== "limit") {
    return { ok: false, error: "Order placement is limit-only." };
  }
  if (orderType !== "limit" && orderType !== "market") {
    return { ok: false, error: "Only limit and market order previews are supported." };
  }
  if (orderType === "limit" && !limitPrice) {
    return { ok: false, error: "A positive limit_price is required for limit orders." };
  }
  if (!DURATIONS.has(duration)) {
    return { ok: false, error: "duration must be day or gtc." };
  }
  if (quantity > maxQuantity) {
    return { ok: false, error: `Quantity exceeds the ${maxQuantity} contract/share cap.` };
  }
  if (limitPrice && Number.isFinite(maxNotional) && quantity * limitPrice * (assetClass === "option" ? 100 : 1) > maxNotional) {
    return { ok: false, error: `Estimated notional exceeds the $${maxNotional} cap.` };
  }

  return {
    ok: true,
    order: {
      asset_class: assetClass,
      symbol,
      option_symbol: assetClass === "option" ? optionSymbol : null,
      side,
      quantity,
      type: orderType,
      duration,
      limit_price: limitPrice,
    },
  };
}

export async function saveTradierAccount(env, userId, settings) {
  const mode = settings.mode === "live" ? "live" : "sandbox";
  const accountId = String(settings.account_id || "").trim();
  const token = String(settings.access_token || "").trim();
  if (!accountId || !token) {
    return { ok: false, error: "access_token and account_id are required." };
  }
  const encrypted = await encryptSecret(env, token, `tradier:${userId}:${accountId}`);
  await requireDb(env)
    .prepare(
      "INSERT OR REPLACE INTO tradier_accounts (user_id, encrypted_token, token_iv, account_id, mode, live_trading_enabled, updated_at) VALUES (?, ?, ?, ?, ?, COALESCE((SELECT live_trading_enabled FROM tradier_accounts WHERE user_id = ?), 0), ?)",
    )
    .bind(userId, encrypted.encrypted, encrypted.iv, accountId, mode, userId, nowIso())
    .run();
  await audit(env, userId, "tradier.connected", { mode, account: maskAccountId(accountId) });
  return { ok: true, mode, account_id_masked: maskAccountId(accountId) };
}

export async function loadTradierAccount(env, userId) {
  const row = await requireDb(env)
    .prepare("SELECT * FROM tradier_accounts WHERE user_id = ?")
    .bind(userId)
    .first();
  if (!row) {
    return null;
  }
  const accessToken = await decryptSecret(
    env,
    row.encrypted_token,
    row.token_iv,
    `tradier:${userId}:${row.account_id}`,
  );
  return {
    account_id: row.account_id,
    account_id_masked: maskAccountId(row.account_id),
    access_token: accessToken,
    mode: row.mode === "live" ? "live" : "sandbox",
    live_trading_enabled: Boolean(row.live_trading_enabled),
    updated_at: row.updated_at,
  };
}

export async function setLiveTradingEnabled(env, userId, enabled) {
  await requireDb(env)
    .prepare("UPDATE tradier_accounts SET live_trading_enabled = ?, updated_at = ? WHERE user_id = ?")
    .bind(enabled ? 1 : 0, nowIso(), userId)
    .run();
  await audit(env, userId, enabled ? "tradier.live_armed" : "tradier.live_disarmed", {});
}

export function tradierStatus(account) {
  if (!account) {
    return { configured: false };
  }
  return {
    configured: true,
    mode: account.mode,
    account_id_masked: account.account_id_masked,
    live_trading_enabled: account.live_trading_enabled,
    updated_at: account.updated_at,
  };
}

export async function tradierRequest(account, path, { method = "GET", form = null } = {}) {
  const url = `${BASE_URLS[account.mode]}${path}`;
  const headers = {
    Accept: "application/json",
    Authorization: `Bearer ${account.access_token}`,
  };
  let body;
  if (form) {
    headers["Content-Type"] = "application/x-www-form-urlencoded";
    body = new URLSearchParams(form).toString();
  }
  const response = await fetch(url, { method, headers, body });
  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }
  if (!response.ok) {
    const message =
      payload?.fault?.faultstring ||
      payload?.errors?.error ||
      payload?.error ||
      payload?.message ||
      `Tradier request failed with status ${response.status}.`;
    const error = new Error(Array.isArray(message) ? message.join("; ") : String(message));
    error.status = response.status;
    error.payload = payload;
    throw error;
  }
  return payload;
}

export async function submitTradierOrder(env, userId, account, order, preview) {
  const form = {
    class: order.asset_class,
    symbol: order.symbol,
    side: order.side,
    quantity: String(order.quantity),
    type: order.type,
    duration: order.duration,
    preview: preview ? "true" : "false",
  };
  if (order.type === "limit") {
    form.price = String(order.limit_price);
  }
  if (order.asset_class === "option") {
    form.option_symbol = order.option_symbol;
  }

  const intentId = randomBase64Url(18);
  let payload;
  let status = "submitted";
  try {
    payload = await tradierRequest(account, `/accounts/${encodeURIComponent(account.account_id)}/orders`, {
      method: "POST",
      form,
    });
  } catch (error) {
    status = "failed";
    payload = {
      error: String(error.message || error),
      status: error.status || null,
      payload: error.payload || null,
    };
  }

  await requireDb(env)
    .prepare(
      "INSERT INTO trade_intents (id, user_id, asset_class, symbol, option_symbol, side, quantity, order_type, duration, limit_price, preview, status, request_json, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(
      intentId,
      userId,
      order.asset_class,
      order.symbol,
      order.option_symbol,
      order.side,
      order.quantity,
      order.type,
      order.duration,
      order.limit_price,
      preview ? 1 : 0,
      status,
      JSON.stringify({ ...order, token: "[redacted]" }),
      JSON.stringify(payload),
      nowIso(),
    )
    .run();

  await audit(env, userId, preview ? "tradier.order_preview" : "tradier.order_place", {
    intent_id: intentId,
    status,
    mode: account.mode,
    asset_class: order.asset_class,
    symbol: order.symbol,
  });

  if (status === "failed") {
    return json({ ok: false, error: payload.error, intent_id: intentId, broker: payload }, 502);
  }
  return json({ ok: true, preview, intent_id: intentId, broker: payload });
}
