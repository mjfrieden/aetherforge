import { api, getSession, type SessionPayload } from "../api";

type ViewName = "desk" | "lab" | "league" | "vault";
type LabTabName = "overview" | "features" | "imports" | "score";
type PaperMode = "paper" | "shadow";
type DecisionType = "call" | "put" | "no_trade";
type FeatureKey = "change_pct" | "intraday_range" | "atm_iv" | "liquidity" | "call_put_skew";

type QuoteRecord = {
  symbol: string;
  price: number;
  changePercent: number;
  sector: string;
  snapshotAt: string;
};

type OptionContract = {
  optionSymbol: string;
  type: "call" | "put";
  strike: number;
  expiration: string;
  bid: number;
  ask: number;
  lastPrice: number;
  mark: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  delta: number;
  gamma: number;
  theta: number;
  vega: number;
};

type SnapshotRecord = {
  id: string;
  symbol: string;
  expiration: string;
  snapshotAt: string;
  quote: QuoteRecord;
  features: Record<FeatureKey, number>;
  options: OptionContract[];
};

type SetupRecord = {
  symbol: string;
  snapshotId: string;
  snapshotAt: string;
  regime: string;
  decision: DecisionType;
  probability: number;
  score: number;
  engine: string;
  optionSymbol: string;
  debit: number;
};

type DecisionRecord = {
  id: string;
  snapshotId: string;
  mode: PaperMode;
  symbol: string;
  decision: DecisionType;
  probability: number;
  score: number;
  features: Record<FeatureKey, number>;
  rationale: { engine?: string; noTradePressure?: number; selectedOptionSymbol?: string | null };
  selectedOptionSymbol: string | null;
};

type OutcomeRecord = {
  label: string;
  score: number;
  selectedReturn: number | null;
  callReturn: number | null;
  putReturn: number | null;
  underlyingReturn: number | null;
};

type TradeRecord = {
  id: string;
  decisionId: string | null;
  snapshotId: string;
  mode: PaperMode;
  symbol: string;
  optionSymbol: string;
  side: "call" | "put";
  quantity: number;
  entryPrice: number;
  entryUnderlyingPrice: number;
  entryScore: number;
  status: "open" | "closed";
  openedAt: string;
  closedAt: string | null;
  exitPrice: number;
  pnl: number | null;
  outcomeLabel: string | null;
};

type EventRecord = {
  id: string;
  snapshot_id: string | null;
  symbol: string;
  title: string;
  body: string;
  source: string;
  created_at: string;
};

type ModelRecord = {
  id: string;
  name: string;
  kind: string;
  weights: Record<string, number>;
  bias: number;
  metrics: {
    accuracy: number;
    brier: number;
    training_rows: number;
    evaluation_rows?: number;
    in_sample_accuracy?: number;
    in_sample_brier?: number;
    validation?: string;
  };
  features: FeatureKey[];
};

type ModelVersionRecord = {
  id: string;
  name: string;
  kind: string;
  features: FeatureKey[];
  metrics: ModelRecord["metrics"];
  training_rows: number;
  created_at: string;
  updated_at: string;
  version: string;
  versionNumber: number;
  featureCount: number;
  isCurrent: boolean;
};

type FeatureManifestRecord = {
  id: string;
  slug: string;
  scope: "system" | "user";
  name: string;
  description: string;
  featureKeys: FeatureKey[];
  imported: boolean;
  importedAt: string | null;
  supportsTraining: boolean;
  isPublic: boolean;
  status: string;
  ownerUserId: string | null;
  manifest: {
    lane?: string;
    author?: string;
    summary?: string;
    planned_features?: string[];
    import_behavior?: string;
  };
  created_at: string;
  updated_at: string;
};

type DashboardPayload = {
  watchlist: QuoteRecord[];
  setups: SetupRecord[];
  selectedSnapshot: SnapshotRecord | null;
  latestDecision: DecisionRecord | null;
  latestOutcome: OutcomeRecord | null;
  trades: TradeRecord[];
  events: EventRecord[];
  summary: {
    decisionCount: number;
    avgScore: number | null;
    noTradeWinRate: number | null;
    shadowScore: number | null;
    paperPnl: number;
    openTrades: number;
    balance: number;
    equityHistory: Array<{ time: string; value: number }>;
  };
  model: ModelRecord | null;
  modelVersions: ModelVersionRecord[];
  featureManifests: FeatureManifestRecord[];
};

type LeaderboardRecord = {
  display_name: string;
  evaluated_decisions: number;
  avg_score: number | null;
  no_trade_win_rate: number | null;
  shadow_score: number | null;
};

type PipelineState = {
  architecture: string;
  architectureType: string;
  optimizer: string;
  features: FeatureKey[];
  importedManifestIds: string[];
};

type AppState = {
  selectedSymbol: string;
  paperMode: PaperMode;
  watchlist: QuoteRecord[];
  setups: SetupRecord[];
  selectedSnapshot: SnapshotRecord | null;
  latestDecision: DecisionRecord | null;
  latestOutcome: OutcomeRecord | null;
  trades: TradeRecord[];
  events: EventRecord[];
  leaderboard: LeaderboardRecord[];
  rank: string;
  pipeline: PipelineState;
  modelReady: boolean;
  modelName: string;
  modelMetrics: ModelRecord["metrics"] | null;
  modelVersions: ModelVersionRecord[];
  featureManifests: FeatureManifestRecord[];
  featureImportance: Array<{ name: FeatureKey; value: number }>;
  summary: DashboardPayload["summary"];
  connected: boolean;
  message: string;
  initialBalance: number;
};

const featureLabels: Record<FeatureKey, string> = {
  change_pct: "Change %",
  intraday_range: "Intraday Range",
  atm_iv: "ATM IV",
  liquidity: "Liquidity",
  call_put_skew: "Call/Put Skew",
};

const architectures = [{ id: "Replay Logistic", type: "Walk-forward" }];
const optimizers = ["Gradient Descent"];
const defaultWatchlist = ["SPY", "QQQ", "NVDA", "TSLA", "AAPL"];

let csrfToken = "";
let session: SessionPayload | null = null;
let latestPreview: Record<string, unknown> | null = null;
let selectedOptionSymbol = "";
let activeView: ViewName = "desk";
let activeLabTab: LabTabName = "overview";

const state: AppState = {
  selectedSymbol: "SPY",
  paperMode: "paper",
  watchlist: [],
  setups: [],
  selectedSnapshot: null,
  latestDecision: null,
  latestOutcome: null,
  trades: [],
  events: [],
  leaderboard: [],
  rank: "-",
  pipeline: {
    architecture: "Replay Logistic",
    architectureType: "Walk-forward",
    optimizer: "Gradient Descent",
    features: ["change_pct", "intraday_range", "atm_iv", "liquidity"],
    importedManifestIds: [],
  },
  modelReady: false,
  modelName: "Cumulonimbus Replay Model",
  modelMetrics: null,
  modelVersions: [],
  featureManifests: [],
  featureImportance: [
    { name: "change_pct", value: 24 },
    { name: "intraday_range", value: 20 },
    { name: "atm_iv", value: 22 },
    { name: "liquidity", value: 18 },
    { name: "call_put_skew", value: 16 },
  ],
  summary: {
    decisionCount: 0,
    avgScore: null,
    noTradeWinRate: null,
    shadowScore: null,
    paperPnl: 0,
    openTrades: 0,
    balance: 10000,
    equityHistory: [{ time: "Start", value: 10000 }],
  },
  connected: false,
  message: "Connect Tradier to start building the replay store.",
  initialBalance: 10000,
};

const el = {
  topbarEyebrow: byId<HTMLElement>("topbar-eyebrow"),
  topbarTitle: byId<HTMLElement>("topbar-title"),
  topbarNote: byId<HTMLElement>("topbar-note"),
  topbarBadges: byId<HTMLElement>("topbar-badges"),
  sessionChip: byId<HTMLElement>("session-chip"),
  logout: byId<HTMLButtonElement>("logout-btn"),
  equity: byId<HTMLElement>("equity-value"),
  dayPnl: byId<HTMLElement>("day-pnl-value"),
  level: byId<HTMLElement>("level-value"),
  rank: byId<HTMLElement>("rank-value"),
  symbolInput: byId<HTMLInputElement>("symbol-input"),
  refreshMarket: byId<HTMLButtonElement>("refresh-market-btn"),
  scanSymbol: byId<HTMLButtonElement>("scan-symbol-btn"),
  watchlist: byId<HTMLElement>("watchlist"),
  setupList: byId<HTMLElement>("setup-list"),
  objectiveList: byId<HTMLElement>("objective-list"),
  snapshotGrid: byId<HTMLElement>("snapshot-grid"),
  eventList: byId<HTMLElement>("event-list"),
  coachNote: byId<HTMLElement>("coach-note"),
  portfolioTitle: byId<HTMLElement>("portfolio-title"),
  equityChart: byId<HTMLElement>("equity-chart"),
  chainTitle: byId<HTMLElement>("chain-title"),
  optionChain: byId<HTMLElement>("option-chain"),
  dataFreshness: byId<HTMLElement>("data-freshness"),
  modelName: byId<HTMLElement>("model-name"),
  openLab: byId<HTMLButtonElement>("open-lab-btn"),
  modelAccuracy: byId<HTMLElement>("model-accuracy"),
  modelBrier: byId<HTMLElement>("model-brier"),
  importanceList: byId<HTMLElement>("importance-list"),
  paperDrill: byId<HTMLButtonElement>("paper-drill-btn"),
  recordCall: byId<HTMLButtonElement>("record-call-btn"),
  recordPut: byId<HTMLButtonElement>("record-put-btn"),
  forecastStatus: byId<HTMLElement>("forecast-status"),
  oracleClass: byId<HTMLElement>("oracle-class"),
  inferenceStrip: byId<HTMLElement>("inference-strip"),
  tradeCount: byId<HTMLElement>("trade-count"),
  tradeJournal: byId<HTMLElement>("trade-journal"),
  architectureList: byId<HTMLElement>("architecture-list"),
  featureList: byId<HTMLElement>("feature-list"),
  optimizerList: byId<HTMLElement>("optimizer-list"),
  pipelineInputs: byId<HTMLElement>("pipeline-inputs"),
  pipelineCore: byId<HTMLElement>("pipeline-core"),
  pipelineType: byId<HTMLElement>("pipeline-type"),
  pipelineOptimizer: byId<HTMLElement>("pipeline-optimizer"),
  pipelineComplexity: byId<HTMLElement>("pipeline-complexity"),
  trainingRowCount: byId<HTMLElement>("training-row-count"),
  trainingXp: byId<HTMLElement>("training-xp"),
  modelVersionList: byId<HTMLElement>("model-version-list"),
  consoleLog: byId<HTMLElement>("console-log"),
  trainModel: byId<HTMLButtonElement>("train-model-btn"),
  modelStatus: byId<HTMLElement>("model-status"),
  labSummaryGrid: byId<HTMLElement>("lab-summary-grid"),
  labNoteList: byId<HTMLElement>("lab-note-list"),
  dataReadiness: byId<HTMLElement>("data-readiness"),
  labFeedMode: byId<HTMLElement>("lab-feed-mode"),
  providerGrid: byId<HTMLElement>("provider-grid"),
  contextBudget: byId<HTMLElement>("context-budget"),
  contextMap: byId<HTMLElement>("context-map"),
  leakageBadge: byId<HTMLElement>("leakage-badge"),
  validationGrid: byId<HTMLElement>("validation-grid"),
  labelLab: byId<HTMLElement>("label-lab"),
  arenaStatGrid: byId<HTMLElement>("arena-stat-grid"),
  leaderboard: byId<HTMLElement>("leaderboard"),
  challengeList: byId<HTMLElement>("challenge-list"),
  replayList: byId<HTMLElement>("replay-list"),
  tradierForm: byId<HTMLFormElement>("tradier-form"),
  tradierToken: byId<HTMLInputElement>("tradier-token"),
  tradierAccount: byId<HTMLInputElement>("tradier-account"),
  tradierMode: byId<HTMLSelectElement>("tradier-mode"),
  brokerMode: byId<HTMLElement>("broker-mode"),
  tradierStatus: byId<HTMLElement>("tradier-status"),
  orderForm: byId<HTMLFormElement>("order-form"),
  orderAsset: byId<HTMLInputElement>("order-asset"),
  orderSide: byId<HTMLInputElement>("order-side"),
  orderSymbol: byId<HTMLInputElement>("order-symbol"),
  orderQuantity: byId<HTMLInputElement>("order-quantity"),
  orderOptionSymbol: byId<HTMLInputElement>("order-option-symbol"),
  orderType: byId<HTMLSelectElement>("order-type"),
  orderPrice: byId<HTMLInputElement>("order-price"),
  orderConfirm: byId<HTMLInputElement>("order-confirm"),
  paperTrade: byId<HTMLButtonElement>("paper-trade-btn"),
  paperTradeStatus: byId<HTMLElement>("paper-trade-status"),
  placeOrder: byId<HTMLButtonElement>("place-order-btn"),
  orderStatus: byId<HTMLElement>("order-status"),
  detailFocusBadge: byId<HTMLElement>("detail-focus-badge"),
  selectedContractCard: byId<HTMLElement>("selected-contract-card"),
  detailGreekGrid: byId<HTMLElement>("detail-greek-grid"),
  scenarioGrid: byId<HTMLElement>("scenario-grid"),
  outcomeGrid: byId<HTMLElement>("outcome-grid"),
  comparisonList: byId<HTMLElement>("comparison-list"),
  decisionAction: byId<HTMLElement>("decision-action"),
  decisionCopy: byId<HTMLElement>("decision-copy"),
  marketRegime: byId<HTMLElement>("market-regime"),
  riskRead: byId<HTMLElement>("risk-read"),
  xpProgress: byId<HTMLElement>("xp-progress"),
  underlyingPrice: byId<HTMLElement>("underlying-price"),
  expectedMove: byId<HTMLElement>("expected-move"),
  eventForm: byId<HTMLFormElement>("event-form"),
  eventTitle: byId<HTMLInputElement>("event-title"),
  eventSource: byId<HTMLInputElement>("event-source"),
  eventBody: byId<HTMLTextAreaElement>("event-body"),
  eventStatus: byId<HTMLElement>("event-status"),
};

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function money(value: number) {
  return Number(value || 0).toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${Number(value || 0).toFixed(2)}%`;
}

function widthClass(value: number) {
  const bucket = Math.max(0, Math.min(100, Math.round(value / 5) * 5));
  return `fill-w-${bucket}`;
}

function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

function escapeHtml(value: string) {
  return String(value || "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char);
}

function cleanSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12) || "SPY";
}

function currentSymbol() {
  return cleanSymbol(el.symbolInput?.value || state.selectedSymbol);
}

function currentOptions() {
  return state.selectedSnapshot?.options || [];
}

function currentQuote() {
  return state.selectedSnapshot?.quote || {
    symbol: state.selectedSymbol,
    price: 0,
    changePercent: 0,
    sector: "Equity",
    snapshotAt: "",
  };
}

function featureValue(feature: FeatureKey) {
  return Number(state.latestDecision?.features?.[feature] ?? state.selectedSnapshot?.features?.[feature] ?? 0);
}

function regimeText() {
  const range = featureValue("intraday_range");
  const change = featureValue("change_pct");
  if (range > 0.4) return "Stormy";
  if (change > 0.2) return "Risk-on";
  if (change < -0.2) return "Defensive";
  return "Balanced";
}

function riskText() {
  const liquidity = featureValue("liquidity");
  const iv = featureValue("atm_iv");
  if (liquidity < -0.3) return "Thin Tape";
  if (iv > 0.45) return "High IV";
  if (state.latestDecision?.decision === "no_trade") return "Stand Down";
  return state.latestDecision ? "Tradable" : "Awaiting Replay";
}

function derivedXp() {
  const scoreComponent = Math.round((state.summary.avgScore || 0) * 240);
  return state.summary.decisionCount * 40 + scoreComponent;
}

function derivedLevel() {
  return Math.max(1, 1 + Math.floor(derivedXp() / 240));
}

function selectedOption() {
  const options = currentOptions();
  if (!options.length) return null;
  const direct = options.find((option) => option.optionSymbol === selectedOptionSymbol);
  if (direct) return direct;
  const preferred = state.latestDecision?.selectedOptionSymbol
    ? options.find((option) => option.optionSymbol === state.latestDecision?.selectedOptionSymbol)
    : null;
  if (preferred) {
    selectedOptionSymbol = preferred.optionSymbol;
    return preferred;
  }
  const fallback =
    [...options].sort(
      (left, right) =>
        (right.openInterest + right.volume * 0.5) / Math.max(right.mark, 0.01) -
        (left.openInterest + left.volume * 0.5) / Math.max(left.mark, 0.01),
    )[0] || null;
  if (fallback) selectedOptionSymbol = fallback.optionSymbol;
  return fallback;
}

function applyModel(model: ModelRecord | null) {
  state.modelReady = Boolean(model);
  state.modelName = model?.name || "Cumulonimbus Replay Model";
  state.modelMetrics = model?.metrics || null;
  if (!model) return;
  const weighted = model.features.map((name) => ({
    name,
    value: Math.abs(Number(model.weights[name] || 0)),
  }));
  const total = weighted.reduce((sum, item) => sum + item.value, 0) || 1;
  state.featureImportance = weighted
    .map((item) => ({ ...item, value: Math.round((item.value / total) * 100) }))
    .sort((left, right) => right.value - left.value);
  state.pipeline.features = model.features;
}

function applyDashboard(dashboard: DashboardPayload) {
  state.watchlist = dashboard.watchlist;
  state.setups = dashboard.setups;
  state.selectedSnapshot = dashboard.selectedSnapshot;
  state.latestDecision = dashboard.latestDecision;
  state.latestOutcome = dashboard.latestOutcome;
  state.trades = dashboard.trades;
  state.events = dashboard.events;
  state.summary = dashboard.summary;
  state.modelVersions = dashboard.modelVersions || [];
  state.featureManifests = dashboard.featureManifests || [];
  state.pipeline.importedManifestIds = state.featureManifests.filter((manifest) => manifest.imported).map((manifest) => manifest.id);
  applyModel(dashboard.model);
  if (dashboard.selectedSnapshot) {
    state.selectedSymbol = dashboard.selectedSnapshot.symbol;
    if (el.symbolInput) el.symbolInput.value = state.selectedSymbol;
  }
  selectedOptionSymbol =
    dashboard.latestDecision?.selectedOptionSymbol ||
    selectedOption()?.optionSymbol ||
    selectedOptionSymbol;
}

function orderPayload() {
  return {
    asset_class: el.orderAsset?.value || "option",
    side: el.orderSide?.value || "buy_to_open",
    symbol: cleanSymbol(el.orderSymbol?.value || state.selectedSymbol),
    option_symbol: cleanSymbol(el.orderOptionSymbol?.value || ""),
    quantity: Number(el.orderQuantity?.value || 1),
    type: el.orderType?.value || "limit",
    duration: "day",
    limit_price: Number(el.orderPrice?.value || 0),
  };
}

function serializeState() {
  return {
    last_symbol: state.selectedSymbol,
    cockpit: {
      initialBalance: state.initialBalance,
      paperMode: state.paperMode,
      pipeline: state.pipeline,
    },
  };
}

function hydrate(saved: unknown) {
  if (!saved || typeof saved !== "object") return;
  const data = saved as { last_symbol?: string; cockpit?: { initialBalance?: number; paperMode?: string; pipeline?: Partial<PipelineState> } };
  state.selectedSymbol = cleanSymbol(String(data.last_symbol || state.selectedSymbol));
  if (data.cockpit?.initialBalance) state.initialBalance = Number(data.cockpit.initialBalance);
  if (data.cockpit?.paperMode === "shadow") state.paperMode = "shadow";
  if (data.cockpit?.pipeline) {
    const importedManifestIds = Array.isArray(data.cockpit.pipeline.importedManifestIds)
      ? data.cockpit.pipeline.importedManifestIds.map((item) => String(item || "")).filter(Boolean)
      : state.pipeline.importedManifestIds;
    state.pipeline = {
      ...state.pipeline,
      ...data.cockpit.pipeline,
      importedManifestIds,
    } as PipelineState;
  }
  if (el.symbolInput) el.symbolInput.value = state.selectedSymbol;
}

let saveTimer = 0;
function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void api("/api/game/state", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ state: serializeState() }),
    }).catch(() => {});
  }, 350);
}

async function refreshDashboard(symbol = state.selectedSymbol) {
  const query = new URLSearchParams({
    mode: state.paperMode,
    symbol,
    symbols: defaultWatchlist.join(","),
  });
  const response = await api<{ ok: true; connected: boolean; message?: string; dashboard: DashboardPayload }>(
    `/api/research/dashboard?${query.toString()}`,
  );
  state.connected = response.connected;
  state.message = response.message || "";
  applyDashboard(response.dashboard);
}

async function importManifest(manifestId: string) {
  setStatus(el.modelStatus, "Importing feature manifest into My Model...");
  try {
    const response = await api<{ ok: true; manifest: FeatureManifestRecord }>("/api/models/manifests", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ manifest_id: manifestId }),
    });
    await refreshDashboard(state.selectedSymbol);
    pushConsole(`${response.manifest.name} imported into the active model workspace.`);
    setStatus(el.modelStatus, `${response.manifest.name} imported. Retrain when the added features earn a place.`, "success");
    queueSave();
  } catch (error) {
    setStatus(el.modelStatus, error instanceof Error ? error.message : String(error), "error");
  } finally {
    render();
  }
}

function ensureReplayConnection(statusTarget: HTMLElement | null) {
  if (state.connected) return true;
  setStatus(statusTarget, state.message || "Connect Tradier to start collecting replay snapshots.", "error");
  return false;
}

async function captureScan(mode: PaperMode) {
  state.selectedSymbol = currentSymbol();
  if (el.orderSymbol) el.orderSymbol.value = state.selectedSymbol;
  if (!ensureReplayConnection(el.forecastStatus)) {
    render();
    return;
  }
  setStatus(el.forecastStatus, `Capturing ${state.selectedSymbol} replay scan...`);
  try {
    const response = await api<{ ok: true; connected: true; decision: DecisionRecord; dashboard: DashboardPayload }>(
      "/api/research/scan",
      {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ symbol: state.selectedSymbol, mode }),
      },
    );
    state.paperMode = mode;
    applyDashboard(response.dashboard);
    state.latestDecision = response.decision;
    selectedOptionSymbol = response.decision.selectedOptionSymbol || selectedOptionSymbol;
    pushConsole(
      `${response.decision.symbol} ${response.decision.decision.toUpperCase()} scan captured at ${Math.round(
        response.decision.probability * 100,
      )}% (${response.decision.rationale?.engine || "heuristic"}).`,
    );
    setStatus(el.forecastStatus, "Replay scan captured. The outcome will resolve when fresher snapshots arrive.", "success");
    queueSave();
  } catch (error) {
    setStatus(el.forecastStatus, error instanceof Error ? error.message : String(error), "error");
  } finally {
    render();
  }
}

async function trainModel() {
  if (state.summary.decisionCount < 4) {
    setStatus(el.modelStatus, "Capture at least four resolved replay outcomes before training the first model.", "error");
    render();
    return;
  }
  setStatus(el.modelStatus, "Training on resolved replay outcomes...");
  el.trainModel?.setAttribute("disabled", "true");
  try {
    const response = await api<{ ok: true; model: ModelRecord }>("/api/models/train", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({
        name: "Cumulonimbus Replay Model",
        feature_keys: state.pipeline.features,
      }),
    });
    applyModel({
      ...response.model,
      bias: Number(response.model.weights.bias || 0),
    } as unknown as ModelRecord);
    await refreshDashboard(state.selectedSymbol);
    pushConsole(
      `Replay model trained: ${(response.model.metrics.accuracy * 100).toFixed(0)}% ${response.model.metrics.validation || "validation"}, Brier ${response.model.metrics.brier}.`,
    );
    setStatus(el.modelStatus, "Replay model trained. Capture fresh scans to generate out-of-sample decisions.", "success");
    queueSave();
  } catch (error) {
    setStatus(el.modelStatus, error instanceof Error ? error.message : String(error), "error");
  } finally {
    el.trainModel?.removeAttribute("disabled");
    render();
  }
}

async function submitPaperTrade() {
  const option = selectedOption();
  if (!state.selectedSnapshot || !option) {
    setStatus(el.paperTradeStatus, "Capture a replay scan and choose a contract first.", "error");
    return;
  }
  setStatus(el.paperTradeStatus, "Opening replay-backed paper position...");
  try {
    const response = await api<{ ok: true; trade: TradeRecord; dashboard: DashboardPayload }>("/api/research/paper-trade", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({
        snapshot_id: state.selectedSnapshot.id,
        decision_id: state.latestDecision?.id || null,
        option_symbol: option.optionSymbol,
        quantity: Number(el.orderQuantity?.value || 1),
        mode: state.paperMode,
        symbol: state.selectedSymbol,
        entry_score: state.latestDecision?.score || 0,
      }),
    });
    applyDashboard(response.dashboard);
    pushConsole(`${response.trade.symbol} ${response.trade.side.toUpperCase()} paper position opened from replay snapshot.`);
    setStatus(el.paperTradeStatus, "Paper position opened. It will close against a later replay snapshot for this symbol.", "success");
    render();
  } catch (error) {
    setStatus(el.paperTradeStatus, error instanceof Error ? error.message : String(error), "error");
  }
}

async function submitEventOverlay() {
  if (!state.selectedSnapshot) {
    setStatus(el.eventStatus, "Capture a replay snapshot before attaching event context.", "error");
    return;
  }
  setStatus(el.eventStatus, "Saving timestamped event overlay...");
  try {
    const response = await api<{ ok: true; dashboard: DashboardPayload }>("/api/research/events", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({
        snapshot_id: state.selectedSnapshot.id,
        symbol: state.selectedSymbol,
        title: el.eventTitle?.value || "",
        source: el.eventSource?.value || "Manual note",
        body: el.eventBody?.value || "",
        mode: state.paperMode,
      }),
    });
    if (el.eventTitle) el.eventTitle.value = "";
    if (el.eventSource) el.eventSource.value = "";
    if (el.eventBody) el.eventBody.value = "";
    applyDashboard(response.dashboard);
    pushConsole(`${state.selectedSymbol} event overlay saved.`);
    setStatus(el.eventStatus, "Event overlay saved to the replay timeline.", "success");
    render();
  } catch (error) {
    setStatus(el.eventStatus, error instanceof Error ? error.message : String(error), "error");
  }
}

async function refreshLeaderboard() {
  try {
    const data = await api<{ ok: true; leaders: LeaderboardRecord[] }>("/api/leaderboard");
    state.leaderboard = data.leaders;
    const index = data.leaders.findIndex((leader) => leader.display_name === session?.user?.display_name);
    state.rank = index >= 0 ? String(index + 1) : "-";
  } catch {
    state.leaderboard = [];
    state.rank = "-";
  }
}

async function refreshTradierStatus() {
  try {
    const data = await api<{
      ok: true;
      broker: { configured: boolean; mode?: string; account_id_masked?: string };
      profile?: { name?: string };
    }>("/api/tradier/status");
    if (!data.broker.configured) {
      state.connected = false;
      state.message = "Connect Tradier to start collecting replay snapshots.";
      if (el.brokerMode) el.brokerMode.textContent = "Disconnected";
      setStatus(el.tradierStatus, state.message);
      return false;
    }
    state.connected = true;
    state.message = "Tradier is linked. Capture a replay scan to populate the desk.";
    if (el.brokerMode) el.brokerMode.textContent = `${data.broker.mode} ${data.broker.account_id_masked}`;
    setStatus(el.tradierStatus, data.profile?.name ? `Connected for ${data.profile.name}.` : "Connected.", "success");
    return true;
  } catch (error) {
    state.connected = false;
    state.message = "Replay connectivity is unavailable right now.";
    if (el.brokerMode) el.brokerMode.textContent = "Unavailable";
    setStatus(el.tradierStatus, error instanceof Error ? error.message : String(error), "error");
    return false;
  }
}

function setStatus(target: HTMLElement | null, message: string, tone: "error" | "success" | "" = "") {
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", tone === "error");
  target.classList.toggle("success", tone === "success");
}

function pushConsole(message: string) {
  const stamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const line = document.createElement("p");
  line.textContent = `[${stamp}] ${message}`;
  el.consoleLog?.prepend(line);
  while ((el.consoleLog?.children.length || 0) > 9) {
    el.consoleLog?.lastElementChild?.remove();
  }
}

function decisionText() {
  if (!state.latestDecision) {
    return {
      action: "Start With One Symbol",
      copy: state.connected
        ? "Capture a fresh scan when you want new live data for your model."
        : state.message || "Use the demo history to learn the flow, then connect a broker when you want live snapshots.",
    };
  }
  if (state.latestDecision.decision === "no_trade") {
    return {
      action: "Wait For A Better Setup",
      copy: "Your model does not see a clear edge right now. That is a valid result.",
    };
  }
  return {
    action: `${state.latestDecision.symbol} ${state.latestDecision.decision === "call" ? "Call" : "Put"} ${Math.round(state.latestDecision.probability * 100)}%`,
    copy: "Review the idea, compare the contract choices, and paper trade it only if it still makes sense.",
  };
}

function renderTopbar() {
  const station =
    activeView === "vault"
      ? {
          eyebrow: "Simple idea review",
          title: "Ideas",
          note: "Look at one trade idea at a time. Compare the choices, then practice before you risk anything.",
        }
      : activeView === "lab"
        ? {
            eyebrow: "Improve the model",
            title: "Improve",
            note: "Change only a few things at once. Save a new version when the evidence is ready.",
          }
        : activeView === "league"
          ? {
              eyebrow: "Simple community view",
              title: "Community",
              note: "Browse public ideas, compare packs, and learn from what other people are trying.",
            }
          : {
              eyebrow: "One model, one home screen",
              title: "Home",
              note: "Review the best ideas, understand what your model is doing, and keep the next step obvious.",
            };
  if (el.topbarEyebrow) el.topbarEyebrow.textContent = station.eyebrow;
  if (el.topbarTitle) el.topbarTitle.textContent = station.title;
  if (el.topbarNote) el.topbarNote.textContent = station.note;
  if (el.topbarBadges) {
    const badges = [
      state.connected ? "Live broker linked" : "Demo mode",
      state.modelVersions[0]?.version || "No version yet",
      state.selectedSnapshot ? state.selectedSnapshot.symbol : state.selectedSymbol,
    ];
    el.topbarBadges.innerHTML = badges.map((badge) => `<span>${escapeHtml(badge)}</span>`).join("");
  }
}

function renderLabTabs() {
  document.querySelectorAll<HTMLButtonElement>("[data-lab-tab]").forEach((button) => {
    button.classList.toggle("active", button.dataset.labTab === activeLabTab);
  });
  document.querySelectorAll<HTMLElement>("[data-lab-pane]").forEach((pane) => {
    pane.classList.toggle("active", pane.dataset.labPane === activeLabTab);
  });
}

function render() {
  const level = derivedLevel();
  const xp = derivedXp();
  const quote = currentQuote();
  const dayPnl = state.summary.balance - state.initialBalance;
  const decision = decisionText();
  const option = selectedOption();

  renderTopbar();
  if (el.sessionChip) el.sessionChip.textContent = session?.user?.display_name || "Trader";
  if (el.equity) el.equity.textContent = money(state.summary.balance);
  if (el.dayPnl) {
    el.dayPnl.textContent = money(dayPnl);
    el.dayPnl.classList.toggle("positive", dayPnl >= 0);
    el.dayPnl.classList.toggle("negative", dayPnl < 0);
  }
  if (el.level) el.level.textContent = String(level);
  if (el.rank) el.rank.textContent = state.rank;
  if (el.decisionAction) el.decisionAction.textContent = decision.action;
  if (el.decisionCopy) el.decisionCopy.textContent = decision.copy;
  if (el.marketRegime) el.marketRegime.textContent = regimeText();
  if (el.riskRead) el.riskRead.textContent = riskText();
  if (el.xpProgress) el.xpProgress.textContent = `${xp % 240} / 240`;
  if (el.underlyingPrice) el.underlyingPrice.textContent = money(quote.price);
  if (el.expectedMove) {
    el.expectedMove.textContent = pct(quote.changePercent);
    el.expectedMove.classList.toggle("positive", quote.changePercent >= 0);
    el.expectedMove.classList.toggle("negative", quote.changePercent < 0);
  }
  if (el.portfolioTitle) el.portfolioTitle.textContent = `${state.paperMode === "paper" ? "Paper" : "Shadow"} Model Curve`;
  if (el.chainTitle) el.chainTitle.textContent = `${state.selectedSymbol} Ideas`;
  if (el.dataFreshness) {
    el.dataFreshness.textContent = state.selectedSnapshot
      ? `Replay snapshot - ${new Date(state.selectedSnapshot.snapshotAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
      : "Replay feed not loaded";
  }
  if (el.detailFocusBadge) {
    el.detailFocusBadge.textContent = option
      ? `${option.type.toUpperCase()} ${money(option.strike)} - ${Math.round((state.latestDecision?.score || 0) * 100)}% score`
      : "Awaiting selection";
  }
  renderWatchlist();
  renderMissionControl();
  renderChart();
  renderChain();
  renderModel();
  renderInference();
  renderJournal();
  renderTradeDetail();
  renderLab();
  renderResearchLab();
  renderArena();
}

function renderWatchlist() {
  if (!el.watchlist) return;
  if (!state.watchlist.length) {
    el.watchlist.innerHTML = `<p>${escapeHtml(state.message || "Connect data to surface live candidates for your model.")}</p>`;
    return;
  }
  el.watchlist.innerHTML = state.watchlist
    .map(
      (item) => `
        <button class="watch-row ${item.symbol === state.selectedSymbol ? "active" : ""}" type="button" data-symbol="${item.symbol}">
          <span><strong>${item.symbol}</strong><small>${item.sector}</small></span>
          <span><b>${money(item.price)}</b><em class="${item.changePercent >= 0 ? "positive" : "negative"}">${pct(item.changePercent)}</em></span>
        </button>
      `,
    )
    .join("");
  el.watchlist.querySelectorAll<HTMLButtonElement>("[data-symbol]").forEach((button) => {
    button.addEventListener("click", () => {
      state.selectedSymbol = cleanSymbol(button.dataset.symbol || state.selectedSymbol);
      if (!state.connected) {
        if (el.symbolInput) el.symbolInput.value = state.selectedSymbol;
        render();
        return;
      }
      void refreshDashboard(state.selectedSymbol).then(render);
    });
  });
}

function renderMissionControl() {
  if (el.setupList) {
    el.setupList.innerHTML = state.setups.length
      ? state.setups
          .slice(0, 5)
          .map(
            (setup, index) => `
              <button class="setup-row ${setup.symbol === state.selectedSymbol ? "active" : ""}" type="button" data-setup-symbol="${setup.symbol}">
                <span class="setup-rank">${index + 1}</span>
                <span>
                  <strong>${setup.symbol} ${setup.decision === "no_trade" ? "wait" : setup.decision}</strong>
                  <small>${setup.regime} • ${new Date(setup.snapshotAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                </span>
                <span>
                  <b>${Math.round(setup.score * 100)}%</b>
                  <small>${setup.debit ? money(setup.debit) : "No trade"}</small>
                </span>
              </button>
            `,
          )
          .join("")
      : `<p>${escapeHtml(state.message || "Model-ranked ideas appear here once replay snapshots are flowing.")}</p>`;
    el.setupList.querySelectorAll<HTMLButtonElement>("[data-setup-symbol]").forEach((button) => {
      button.addEventListener("click", () => {
        state.selectedSymbol = cleanSymbol(button.dataset.setupSymbol || state.selectedSymbol);
        switchView("vault");
        void refreshDashboard(state.selectedSymbol).then(render);
      });
    });
  }

  if (el.objectiveList) {
    const objectives = [
      {
        title: state.connected ? "Refresh live ideas" : "Use the demo history",
        copy: state.connected
          ? "Scan a symbol when you want a fresh snapshot from the market."
          : "Start with the seeded history so you can learn the product before connecting anything.",
      },
      {
        title: state.modelReady ? "Review one idea at a time" : "Let the model learn",
        copy: state.modelReady
          ? "Open the Ideas screen and compare the contract choices before you paper trade."
          : "As more outcomes are graded, you can retrain and save better versions.",
      },
      {
        title: state.events.length ? "Keep notes short" : "Change only a little",
        copy: state.events.length
          ? "Write down why you changed something so the next version makes sense."
          : "Simple models are easier to trust. Add features only when they clearly help.",
      },
    ];
    el.objectiveList.innerHTML = objectives
      .map(
        (objective, index) => `
          <div class="objective-row">
            <span>${index + 1}</span>
            <strong>${objective.title}</strong>
            <small>${objective.copy}</small>
          </div>
        `,
      )
      .join("");
  }

  if (el.snapshotGrid) {
    if (!state.selectedSnapshot) {
      el.snapshotGrid.innerHTML = `
        <div><dt>Status</dt><dd>${state.connected ? "Live ready" : "Demo ready"}</dd><small>${state.connected ? "Scan when you want a fresh idea" : "Seeded data is loaded so you can practice right away"}</small></div>
        <div><dt>Focus</dt><dd>${state.selectedSymbol}</dd><small>Current symbol on deck</small></div>
        <div><dt>Next step</dt><dd>${state.connected ? "Scan now" : "Review ideas"}</dd><small>${state.connected ? "Store the next prediction" : "Open one idea and learn the flow"}</small></div>
        <div><dt>Version</dt><dd>${state.modelVersions[0]?.version || "v0"}</dd><small>${state.summary.decisionCount} graded outcomes so far</small></div>
      `;
    } else {
      const quote = currentQuote();
      el.snapshotGrid.innerHTML = `
        <div><dt>Last run</dt><dd>${new Date(state.selectedSnapshot.snapshotAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</dd><small>${quote.symbol} labeled snapshot</small></div>
        <div><dt>Underlying</dt><dd>${money(quote.price)}</dd><small>${pct(quote.changePercent)}</small></div>
        <div><dt>Feature stack</dt><dd>${state.pipeline.features.length}</dd><small>Active inputs</small></div>
        <div><dt>Idea count</dt><dd>${state.selectedSnapshot.options.length}</dd><small>Loaded contract rows</small></div>
      `;
    }
  }

  if (el.eventList) {
    el.eventList.innerHTML = state.events.length
      ? state.events
          .slice(0, 3)
          .map(
            (event) => `
              <div class="event-row">
                <strong>${escapeHtml(event.title)}</strong>
                <small>${escapeHtml(event.source)} - ${new Date(event.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                <p>${escapeHtml(event.body)}</p>
              </div>
            `,
          )
          .join("")
      : `
          <div class="event-row event-row-empty">
            <strong>No model notes yet</strong>
            <small>Keep the journal honest until there is a real feature idea, label, or context shift worth recording.</small>
            <p>Use the Workshop to log why a new input or model change should exist before you retrain.</p>
          </div>
        `;
  }
}

function renderChart() {
  if (!el.equityChart) return;
  const width = 720;
  const height = 220;
  const values = state.summary.equityHistory.length ? state.summary.equityHistory : [{ time: "Start", value: state.initialBalance }];
  const min = Math.min(...values.map((point) => point.value));
  const max = Math.max(...values.map((point) => point.value));
  const range = Math.max(1, max - min);
  const points = values
    .map((point, index) => {
      const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
      const y = height - ((point.value - min) / range) * (height - 24) - 12;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
  el.equityChart.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Replay-backed paper account equity curve">
      <defs>
        <linearGradient id="equityFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="rgba(16, 185, 129, 0.34)"></stop>
          <stop offset="100%" stop-color="rgba(16, 185, 129, 0)"></stop>
        </linearGradient>
      </defs>
      <polyline points="0,${height - 8} ${points} ${width},${height - 8}" fill="url(#equityFill)" stroke="none"></polyline>
      <polyline points="${points}" fill="none" stroke="#10b981" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"></polyline>
    </svg>
  `;
}

function renderChain() {
  if (!el.optionChain) return;
  const options = currentOptions();
  const activeOption = selectedOption();
  if (!options.length) {
    el.optionChain.innerHTML = "<p>No option ideas loaded yet. Capture a labeled scan to populate the prediction board.</p>";
    return;
  }
  el.optionChain.innerHTML = options
    .map(
      (option) => `
        <button class="option-row ${activeOption?.optionSymbol === option.optionSymbol ? "active" : ""}" type="button" data-option="${option.optionSymbol}">
          <span class="contract-type ${option.type}">${option.type === "call" ? "C" : "P"}</span>
          <span><strong>${money(option.strike)}</strong><small>${option.expiration}</small></span>
          <span><strong>${money(option.mark)}</strong><small>Bid ${money(option.bid)} / Ask ${money(option.ask)}</small></span>
          <span><strong>${option.openInterest.toLocaleString()}</strong><small>OI / ${option.volume.toLocaleString()} vol</small></span>
          <span class="edge-cell"><strong>${Math.round(option.impliedVolatility * 100)}%</strong><small>IV</small><span class="score-bar"><i class="${widthClass(
            Math.max(10, Math.min(100, ((option.openInterest + option.volume) / 30))),
          )}"></i></span></span>
        </button>
      `,
    )
    .join("");
  el.optionChain.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((button) => {
    button.addEventListener("click", () => {
      selectedOptionSymbol = String(button.dataset.option || "");
      switchView("vault");
      render();
    });
  });
}

function renderModel() {
  if (el.modelName) el.modelName.textContent = state.modelName;
  if (el.modelAccuracy) {
    el.modelAccuracy.textContent = state.modelMetrics ? `${(state.modelMetrics.accuracy * 100).toFixed(0)}%` : "Untrained";
  }
  if (el.modelBrier) {
    el.modelBrier.textContent = state.modelMetrics
      ? `Brier ${state.modelMetrics.brier} - ${state.modelMetrics.evaluation_rows || 0} walk-forward rows`
      : `${state.summary.decisionCount} resolved outcomes`;
  }
  if (el.importanceList) {
    el.importanceList.innerHTML = state.featureImportance
      .map(
        (item) => `
          <div class="importance-row">
            <span>${featureLabels[item.name]}</span>
            <b>${item.value.toFixed(0)}%</b>
            <i class="${widthClass(Math.max(6, item.value))}"></i>
          </div>
        `,
      )
      .join("");
  }
}

function renderInference() {
  if (el.oracleClass) el.oracleClass.textContent = state.latestDecision ? state.latestDecision.decision.replace("_", " ") : "No scan";
  if (el.coachNote) {
    if (!state.latestDecision) {
      el.coachNote.textContent = state.connected
        ? "Capture a labeled scan. The model will track liquidity, IV, and no-trade pressure from the saved snapshot."
        : "Connect Tradier or a demo feed to begin capturing replay snapshots.";
    } else if (state.latestDecision.decision === "no_trade") {
      el.coachNote.textContent = "No-trade is part of the model. Patience should earn credit when liquidity, IV, or conviction fail the gate.";
    } else {
      el.coachNote.textContent = `${state.latestDecision.symbol} favors a ${state.latestDecision.decision.toUpperCase()} read, but the model still owes you later market validation.`;
    }
  }
  if (!el.inferenceStrip) return;
  if (!state.latestDecision) {
    el.inferenceStrip.innerHTML = "<p>No model decision yet. Scan a symbol from My Model to create the next labeled prediction.</p>";
    return;
  }
  const outcome = state.latestOutcome;
  el.inferenceStrip.innerHTML = `
    <div><dt>Bias</dt><dd>${state.latestDecision.decision.toUpperCase()}</dd><small>${state.latestDecision.symbol}</small></div>
    <div><dt>Confidence</dt><dd>${(state.latestDecision.probability * 100).toFixed(0)}%</dd><small>Model conviction</small></div>
    <div><dt>Liquidity</dt><dd>${Math.round(((state.latestDecision.features.liquidity + 1) / 2) * 100)}%</dd><small>Execution pressure</small></div>
    <div><dt>ATM IV</dt><dd>${Math.round(((state.latestDecision.features.atm_iv + 1) / 2) * 100)}%</dd><small>Volatility context</small></div>
    <div><dt>Last label</dt><dd>${outcome ? outcome.label.replaceAll("_", " ") : "Pending"}</dd><small>Latest graded call</small></div>
  `;
}

function renderJournal() {
  if (el.tradeCount) el.tradeCount.textContent = `${state.trades.length} positions`;
  if (!el.tradeJournal) return;
  if (!state.trades.length) {
    el.tradeJournal.innerHTML = "<p>No graded trades yet. Open one from Predictions after capturing a model run.</p>";
    return;
  }
  el.tradeJournal.innerHTML = state.trades
    .slice(0, 6)
    .map(
      (trade) => `
        <div class="trade-row">
          <span><strong>${trade.symbol} ${trade.side.toUpperCase()}</strong><small>${new Date(trade.openedAt).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })} - ${trade.optionSymbol}</small></span>
          <span><b class="${(trade.pnl || 0) >= 0 ? "positive" : "negative"}">${
            trade.pnl === null ? trade.status.toUpperCase() : money(trade.pnl)
          }</b><small>${trade.status === "open" ? "Awaiting exit snapshot" : trade.outcomeLabel || "Closed"}</small></span>
        </div>
      `,
    )
    .join("");
}

function renderTradeDetail() {
  const option = selectedOption();
  if (!option || !state.selectedSnapshot) {
    if (el.selectedContractCard) {
      el.selectedContractCard.innerHTML = `
        <div>
          <p class="eyebrow">Ideas</p>
          <h2>${state.setups.length ? "Choose an idea from Home" : "Ideas will show up here"}</h2>
          <p class="selected-copy">${
            state.setups.length
              ? "Pick one setup from Home and the contract details will appear here."
              : state.connected
                ? "Scan a symbol to create a fresh idea."
                : "Use the demo history on Home first, then connect a broker when you want live snapshots."
          }</p>
        </div>
      `;
    }
    if (el.detailGreekGrid) {
      el.detailGreekGrid.innerHTML = `
        <div><dt>Delta</dt><dd>--</dd><small>Directional sensitivity arrives after a scan</small></div>
        <div><dt>Gamma</dt><dd>--</dd><small>Acceleration risk needs a selected contract</small></div>
        <div><dt>Theta</dt><dd>--</dd><small>Time decay will show when premium is loaded</small></div>
        <div><dt>Vega</dt><dd>--</dd><small>Volatility sensitivity unlocks with live chain data</small></div>
      `;
    }
    if (el.scenarioGrid) {
      el.scenarioGrid.innerHTML = `
        <div><dt>Fast follow-through</dt><dd>Stand by</dd><small>The scenario ladder populates after a replay decision exists.</small></div>
        <div><dt>Flat tape</dt><dd>Stand by</dd><small>Use this panel to pressure-test premium bleed before committing.</small></div>
        <div><dt>IV crush</dt><dd>Stand by</dd><small>The desk should make volatility pain obvious, not hidden.</small></div>
        <div><dt>Hard failure</dt><dd>Stand by</dd><small>Every contract needs a visible failure case before paper capital goes in.</small></div>
      `;
    }
    if (el.outcomeGrid) {
      el.outcomeGrid.innerHTML = `
        <div><dt>Review loop</dt><dd>Open</dd><small>No label yet because no later snapshot has graded the prediction.</small></div>
        <div><dt>Selected return</dt><dd>Pending</dd><small>Will appear once a captured idea ages into an outcome.</small></div>
        <div><dt>Underlying</dt><dd>Pending</dd><small>Use it to compare the option against the raw move.</small></div>
        <div><dt>Score</dt><dd>Pending</dd><small>The platform should reward good restraint as much as good aggression.</small></div>
      `;
    }
    if (el.comparisonList) {
      el.comparisonList.innerHTML =
        '<div class="compare-row compare-row-empty"><span><strong>No comparable contracts yet</strong><small>Once the first labeled snapshot lands, this rail will fill with ranked alternatives.</small></span></div>';
    }
    return;
  }
  if (el.orderSymbol) el.orderSymbol.value = state.selectedSymbol;
  if (el.orderOptionSymbol) el.orderOptionSymbol.value = option.optionSymbol;
  if (el.orderPrice) el.orderPrice.value = option.mark.toFixed(2);
  if (el.paperTradeStatus) {
    el.paperTradeStatus.textContent = `Selected ${option.type.toUpperCase()} ${money(option.strike)} exp ${option.expiration}.`;
  }
  if (el.selectedContractCard) {
    const breakEven = option.type === "call" ? option.strike + option.mark : option.strike - option.mark;
    el.selectedContractCard.innerHTML = `
      <div>
        <p class="eyebrow">Top Expression</p>
        <h2>${state.selectedSymbol} ${option.type.toUpperCase()} ${money(option.strike)}</h2>
        <p class="selected-copy">${option.optionSymbol}</p>
      </div>
      <div class="selected-metrics">
        <div><dt>Mark</dt><dd>${money(option.mark)}</dd></div>
        <div><dt>Spread</dt><dd>${money(option.ask - option.bid)}</dd></div>
        <div><dt>Break-even</dt><dd>${money(breakEven)}</dd></div>
        <div><dt>Liquidity</dt><dd>${option.openInterest.toLocaleString()} OI</dd></div>
      </div>
    `;
  }
  if (el.detailGreekGrid) {
    el.detailGreekGrid.innerHTML = `
      <div><dt>Delta</dt><dd>${option.delta.toFixed(2)}</dd><small>Directional sensitivity</small></div>
      <div><dt>Gamma</dt><dd>${option.gamma.toFixed(3)}</dd><small>Acceleration risk</small></div>
      <div><dt>Theta</dt><dd>${option.theta.toFixed(3)}</dd><small>Time decay</small></div>
      <div><dt>Vega</dt><dd>${option.vega.toFixed(3)}</dd><small>Volatility sensitivity</small></div>
    `;
  }
  if (el.scenarioGrid) {
    const scenarios = [
      { name: "Fast follow-through", outcome: money(option.mark * 100 * 0.75), copy: "Directional move arrives before theta dominates." },
      { name: "Flat tape", outcome: money(option.mark * 100 * -0.25), copy: "The market drifts and the premium bleeds." },
      { name: "IV crush", outcome: money(option.mark * 100 * -(0.2 + option.impliedVolatility * 0.25)), copy: "The thesis can be right while premium still compresses." },
      { name: "Hard failure", outcome: money(option.mark * 100 * -0.8), copy: "The directional read loses decisively." },
    ];
    el.scenarioGrid.innerHTML = scenarios
      .map(
        (scenario) => `
          <div>
            <dt>${scenario.name}</dt>
            <dd>${scenario.outcome}</dd>
            <small>${scenario.copy}</small>
          </div>
        `,
      )
      .join("");
  }
  if (el.outcomeGrid) {
    const outcome = state.latestOutcome;
    el.outcomeGrid.innerHTML = outcome
      ? `
          <div><dt>Label</dt><dd>${escapeHtml(outcome.label.replaceAll("_", " "))}</dd><small>Most recent graded prediction</small></div>
          <div><dt>Selected return</dt><dd>${outcome.selectedReturn !== null ? `${(outcome.selectedReturn * 100).toFixed(1)}%` : "Pending"}</dd><small>Chosen expression</small></div>
          <div><dt>Underlying</dt><dd>${outcome.underlyingReturn !== null ? `${(outcome.underlyingReturn * 100).toFixed(1)}%` : "Pending"}</dd><small>Reference move</small></div>
          <div><dt>Score</dt><dd>${Math.round(outcome.score * 100)}%</dd><small>Model decision quality</small></div>
        `
      : "<p>No model outcome has resolved yet. This station becomes more useful once later snapshots close the loop.</p>";
  }
  if (el.comparisonList) {
    el.comparisonList.innerHTML = currentOptions()
      .slice()
      .sort((left, right) => right.openInterest + right.volume - (left.openInterest + left.volume))
      .slice(0, 6)
      .map(
        (candidate) => `
          <button class="compare-row ${candidate.optionSymbol === option.optionSymbol ? "active" : ""}" type="button" data-compare-option="${candidate.optionSymbol}">
            <span><strong>${candidate.type.toUpperCase()} ${money(candidate.strike)}</strong><small>${candidate.expiration}</small></span>
            <span><b>${money(candidate.mark)}</b><small>${candidate.openInterest.toLocaleString()} OI</small></span>
          </button>
        `,
      )
      .join("");
    el.comparisonList.querySelectorAll<HTMLButtonElement>("[data-compare-option]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedOptionSymbol = String(button.dataset.compareOption || "");
        render();
      });
    });
  }
}

function renderChoiceList<T extends { id: string; type: string }>(
  target: HTMLElement | null,
  choices: T[],
  active: string,
  onChoose: (id: string) => void,
  activeMany: string[] = [],
) {
  if (!target) return;
  target.innerHTML = choices
    .map((choice) => {
      const isActive = choice.id === active || activeMany.includes(choice.id);
      return `<button class="${isActive ? "active" : ""}" type="button" data-choice="${choice.id}"><strong>${choice.id}</strong><small>${choice.type}</small></button>`;
    })
    .join("");
  target.querySelectorAll<HTMLButtonElement>("[data-choice]").forEach((button) => {
    button.addEventListener("click", () => onChoose(String(button.dataset.choice)));
  });
}

function renderLab() {
  renderLabTabs();
  renderChoiceList(el.architectureList, architectures, state.pipeline.architecture, () => undefined);
  renderChoiceList(
    el.featureList,
    (Object.keys(featureLabels) as FeatureKey[]).map((key) => ({ id: key, type: featureLabels[key] })),
    "",
    (id) => {
      const feature = id as FeatureKey;
      state.pipeline.features = state.pipeline.features.includes(feature)
        ? state.pipeline.features.filter((item) => item !== feature)
        : [...state.pipeline.features, feature];
      queueSave();
      render();
    },
    state.pipeline.features,
  );
  renderChoiceList(
    el.optimizerList,
    optimizers.map((id) => ({ id, type: "Optimizer" })),
    state.pipeline.optimizer,
    () => undefined,
  );
  if (el.pipelineInputs) {
    el.pipelineInputs.textContent = state.pipeline.features.length
      ? state.pipeline.features.map((feature) => featureLabels[feature]).join(" + ")
      : "No features connected";
  }
  if (el.pipelineCore) el.pipelineCore.textContent = state.pipeline.architecture;
  if (el.pipelineType) el.pipelineType.textContent = state.pipeline.architectureType;
  if (el.pipelineOptimizer) el.pipelineOptimizer.textContent = state.pipeline.optimizer;
  if (el.pipelineComplexity) {
    el.pipelineComplexity.textContent = state.modelVersions.length
      ? `${state.modelVersions.length} saved versions`
      : "Interpretable weights";
  }
  if (el.trainingRowCount) el.trainingRowCount.textContent = String(state.summary.decisionCount);
  if (el.trainingXp) el.trainingXp.textContent = `+${Math.max(20, state.summary.decisionCount * 2)} XP`;
  if (el.labSummaryGrid) {
    el.labSummaryGrid.innerHTML = `
      <div><dt>Resolved rows</dt><dd>${state.summary.decisionCount}</dd><small>Graded outcomes</small></div>
      <div><dt>Feature stack</dt><dd>${state.pipeline.architecture}</dd><small>${state.pipeline.features.length} active inputs</small></div>
      <div><dt>Last score</dt><dd>${state.modelMetrics ? `${Math.round(state.modelMetrics.accuracy * 100)}%` : "N/A"}</dd><small>Walk-forward accuracy</small></div>
      <div><dt>Current version</dt><dd>${state.modelVersions[0]?.version || "v0"}</dd><small>${state.modelVersions[0] ? new Date(state.modelVersions[0].created_at).toLocaleDateString() : "Train the first model"}</small></div>
    `;
  }
  if (el.modelVersionList) {
    el.modelVersionList.innerHTML = state.modelVersions.length
      ? state.modelVersions
          .map(
            (version) => `
              <div class="version-row ${version.isCurrent ? "active" : ""}">
                <span><strong>${version.version}</strong><small>${escapeHtml(version.name)}</small></span>
                <span><b>${version.metrics.accuracy !== null ? `${Math.round(version.metrics.accuracy * 100)}%` : "N/A"}</b><small>${version.training_rows} rows · ${version.featureCount} features</small></span>
              </div>
            `,
          )
          .join("")
      : "<p>No saved versions yet. The first retrain will start the timeline.</p>";
  }
  if (el.labNoteList) {
    const notes = [
      state.summary.decisionCount < 8
        ? "Wait for at least 8 graded outcomes before you trust a retrain."
        : "Look at accuracy and Brier together, not just one number.",
      state.modelVersions[0]
        ? `Current live version: ${state.modelVersions[0].version} with ${state.modelVersions[0].featureCount} active features.`
        : "Write feature ideas only when you can explain them in plain English.",
      state.events.length ? `Latest note: ${state.events[0].title}` : "Keep the model simple until the data clearly asks for more.",
    ];
    el.labNoteList.innerHTML = notes.map((note) => `<div><strong>Next</strong><small>${escapeHtml(note)}</small></div>`).join("");
  }
}

function renderResearchLab() {
  const featureCount = state.pipeline.features.length;
  const readiness =
    state.modelReady && state.summary.decisionCount >= 12
      ? "Replay ready"
      : state.summary.decisionCount >= 8
        ? "Trainable"
        : "Needs outcomes";
  if (el.dataReadiness) el.dataReadiness.textContent = readiness;
  if (el.labFeedMode) {
    el.labFeedMode.textContent = state.connected ? "Broker + local manifests" : "Seeded demo + local manifests";
  }
  if (el.contextBudget) {
    el.contextBudget.textContent = `${Math.min(8, featureCount + state.featureManifests.filter((manifest) => manifest.imported).length)} / 8 signals`;
  }
  if (el.leakageBadge) el.leakageBadge.textContent = state.selectedSnapshot ? "Point-in-time snapshot" : "No snapshot yet";
  if (el.providerGrid) {
    el.providerGrid.innerHTML = state.featureManifests
      .map(
        (provider) => `
          <div class="provider-card">
            <span>${provider.imported ? "Imported" : provider.scope === "system" ? "System" : "Community"}</span>
            <strong>${escapeHtml(provider.name)}</strong>
            <small>${provider.featureKeys.map((feature) => featureLabels[feature]).join(" + ")}</small>
            <em>${escapeHtml(provider.description)}</em>
            <button type="button" data-import-manifest="${provider.id}" ${provider.imported ? "disabled" : ""}>
              ${provider.imported ? "Installed" : "Import Pack"}
            </button>
          </div>
        `,
      )
      .join("");
    el.providerGrid.querySelectorAll<HTMLButtonElement>("[data-import-manifest]").forEach((button) => {
      button.addEventListener("click", () => void importManifest(String(button.dataset.importManifest || "")));
    });
  }
  if (el.contextMap) {
    const output = state.latestDecision
      ? `${state.latestDecision.decision.toUpperCase()} ${(state.latestDecision.probability * 100).toFixed(0)}%`
      : "No scan yet";
    el.contextMap.innerHTML = `
      <div class="context-column">
        <span>Inputs</span>
        <b>Quote</b>
        <b>Option chain</b>
        <b>Liquidity</b>
        <b>IV</b>
      </div>
      <div class="context-arrow">Shape</div>
      <div class="context-column active">
        <span>My Model</span>
        ${state.pipeline.features.map((feature) => `<b>${featureLabels[feature]}</b>`).join("")}
        <b>Packs: ${state.featureManifests.filter((manifest) => manifest.imported).length}</b>
      </div>
      <div class="context-arrow">Score</div>
      <div class="context-column output">
        <span>Prediction</span>
        <b>${output}</b>
        <b>${state.latestOutcome ? state.latestOutcome.label.replaceAll("_", " ") : "Pending label"}</b>
      </div>
    `;
  }
  if (el.validationGrid) {
    el.validationGrid.innerHTML = `
      <div><dt>Resolved rows</dt><dd>${state.summary.decisionCount}</dd><small>Walk-forward eligible</small></div>
      <div><dt>Avg score</dt><dd>${state.summary.avgScore !== null ? `${Math.round(state.summary.avgScore * 100)}%` : "N/A"}</dd><small>Out-of-sample decision score</small></div>
      <div><dt>Brier</dt><dd>${state.modelMetrics ? state.modelMetrics.brier.toFixed(3) : "N/A"}</dd><small>Calibration</small></div>
      <div><dt>No-trade wins</dt><dd>${state.summary.noTradeWinRate !== null ? `${Math.round(state.summary.noTradeWinRate * 100)}%` : "N/A"}</dd><small>Abstention quality</small></div>
      <div><dt>Manifest imports</dt><dd>${state.featureManifests.filter((manifest) => manifest.imported).length}</dd><small>Reusable feature packs</small></div>
    `;
  }
  if (el.labelLab) {
    el.labelLab.innerHTML = state.featureManifests
      .slice(0, 3)
      .map((manifest) => ({
        name: manifest.name,
        value: manifest.manifest.summary || manifest.description,
      }))
      .concat([
        { name: "Ablation pass", value: "Test one added feature at a time so you know what actually helped." },
      ])
      .map(
        (recipe) => `
          <div>
            <strong>${recipe.name}</strong>
            <span>${recipe.value}</span>
          </div>
        `,
      )
      .join("");
  }
}

function renderArena() {
  if (el.arenaStatGrid) {
    const wins = state.trades.filter((trade) => trade.outcomeLabel === "win").length;
    el.arenaStatGrid.innerHTML = `
      <div><dt>Live version</dt><dd>${state.modelVersions[0]?.version || (state.modelReady ? "v1" : "v0")}</dd><small>Your current model branch</small></div>
      <div><dt>Resolved</dt><dd>${state.summary.decisionCount}</dd><small>Graded predictions</small></div>
      <div><dt>Review wins</dt><dd>${wins}</dd><small>Closed paper positions</small></div>
      <div><dt>Open packs</dt><dd>${state.featureManifests.filter((manifest) => manifest.imported).length}</dd><small>Imported manifests</small></div>
    `;
  }
  if (el.leaderboard) {
    el.leaderboard.innerHTML = state.leaderboard.length
      ? state.leaderboard
          .slice(0, 10)
          .map(
            (leader, index) => `
              <div class="leader-row">
                <span>${index + 1}</span>
                <strong>${escapeHtml(leader.display_name)}</strong>
                <em>${leader.evaluated_decisions} graded runs</em>
                <b>${leader.avg_score !== null ? `${Math.round(leader.avg_score * 100)}%` : "N/A"}</b>
              </div>
            `,
          )
          .join("")
      : `
          <div class="leader-row">
            <span>T</span>
            <strong>Core Volatility Baseline</strong>
            <em>Starter template</em>
            <b>68%</b>
          </div>
          <div class="leader-row">
            <span>T</span>
            <strong>Liquidity Guard Rail</strong>
            <em>Starter template</em>
            <b>64%</b>
          </div>
          <div class="leader-row">
            <span>T</span>
            <strong>Event Aware Skew</strong>
            <em>Community pack concept</em>
            <b>61%</b>
          </div>
        `;
  }
  if (el.challengeList) {
    const challenges = [
      `Design one new feature that should improve ${state.latestDecision?.decision === "no_trade" ? "no-trade discipline" : "calibration"}, then explain how you would ablation-test it.`,
      "Remove one feature and see if the model gets clearer or weaker.",
      "Write one short note that explains why a new pack should exist before you import it.",
    ];
    el.challengeList.innerHTML = challenges
      .map((challenge, index) => `<div class="challenge-row"><span><strong>Quest ${index + 1}</strong><small>${escapeHtml(challenge)}</small></span><b>Build</b></div>`)
      .join("");
  }
  if (el.replayList) {
    const replays = state.featureManifests.length
      ? state.featureManifests
      : [
          {
            id: "starter",
            name: "Core Momentum Pack",
            description: "Starter signals built from change, range, IV, and liquidity. Good baseline for first forks.",
            imported: false,
          },
        ];
    el.replayList.innerHTML = replays
      .map((replay) => `<div class="replay-row"><strong>${escapeHtml(replay.name)}</strong><small>${escapeHtml(replay.description)}</small></div>`)
      .join("");
  }
}

function switchView(view: ViewName) {
  activeView = view;
  document.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  renderTopbar();
  if (view === "league" && state.summary.decisionCount > 0) void refreshLeaderboard().then(render);
  if (view === "vault") void refreshTradierStatus().then(render);
}

function bindEvents() {
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.addEventListener("click", () => switchView((button.dataset.view || "desk") as ViewName));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-paper-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      state.paperMode = button.dataset.paperMode === "shadow" ? "shadow" : "paper";
      document.querySelectorAll<HTMLButtonElement>("[data-paper-mode]").forEach((item) => item.classList.toggle("active", item === button));
      queueSave();
      render();
    });
  });
  el.logout?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST", csrfToken }).catch(() => {});
    window.location.href = "/login";
  });
  document.querySelectorAll<HTMLButtonElement>("[data-open-workshop]").forEach((button) => {
    button.addEventListener("click", () => switchView("lab"));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-lab-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      activeLabTab = (button.dataset.labTab || "overview") as LabTabName;
      renderLabTabs();
    });
  });
  el.scanSymbol?.addEventListener("click", () => void captureScan(state.paperMode));
  el.refreshMarket?.addEventListener("click", () => {
    if (!ensureReplayConnection(el.forecastStatus)) {
      render();
      return;
    }
    void refreshDashboard(currentSymbol()).then(() => {
      setStatus(el.forecastStatus, "Replay store refreshed from Tradier.", "success");
      render();
    }).catch((error) => {
      setStatus(el.forecastStatus, error instanceof Error ? error.message : String(error), "error");
    });
  });
  el.symbolInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void captureScan(state.paperMode);
  });
  el.paperDrill?.addEventListener("click", () => {
    if (!ensureReplayConnection(el.forecastStatus)) {
      render();
      return;
    }
    void refreshDashboard(currentSymbol()).then(() => {
      pushConsole(`Replay store refreshed for ${currentSymbol()}.`);
      setStatus(el.forecastStatus, "Replay store refreshed. Older open decisions may now be resolved.", "success");
      render();
    }).catch((error) => {
      setStatus(el.forecastStatus, error instanceof Error ? error.message : String(error), "error");
    });
  });
  el.recordCall?.addEventListener("click", () => void captureScan("paper"));
  el.recordPut?.addEventListener("click", () => void captureScan("shadow"));
  el.paperTrade?.addEventListener("click", () => void submitPaperTrade());
  el.trainModel?.addEventListener("click", () => void trainModel());
  el.eventForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void submitEventOverlay();
  });
  el.tradierForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(el.tradierStatus, "Saving encrypted broker link...");
    try {
      await api("/api/tradier/connect", {
        method: "POST",
        csrfToken,
        body: JSON.stringify({
          access_token: el.tradierToken?.value || "",
          account_id: el.tradierAccount?.value || "",
          mode: el.tradierMode?.value || "sandbox",
        }),
      });
      if (el.tradierToken) el.tradierToken.value = "";
      setStatus(el.tradierStatus, "Broker link saved server-side.", "success");
      await refreshTradierStatus();
      await refreshDashboard(state.selectedSymbol);
      render();
    } catch (error) {
      setStatus(el.tradierStatus, error instanceof Error ? error.message : String(error), "error");
    }
  });
  el.orderForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    setStatus(el.orderStatus, "Requesting Tradier preview...");
    try {
      latestPreview = await api<Record<string, unknown>>("/api/tradier/order-preview", {
        method: "POST",
        csrfToken,
        body: JSON.stringify(orderPayload()),
      });
      setStatus(el.orderStatus, "Preview response stored. Review broker details before any placement.", "success");
      pushConsole("Tradier preview requested through the server-side vault.");
    } catch (error) {
      setStatus(el.orderStatus, error instanceof Error ? error.message : String(error), "error");
    }
  });
  el.placeOrder?.addEventListener("click", async () => {
    setStatus(el.orderStatus, "Submitting gated order request...");
    try {
      latestPreview = await api<Record<string, unknown>>("/api/tradier/order-place", {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ ...orderPayload(), confirm_phrase: el.orderConfirm?.value || "" }),
      });
      setStatus(el.orderStatus, "Order endpoint responded. Check Tradier status before taking further action.", "success");
      pushConsole("Gated order placement endpoint responded.");
    } catch (error) {
      setStatus(el.orderStatus, error instanceof Error ? error.message : String(error), "error");
    }
  });
}

async function boot() {
  session = await getSession();
  if (!session.authenticated || !session.user || !session.csrf_token) {
    window.location.href = `/login?next=${encodeURIComponent("/game")}`;
    return;
  }
  csrfToken = session.csrf_token;
  bindEvents();
  pushConsole("Cumulonimbus desk initialized.");
  try {
    const saved = await api<{ ok: true; state: unknown }>("/api/game/state");
    hydrate(saved.state);
  } catch {
    pushConsole("No saved desk preferences found.");
  }
  await refreshTradierStatus();
  await refreshDashboard(state.selectedSymbol).catch((error) => {
    state.message = error instanceof Error ? error.message : String(error);
  });
  render();
}

void boot().catch((error) => {
  document.body.innerHTML = `<main class="fatal-error"><h1>Cumulonimbus could not start</h1><p>${escapeHtml(
    error instanceof Error ? error.message : String(error),
  )}</p><a href="/login">Return to login</a></main>`;
});

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => void;
  }
}

window.render_game_to_text = () =>
  [
    "Cumulonimbus",
    `symbol=${state.selectedSymbol}`,
    `balance=${state.summary.balance}`,
    `level=${derivedLevel()}`,
    `resolved=${state.summary.decisionCount}`,
    `modelReady=${state.modelReady}`,
    `trades=${state.trades.length}`,
    `latestPreview=${latestPreview ? "yes" : "no"}`,
  ].join("\n");

window.advanceTime = () => {
  render();
};
