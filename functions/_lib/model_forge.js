import { randomBase64Url } from "./encoding.js";
import { audit, requireDb } from "./db.js";
import { nowIso } from "./http.js";
import { parseStoredModel, predictWithWeights, trainLogisticModel } from "./model.js";

const FEATURE_KEYS = ["change_pct", "intraday_range", "atm_iv", "liquidity", "call_put_skew"];
const DEFAULT_PIPELINE_FEATURES = ["change_pct", "intraday_range", "atm_iv", "liquidity"];

const SYSTEM_FEATURE_MANIFESTS = [
  {
    slug: "core-default-pack",
    name: "Core Default Pack",
    description: "Starter directional signals for price change, intraday range, implied volatility, liquidity, and skew.",
    featureKeys: FEATURE_KEYS,
    supportsTraining: true,
    manifest: {
      lane: "starter",
      author: "Cumulonimbus",
      summary: "The default pack every new model starts from.",
      planned_features: ["earnings_flag", "macro_regime_tag"],
      import_behavior: "merge",
    },
  },
  {
    slug: "liquidity-guard-pack",
    name: "Liquidity Guard Pack",
    description: "A leaner pack that emphasizes liquidity discipline before the model reaches for extra directional confidence.",
    featureKeys: ["liquidity", "atm_iv", "intraday_range"],
    supportsTraining: true,
    manifest: {
      lane: "risk",
      author: "Cumulonimbus",
      summary: "Prioritize spreads, open interest, and vol pressure before taking the trade.",
      planned_features: ["spread_pct", "nbbo_stability"],
      import_behavior: "merge",
    },
  },
  {
    slug: "volatility-surface-pack",
    name: "Volatility Surface Pack",
    description: "A community-style pack for users who want to pressure-test IV and skew combinations before adding richer surface data.",
    featureKeys: ["atm_iv", "call_put_skew", "change_pct"],
    supportsTraining: true,
    manifest: {
      lane: "community",
      author: "Open Model Lane",
      summary: "Prototype lane for traders who want to fork the core pack and lean into vol structure.",
      planned_features: ["term_structure", "surface_curvature"],
      import_behavior: "merge",
    },
  },
];

const STARTER_ROWS = [
  { created_at: "2026-04-10T14:30:00.000Z", change_pct: 0.62, intraday_range: 0.16, atm_iv: -0.26, liquidity: 0.72, call_put_skew: 0.33, label: 1, price: 511.2 },
  { created_at: "2026-04-11T14:30:00.000Z", change_pct: 0.55, intraday_range: 0.21, atm_iv: -0.18, liquidity: 0.67, call_put_skew: 0.25, label: 1, price: 514.8 },
  { created_at: "2026-04-14T14:30:00.000Z", change_pct: -0.48, intraday_range: 0.37, atm_iv: 0.29, liquidity: 0.34, call_put_skew: -0.31, label: 0, price: 506.5 },
  { created_at: "2026-04-15T14:30:00.000Z", change_pct: -0.52, intraday_range: 0.34, atm_iv: 0.25, liquidity: 0.42, call_put_skew: -0.28, label: 0, price: 502.1 },
  { created_at: "2026-04-16T14:30:00.000Z", change_pct: 0.41, intraday_range: 0.1, atm_iv: -0.29, liquidity: 0.68, call_put_skew: 0.21, label: 1, price: 508.7 },
  { created_at: "2026-04-17T14:30:00.000Z", change_pct: -0.37, intraday_range: 0.31, atm_iv: 0.22, liquidity: 0.28, call_put_skew: -0.17, label: 0, price: 504.3 },
  { created_at: "2026-04-21T14:30:00.000Z", change_pct: 0.35, intraday_range: 0.18, atm_iv: -0.14, liquidity: 0.55, call_put_skew: 0.19, label: 1, price: 510.6 },
  { created_at: "2026-04-22T14:30:00.000Z", change_pct: -0.33, intraday_range: 0.28, atm_iv: 0.17, liquidity: 0.36, call_put_skew: -0.11, label: 0, price: 505.9 },
  { created_at: "2026-04-23T14:30:00.000Z", change_pct: 0.48, intraday_range: 0.14, atm_iv: -0.21, liquidity: 0.7, call_put_skew: 0.29, label: 1, price: 512.4 },
  { created_at: "2026-04-24T14:30:00.000Z", change_pct: -0.21, intraday_range: 0.24, atm_iv: 0.1, liquidity: 0.46, call_put_skew: -0.08, label: 0, price: 509.1 },
  { created_at: "2026-04-28T14:30:00.000Z", change_pct: 0.31, intraday_range: 0.12, atm_iv: -0.17, liquidity: 0.62, call_put_skew: 0.16, label: 1, price: 515.7 },
  { created_at: "2026-04-29T14:30:00.000Z", change_pct: -0.27, intraday_range: 0.26, atm_iv: 0.15, liquidity: 0.39, call_put_skew: -0.13, label: 0, price: 511.4 },
];

function parseJson(value, fallback = null) {
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeFeatureKeys(value) {
  const requested = Array.isArray(value) ? value.map((item) => String(item || "")) : [];
  const unique = [];
  for (const feature of requested) {
    if (FEATURE_KEYS.includes(feature) && !unique.includes(feature)) {
      unique.push(feature);
    }
  }
  return unique;
}

function occOptionSymbol(symbol, expirationDate, type, strike) {
  const compactDate = String(expirationDate || "").replaceAll("-", "").slice(2);
  const strikeCode = String(Math.round(Number(strike) * 1000)).padStart(8, "0");
  return `${symbol}${compactDate}${type === "put" ? "P" : "C"}${strikeCode}`;
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function optionRowsForSnapshot(symbol, expirationDate, price, createdAt) {
  const offsets = [-6, -3, 0, 3, 6];
  return offsets.flatMap((offset) => {
    const strike = Number((price + offset).toFixed(0));
    const callMark = Number((Math.max(0.55, 2.8 - Math.abs(offset) * 0.22) + Math.max(0, offset) * 0.02).toFixed(2));
    const putMark = Number((Math.max(0.55, 2.7 - Math.abs(offset) * 0.22) + Math.max(0, -offset) * 0.02).toFixed(2));
    const baseOi = 780 - Math.abs(offset) * 70;
    return [
      {
        id: randomBase64Url(18),
        optionSymbol: occOptionSymbol(symbol, expirationDate, "call", strike),
        type: "call",
        strike,
        expiration: expirationDate,
        bid: Number(Math.max(0.05, callMark - 0.08).toFixed(2)),
        ask: Number((callMark + 0.08).toFixed(2)),
        last: callMark,
        mark: callMark,
        volume: Math.max(18, 120 - Math.abs(offset) * 10),
        openInterest: Math.max(60, baseOi),
        impliedVolatility: Number((0.23 + Math.abs(offset) * 0.01).toFixed(4)),
        delta: Number((0.58 - offset * 0.04).toFixed(3)),
        gamma: Number((0.043 - Math.abs(offset) * 0.003).toFixed(3)),
        theta: Number((-0.024 - Math.abs(offset) * 0.002).toFixed(3)),
        vega: Number((0.11 - Math.abs(offset) * 0.004).toFixed(3)),
        createdAt,
      },
      {
        id: randomBase64Url(18),
        optionSymbol: occOptionSymbol(symbol, expirationDate, "put", strike),
        type: "put",
        strike,
        expiration: expirationDate,
        bid: Number(Math.max(0.05, putMark - 0.08).toFixed(2)),
        ask: Number((putMark + 0.08).toFixed(2)),
        last: putMark,
        mark: putMark,
        volume: Math.max(18, 110 - Math.abs(offset) * 9),
        openInterest: Math.max(60, baseOi - 20),
        impliedVolatility: Number((0.24 + Math.abs(offset) * 0.011).toFixed(4)),
        delta: Number((-0.58 - offset * 0.04).toFixed(3)),
        gamma: Number((0.041 - Math.abs(offset) * 0.003).toFixed(3)),
        theta: Number((-0.023 - Math.abs(offset) * 0.002).toFixed(3)),
        vega: Number((0.108 - Math.abs(offset) * 0.004).toFixed(3)),
        createdAt,
      },
    ];
  });
}

function latestSnapshotTemplates() {
  return [
    {
      symbol: "SPY",
      price: 518.46,
      prevclose: 514.8,
      high: 519.9,
      low: 513.8,
      open: 515.3,
      volume: 84210000,
      averageVolume: 91100000,
      changePercent: 0.71,
      sector: "ETF",
      snapshotAt: "2026-05-01T19:55:00.000Z",
      expirationDate: "2026-05-15",
      features: { change_pct: 0.44, intraday_range: 0.19, atm_iv: -0.12, liquidity: 0.68, call_put_skew: 0.21 },
    },
    {
      symbol: "QQQ",
      price: 443.12,
      prevclose: 439.24,
      high: 444.3,
      low: 437.8,
      open: 439.7,
      volume: 38100000,
      averageVolume: 40200000,
      changePercent: 0.88,
      sector: "ETF",
      snapshotAt: "2026-05-01T19:54:00.000Z",
      expirationDate: "2026-05-15",
      features: { change_pct: 0.49, intraday_range: 0.17, atm_iv: -0.16, liquidity: 0.63, call_put_skew: 0.18 },
    },
    {
      symbol: "NVDA",
      price: 121.9,
      prevclose: 124.1,
      high: 124.7,
      low: 120.8,
      open: 123.8,
      volume: 61200000,
      averageVolume: 58900000,
      changePercent: -1.77,
      sector: "Equity",
      snapshotAt: "2026-05-01T19:53:00.000Z",
      expirationDate: "2026-05-16",
      features: { change_pct: -0.44, intraday_range: 0.25, atm_iv: 0.11, liquidity: 0.59, call_put_skew: -0.14 },
    },
    {
      symbol: "TSLA",
      price: 198.3,
      prevclose: 201.5,
      high: 202.8,
      low: 196.9,
      open: 201.1,
      volume: 73400000,
      averageVolume: 78500000,
      changePercent: -1.59,
      sector: "Equity",
      snapshotAt: "2026-05-01T19:52:00.000Z",
      expirationDate: "2026-05-16",
      features: { change_pct: -0.4, intraday_range: 0.27, atm_iv: 0.15, liquidity: 0.52, call_put_skew: -0.19 },
    },
    {
      symbol: "AAPL",
      price: 214.84,
      prevclose: 213.48,
      high: 216.1,
      low: 212.9,
      open: 213.9,
      volume: 52100000,
      averageVolume: 55000000,
      changePercent: 0.64,
      sector: "Equity",
      snapshotAt: "2026-05-01T19:51:00.000Z",
      expirationDate: "2026-05-16",
      features: { change_pct: 0.38, intraday_range: 0.12, atm_iv: -0.09, liquidity: 0.61, call_put_skew: 0.11 },
    },
  ];
}

function publicManifest(row) {
  const featureKeys = normalizeFeatureKeys(parseJson(row.feature_keys_json, []));
  const manifest = parseJson(row.manifest_json, {}) || {};
  return {
    id: row.id,
    slug: row.slug,
    scope: row.scope,
    name: row.name,
    description: row.description,
    featureKeys,
    imported: Boolean(row.imported_at),
    importedAt: row.imported_at || null,
    supportsTraining: Boolean(Number(row.supports_training || 0)),
    isPublic: Boolean(Number(row.is_public || 0)),
    status: row.import_status || (row.imported_at ? "active" : "available"),
    ownerUserId: row.owner_user_id || null,
    manifest,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function modelVersionFromRow(row, versionNumber, total) {
  const parsed = parseStoredModel(row);
  return {
    ...parsed,
    version: `v${versionNumber}`,
    versionNumber,
    featureCount: Array.isArray(parsed?.features) ? parsed.features.length : 0,
    isCurrent: versionNumber === total,
  };
}

function defaultGameState(defaultManifestId = null) {
  return {
    last_symbol: "SPY",
    cockpit: {
      initialBalance: 10000,
      paperMode: "paper",
      pipeline: {
        architecture: "Replay Logistic",
        architectureType: "Walk-forward",
        optimizer: "Gradient Descent",
        features: DEFAULT_PIPELINE_FEATURES,
        importedManifestIds: defaultManifestId ? [defaultManifestId] : [],
      },
    },
  };
}

async function countUserRows(env, userId, tableName) {
  const row = await requireDb(env)
    .prepare(`SELECT COUNT(*) AS count FROM ${tableName} WHERE user_id = ?`)
    .bind(userId)
    .first();
  return Number(row?.count || 0);
}

async function upsertGameStateForManifest(env, userId, manifestId, manifestFeatureKeys) {
  const db = requireDb(env);
  const existing = await db.prepare("SELECT state_json FROM game_state WHERE user_id = ?").bind(userId).first();
  const baseState = parseJson(existing?.state_json, defaultGameState()) || defaultGameState();
  const pipeline = baseState?.cockpit?.pipeline && typeof baseState.cockpit.pipeline === "object"
    ? baseState.cockpit.pipeline
    : defaultGameState().cockpit.pipeline;
  const mergedFeatures = [
    ...normalizeFeatureKeys(pipeline.features),
    ...normalizeFeatureKeys(manifestFeatureKeys),
  ].filter((feature, index, list) => list.indexOf(feature) === index);
  const importedManifestIds = Array.isArray(pipeline.importedManifestIds)
    ? pipeline.importedManifestIds.map((item) => String(item || "")).filter(Boolean)
    : [];
  if (manifestId && !importedManifestIds.includes(manifestId)) {
    importedManifestIds.push(manifestId);
  }
  const nextState = {
    ...baseState,
    last_symbol: String(baseState.last_symbol || "SPY"),
    cockpit: {
      ...(baseState.cockpit || {}),
      initialBalance: Number(baseState?.cockpit?.initialBalance || 10000),
      paperMode: baseState?.cockpit?.paperMode === "shadow" ? "shadow" : "paper",
      pipeline: {
        architecture: String(pipeline.architecture || "Replay Logistic"),
        architectureType: String(pipeline.architectureType || "Walk-forward"),
        optimizer: String(pipeline.optimizer || "Gradient Descent"),
        features: mergedFeatures.length ? mergedFeatures : DEFAULT_PIPELINE_FEATURES,
        importedManifestIds,
      },
    },
  };
  await db
    .prepare("INSERT OR REPLACE INTO game_state (user_id, state_json, updated_at) VALUES (?, ?, ?)")
    .bind(userId, JSON.stringify(nextState), nowIso())
    .run();
}

export function buildVersionTimeline(rows) {
  const ordered = [...rows].sort((left, right) =>
    String(left.created_at || left.updated_at).localeCompare(String(right.created_at || right.updated_at)),
  );
  const total = ordered.length;
  return ordered.map((row, index) => modelVersionFromRow(row, index + 1, total)).reverse();
}

export function systemFeatureManifestTemplates() {
  return SYSTEM_FEATURE_MANIFESTS.map((manifest) => deepClone(manifest));
}

export async function ensureSystemFeatureManifests(env) {
  const db = requireDb(env);
  for (const template of SYSTEM_FEATURE_MANIFESTS) {
    const now = nowIso();
    const existing = await db
      .prepare("SELECT id FROM feature_manifests WHERE slug = ? LIMIT 1")
      .bind(template.slug)
      .first();
    if (existing?.id) {
      continue;
    }
    await db
      .prepare(
        `INSERT INTO feature_manifests
          (id, slug, owner_user_id, scope, name, description, feature_keys_json, manifest_json, is_public, supports_training, created_at, updated_at)
         VALUES (?, ?, NULL, 'system', ?, ?, ?, ?, 1, ?, ?, ?)`,
      )
      .bind(
        randomBase64Url(18),
        template.slug,
        template.name,
        template.description,
        JSON.stringify(template.featureKeys),
        JSON.stringify(template.manifest),
        template.supportsTraining ? 1 : 0,
        now,
        now,
      )
      .run();
  }
}

export async function listFeatureManifests(env, userId) {
  const rows = await requireDb(env)
    .prepare(
      `SELECT
         fm.*,
         ufmi.status AS import_status,
         ufmi.imported_at
       FROM feature_manifests fm
       LEFT JOIN user_feature_manifest_imports ufmi
         ON ufmi.manifest_id = fm.id
        AND ufmi.user_id = ?
        AND ufmi.status = 'active'
       WHERE fm.scope = 'system'
          OR fm.owner_user_id = ?
          OR fm.is_public = 1
       ORDER BY
         CASE WHEN ufmi.imported_at IS NOT NULL THEN 0 ELSE 1 END,
         CASE WHEN fm.scope = 'system' THEN 0 ELSE 1 END,
         fm.updated_at DESC`,
    )
    .bind(userId, userId)
    .all();
  return (rows.results || []).map(publicManifest);
}

export async function importFeatureManifest(env, userId, manifestId) {
  const db = requireDb(env);
  const manifest = await db
    .prepare(
      `SELECT *
       FROM feature_manifests
       WHERE id = ?
         AND (scope = 'system' OR owner_user_id = ? OR is_public = 1)`,
    )
    .bind(String(manifestId || ""), userId)
    .first();
  if (!manifest) {
    throw new Error("Feature manifest not found.");
  }
  const importedAt = nowIso();
  await db
    .prepare(
      `INSERT OR IGNORE INTO user_feature_manifest_imports
        (id, user_id, manifest_id, status, notes, imported_at)
       VALUES (?, ?, ?, 'active', NULL, ?)`,
    )
    .bind(randomBase64Url(18), userId, manifest.id, importedAt)
    .run();
  await upsertGameStateForManifest(env, userId, manifest.id, parseJson(manifest.feature_keys_json, []));
  await audit(env, userId, "model.manifest_imported", { manifest_id: manifest.id, slug: manifest.slug });
  const manifests = await listFeatureManifests(env, userId);
  return manifests.find((item) => item.id === manifest.id) || null;
}

export async function listModelVersions(env, userId, limit = 8) {
  const rows = await requireDb(env)
    .prepare("SELECT * FROM models WHERE user_id = ? ORDER BY created_at ASC")
    .bind(userId)
    .all();
  return buildVersionTimeline(rows.results || []).slice(0, limit);
}

export async function seedStarterModelHistory(env, userId, displayName = "Trader") {
  await ensureSystemFeatureManifests(env);
  const [snapshotCount, modelCount] = await Promise.all([
    countUserRows(env, userId, "research_snapshots"),
    countUserRows(env, userId, "models"),
  ]);
  if (snapshotCount > 0 || modelCount > 0) {
    return false;
  }

  const db = requireDb(env);
  const defaultManifest = await db
    .prepare("SELECT * FROM feature_manifests WHERE slug = 'core-default-pack' LIMIT 1")
    .first();
  const seedNow = nowIso();
  const historicalSnapshotIds = [];
  const latestSnapshots = latestSnapshotTemplates();

  for (let index = 0; index < STARTER_ROWS.length; index += 1) {
    const row = STARTER_ROWS[index];
    const snapshotId = randomBase64Url(18);
    historicalSnapshotIds.push(snapshotId);
    const quote = {
      symbol: "SPY",
      price: row.price,
      bid: Number((row.price - 0.05).toFixed(2)),
      ask: Number((row.price + 0.05).toFixed(2)),
      open: Number((row.price - row.change_pct * 3.5).toFixed(2)),
      high: Number((row.price + 1.8).toFixed(2)),
      low: Number((row.price - 1.7).toFixed(2)),
      prevclose: Number((row.price / (1 + row.change_pct / 100)).toFixed(2)),
      volume: 60200000 + index * 850000,
      averageVolume: 73800000,
      changePercent: Number((row.change_pct * 3.4).toFixed(2)),
      sector: "ETF",
      snapshotAt: row.created_at,
    };
    await db
      .prepare(
        "INSERT INTO research_snapshots (id, user_id, symbol, expiration_date, snapshot_at, quote_json, feature_json, created_at) VALUES (?, ?, 'SPY', ?, ?, ?, ?, ?)",
      )
      .bind(
        snapshotId,
        userId,
        "2026-05-15",
        row.created_at,
        JSON.stringify(quote),
        JSON.stringify({
          change_pct: row.change_pct,
          intraday_range: row.intraday_range,
          atm_iv: row.atm_iv,
          liquidity: row.liquidity,
          call_put_skew: row.call_put_skew,
        }),
        row.created_at,
      )
      .run();
  }

  for (const template of latestSnapshots) {
    const snapshotId = randomBase64Url(18);
    await db
      .prepare(
        "INSERT INTO research_snapshots (id, user_id, symbol, expiration_date, snapshot_at, quote_json, feature_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        snapshotId,
        userId,
        template.symbol,
        template.expirationDate,
        template.snapshotAt,
        JSON.stringify({
          symbol: template.symbol,
          price: template.price,
          bid: Number((template.price - 0.05).toFixed(2)),
          ask: Number((template.price + 0.05).toFixed(2)),
          open: template.open,
          high: template.high,
          low: template.low,
          prevclose: template.prevclose,
          volume: template.volume,
          averageVolume: template.averageVolume,
          changePercent: template.changePercent,
          sector: template.sector,
          snapshotAt: template.snapshotAt,
        }),
        JSON.stringify(template.features),
        template.snapshotAt,
      )
      .run();

    const optionRows = optionRowsForSnapshot(template.symbol, template.expirationDate, template.price, template.snapshotAt);
    for (const option of optionRows) {
      await db
        .prepare(
          "INSERT INTO research_option_quotes (id, snapshot_id, option_symbol, contract_type, strike, expiration_date, bid, ask, last, mark, volume, open_interest, implied_volatility, delta, gamma, theta, vega, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          option.id,
          snapshotId,
          option.optionSymbol,
          option.type,
          option.strike,
          option.expiration,
          option.bid,
          option.ask,
          option.last,
          option.mark,
          option.volume,
          option.openInterest,
          option.impliedVolatility,
          option.delta,
          option.gamma,
          option.theta,
          option.vega,
          option.createdAt,
        )
        .run();
    }

    template.snapshotId = snapshotId;
    template.options = optionRows;
  }

  for (let index = 0; index < STARTER_ROWS.length - 1; index += 1) {
    const row = STARTER_ROWS[index];
    const entrySnapshotId = historicalSnapshotIds[index];
    const exitSnapshotId = historicalSnapshotIds[index + 1];
    const decisionId = randomBase64Url(18);
    const callStrike = Number((row.price + 2).toFixed(0));
    const putStrike = Number((row.price - 2).toFixed(0));
    const expirationDate = "2026-05-15";
    const callSymbol = occOptionSymbol("SPY", expirationDate, "call", callStrike);
    const putSymbol = occOptionSymbol("SPY", expirationDate, "put", putStrike);
    const probability = row.label === 1 ? 0.66 : 0.34;
    const score = 0.69 + (index % 3) * 0.04;
    const decisionType = row.label === 1 ? "call" : "put";
    await db
      .prepare(
        "INSERT INTO research_decisions (id, user_id, snapshot_id, model_id, mode, symbol, decision, probability, score, selected_option_symbol, selected_contract_type, selected_entry_mark, call_option_symbol, call_entry_mark, put_option_symbol, put_entry_mark, underlying_entry_price, features_json, rationale_json, created_at, resolved_at) VALUES (?, ?, ?, NULL, 'paper', 'SPY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        decisionId,
        userId,
        entrySnapshotId,
        decisionType,
        probability,
        Number(score.toFixed(4)),
        decisionType === "call" ? callSymbol : putSymbol,
        decisionType,
        1.28,
        callSymbol,
        1.24,
        putSymbol,
        1.19,
        row.price,
        JSON.stringify({
          change_pct: row.change_pct,
          intraday_range: row.intraday_range,
          atm_iv: row.atm_iv,
          liquidity: row.liquidity,
          call_put_skew: row.call_put_skew,
        }),
        JSON.stringify({
          engine: "seeded_demo",
          seeded: true,
          selectedOptionSymbol: decisionType === "call" ? callSymbol : putSymbol,
        }),
        row.created_at,
        STARTER_ROWS[index + 1].created_at,
      )
      .run();

    const selectedReturn = row.label === 1 ? 0.19 : 0.17;
    await db
      .prepare(
        "INSERT INTO research_outcomes (id, decision_id, user_id, entry_snapshot_id, exit_snapshot_id, outcome_label, selected_return, call_return, put_return, underlying_return, score, horizon_minutes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        randomBase64Url(18),
        decisionId,
        userId,
        entrySnapshotId,
        exitSnapshotId,
        row.label === 1 ? "call_win" : "put_win",
        selectedReturn,
        row.label === 1 ? 0.19 : -0.11,
        row.label === 1 ? -0.09 : 0.17,
        row.label === 1 ? 0.013 : -0.011,
        Number((0.73 + (index % 4) * 0.04).toFixed(4)),
        1440,
        STARTER_ROWS[index + 1].created_at,
      )
      .run();

    if (index < 3) {
      const pnl = Number((((selectedReturn * 1.28) * 100)).toFixed(2));
      await db
        .prepare(
          "INSERT INTO research_paper_trades (id, user_id, decision_id, snapshot_id, mode, symbol, option_symbol, side, quantity, entry_price, entry_underlying_price, entry_score, status, opened_at, closed_at, exit_snapshot_id, exit_price, pnl, outcome_label) VALUES (?, ?, ?, ?, 'paper', 'SPY', ?, ?, 1, ?, ?, ?, 'closed', ?, ?, ?, ?, ?, ?)",
        )
        .bind(
          randomBase64Url(18),
          userId,
          decisionId,
          entrySnapshotId,
          decisionType === "call" ? callSymbol : putSymbol,
          decisionType,
          1.28,
          row.price,
          Number(score.toFixed(4)),
          row.created_at,
          STARTER_ROWS[index + 1].created_at,
          exitSnapshotId,
          Number((1.28 * (1 + selectedReturn)).toFixed(2)),
          pnl,
          pnl >= 0 ? "win" : "loss",
        )
        .run();
    }
  }

  const noTradeDecisionId = randomBase64Url(18);
  await db
    .prepare(
      "INSERT INTO research_decisions (id, user_id, snapshot_id, model_id, mode, symbol, decision, probability, score, selected_option_symbol, selected_contract_type, selected_entry_mark, call_option_symbol, call_entry_mark, put_option_symbol, put_entry_mark, underlying_entry_price, features_json, rationale_json, created_at, resolved_at) VALUES (?, ?, ?, NULL, 'shadow', 'SPY', 'no_trade', ?, ?, NULL, NULL, NULL, NULL, NULL, NULL, NULL, ?, ?, ?, ?, ?)",
    )
    .bind(
      noTradeDecisionId,
      userId,
      historicalSnapshotIds[9],
      0.51,
      0.64,
      STARTER_ROWS[9].price,
      JSON.stringify({
        change_pct: STARTER_ROWS[9].change_pct,
        intraday_range: STARTER_ROWS[9].intraday_range,
        atm_iv: STARTER_ROWS[9].atm_iv,
        liquidity: STARTER_ROWS[9].liquidity,
        call_put_skew: STARTER_ROWS[9].call_put_skew,
      }),
      JSON.stringify({ engine: "seeded_demo", noTradePressure: 0.71, seeded: true }),
      STARTER_ROWS[9].created_at,
      STARTER_ROWS[10].created_at,
    )
    .run();
  await db
    .prepare(
      "INSERT INTO research_outcomes (id, decision_id, user_id, entry_snapshot_id, exit_snapshot_id, outcome_label, selected_return, call_return, put_return, underlying_return, score, horizon_minutes, created_at) VALUES (?, ?, ?, ?, ?, 'no_trade_win', NULL, 0.03, -0.01, 0.002, 0.92, 1440, ?)",
    )
    .bind(
      randomBase64Url(18),
      noTradeDecisionId,
      userId,
      historicalSnapshotIds[9],
      historicalSnapshotIds[10],
      STARTER_ROWS[10].created_at,
    )
    .run();

  const versionConfigs = [
    { name: `${displayName}'s Replay Model`, featureKeys: ["change_pct", "intraday_range", "atm_iv", "liquidity"], rows: STARTER_ROWS.slice(0, 8), createdAt: "2026-04-22T18:30:00.000Z" },
    { name: `${displayName}'s Replay Model`, featureKeys: FEATURE_KEYS, rows: STARTER_ROWS.slice(0, 10), createdAt: "2026-04-26T18:45:00.000Z" },
    { name: `${displayName}'s Replay Model`, featureKeys: FEATURE_KEYS, rows: STARTER_ROWS, createdAt: "2026-05-01T20:00:00.000Z" },
  ];
  const models = [];
  for (const config of versionConfigs) {
    const trained = trainLogisticModel(config.rows, { featureKeys: config.featureKeys });
    const modelId = randomBase64Url(18);
    await db
      .prepare(
        "INSERT INTO models (id, user_id, name, kind, weights_json, metrics_json, features_json, training_rows, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        modelId,
        userId,
        config.name,
        trained.kind,
        JSON.stringify({ ...trained.weights, bias: trained.bias }),
        JSON.stringify(trained.metrics),
        JSON.stringify(trained.features),
        trained.metrics.training_rows,
        config.createdAt,
        config.createdAt,
      )
      .run();
    models.push({
      id: modelId,
      name: config.name,
      kind: trained.kind,
      weights: trained.weights,
      bias: trained.bias,
      features: trained.features,
      metrics: trained.metrics,
    });
  }

  const spyTemplate = latestSnapshots.find((item) => item.symbol === "SPY");
  if (spyTemplate?.snapshotId && spyTemplate?.options?.length) {
    const latestModel = models[models.length - 1];
    const prediction = predictWithWeights(latestModel, spyTemplate.features);
    const decisionType = prediction.probability >= 0.55 ? "call" : prediction.probability <= 0.45 ? "put" : "no_trade";
    const preferredOption =
      decisionType === "call"
        ? spyTemplate.options.find((option) => option.type === "call" && Math.abs(option.strike - spyTemplate.price) <= 3)
        : decisionType === "put"
          ? spyTemplate.options.find((option) => option.type === "put" && Math.abs(option.strike - spyTemplate.price) <= 3)
          : null;
    const callOption = spyTemplate.options.find((option) => option.type === "call" && Math.abs(option.strike - spyTemplate.price) <= 3) || spyTemplate.options.find((option) => option.type === "call");
    const putOption = spyTemplate.options.find((option) => option.type === "put" && Math.abs(option.strike - spyTemplate.price) <= 3) || spyTemplate.options.find((option) => option.type === "put");
    const decisionId = randomBase64Url(18);
    await db
      .prepare(
        "INSERT INTO research_decisions (id, user_id, snapshot_id, model_id, mode, symbol, decision, probability, score, selected_option_symbol, selected_contract_type, selected_entry_mark, call_option_symbol, call_entry_mark, put_option_symbol, put_entry_mark, underlying_entry_price, features_json, rationale_json, created_at) VALUES (?, ?, ?, ?, 'paper', 'SPY', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
      )
      .bind(
        decisionId,
        userId,
        spyTemplate.snapshotId,
        latestModel.id,
        decisionType,
        Number(prediction.probability.toFixed(4)),
        Number((Math.abs(prediction.probability - 0.5) * 1.8 + 0.35).toFixed(4)),
        preferredOption?.optionSymbol || null,
        preferredOption?.type || null,
        preferredOption?.mark || null,
        callOption?.optionSymbol || null,
        callOption?.mark || null,
        putOption?.optionSymbol || null,
        putOption?.mark || null,
        spyTemplate.price,
        JSON.stringify(spyTemplate.features),
        JSON.stringify({
          engine: "seeded_demo_model",
          noTradePressure: Number((1 - Math.abs(prediction.probability - 0.5) * 2).toFixed(4)),
          seeded: true,
          selectedOptionSymbol: preferredOption?.optionSymbol || null,
        }),
        spyTemplate.snapshotAt,
      )
      .run();

    if (preferredOption) {
      await db
        .prepare(
          "INSERT INTO research_paper_trades (id, user_id, decision_id, snapshot_id, mode, symbol, option_symbol, side, quantity, entry_price, entry_underlying_price, entry_score, status, opened_at) VALUES (?, ?, ?, ?, 'paper', 'SPY', ?, ?, 1, ?, ?, ?, 'open', ?)",
        )
        .bind(
          randomBase64Url(18),
          userId,
          decisionId,
          spyTemplate.snapshotId,
          preferredOption.optionSymbol,
          preferredOption.type,
          preferredOption.mark,
          spyTemplate.price,
          Number((Math.abs(prediction.probability - 0.5) * 1.8 + 0.35).toFixed(4)),
          spyTemplate.snapshotAt,
        )
        .run();
    }
  }

  const events = [
    {
      symbol: "SPY",
      title: "Imported starter core pack",
      body: "The new user seed starts with the core default feature manifest so there is already a sensible baseline to improve instead of an empty lab.",
      source: "System seed",
      created_at: "2026-05-01T20:03:00.000Z",
    },
    {
      symbol: "SPY",
      title: "Liquidity note before adding complexity",
      body: "When the model is uncertain, fix spread quality and label quality before reaching for new features.",
      source: "System coach",
      created_at: "2026-05-01T20:04:00.000Z",
    },
  ];
  for (const event of events) {
    await db
      .prepare(
        "INSERT INTO research_events (id, user_id, snapshot_id, symbol, title, body, source, created_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)",
      )
      .bind(randomBase64Url(18), userId, event.symbol, event.title, event.body, event.source, event.created_at)
      .run();
  }

  if (defaultManifest) {
    await db
      .prepare(
        "INSERT OR IGNORE INTO user_feature_manifest_imports (id, user_id, manifest_id, status, notes, imported_at) VALUES (?, ?, ?, 'active', 'Seeded for new user demo history.', ?)",
      )
      .bind(randomBase64Url(18), userId, defaultManifest.id, seedNow)
      .run();
  }
  await upsertGameStateForManifest(env, userId, defaultManifest?.id || null, defaultManifest ? parseJson(defaultManifest.feature_keys_json, []) : DEFAULT_PIPELINE_FEATURES);
  await audit(env, userId, "model.seeded_demo_history", {
    seeded_models: models.length,
    seeded_symbols: latestSnapshots.length,
    manifest_id: defaultManifest?.id || null,
  });
  return true;
}
