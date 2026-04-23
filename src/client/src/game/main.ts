import { api, getSession, type SessionPayload } from "../api";

type EssenceKey = "momentum" | "volatility" | "sentiment" | "liquidity" | "iv_rank";
type ContractSide = "call" | "put" | "wait";
type ViewName = "desk" | "lab" | "league" | "vault";

type SignalSample = Record<EssenceKey, number> & { label: number };

type ForecastRecord = {
  symbol: string;
  contract: ContractSide;
  probability: number;
  class: string;
  features: Record<EssenceKey, number>;
};

type OptionContract = {
  type: "call" | "put";
  strike: number;
  expiration: string;
  lastPrice: number;
  volume: number;
  openInterest: number;
  impliedVolatility: number;
  predictionScore: number;
  optionSymbol: string;
};

type WatchSymbol = {
  symbol: string;
  price: number;
  changePercent: number;
  sector: string;
};

type PaperTrade = {
  id: string;
  time: string;
  symbol: string;
  optionSymbol: string;
  side: "call" | "put";
  debit: number;
  quantity: number;
  pnl: number;
  score: number;
};

type PipelineState = {
  architecture: string;
  architectureType: string;
  optimizer: string;
  features: EssenceKey[];
};

type CockpitState = {
  level: number;
  xp: number;
  balance: number;
  initialBalance: number;
  rank: string;
  selectedSymbol: string;
  samples: SignalSample[];
  essence: Record<EssenceKey, number>;
  forecast: ForecastRecord | null;
  modelReady: boolean;
  modelName: string;
  modelMetrics: null | { accuracy: number; brier: number; training_rows: number; user_rows?: number };
  featureImportance: Array<{ name: EssenceKey; value: number }>;
  pnlHistory: Array<{ time: string; value: number }>;
  trades: PaperTrade[];
  pipeline: PipelineState;
  paperMode: "paper" | "shadow";
};

const essenceKeys: EssenceKey[] = ["momentum", "volatility", "sentiment", "liquidity", "iv_rank"];
const featureLabels: Record<EssenceKey, string> = {
  momentum: "Momentum",
  volatility: "Volatility",
  sentiment: "Sentiment",
  liquidity: "Liquidity",
  iv_rank: "IV Rank",
};

const architectures = [
  { id: "Random Forest", type: "Ensemble" },
  { id: "Logistic Edge", type: "Interpretable" },
  { id: "LSTM", type: "Sequence" },
  { id: "Option-GPT", type: "Coach" },
];

const optimizers = ["AdamW", "SGD + Momentum", "Bayesian Sweep"];
const challenges = [
  { name: "Liquidity Gate", reward: "+40 XP", copy: "Choose a contract with tight spread assumptions and explain why thin OI is dangerous." },
  { name: "IV Crush Drill", reward: "+60 XP", copy: "Find a setup where the correct answer is no trade because premium is too expensive." },
  { name: "Single-Leg Sprint", reward: "+35 XP", copy: "Make one paper call or put decision, then record the outcome label." },
];

const dataProviders = [
  {
    name: "Tradier Market Data",
    status: "Ready",
    kind: "Quotes + options",
    copy: "Best production lane for authenticated users: quotes, chains, and broker-aligned symbols stay server-side.",
  },
  {
    name: "Google Finance Sheets",
    status: "Import",
    kind: "CSV learning feed",
    copy: "Use `GOOGLEFINANCE` in Sheets, export CSV, then treat it as delayed educational OHLCV context.",
  },
  {
    name: "Historical Replay Store",
    status: "Next",
    kind: "Walk-forward labels",
    copy: "Persist option-chain snapshots so learners can test entries without future leakage.",
  },
  {
    name: "News + Macro Overlay",
    status: "Research",
    kind: "Regime context",
    copy: "Curate only timestamped context available before the decision bar.",
  },
];

const labelRecipes = [
  { name: "1D Direction", value: "Underlying close-to-close after signal." },
  { name: "Option Payoff", value: "Contract mark at horizon minus entry debit." },
  { name: "No-Trade Gate", value: "Reward abstention when spread, IV, or confidence is poor." },
];

let csrfToken = "";
let session: SessionPayload | null = null;
let latestPreview: Record<string, unknown> | null = null;

const state: CockpitState = {
  level: 1,
  xp: 0,
  balance: 10000,
  initialBalance: 10000,
  rank: "-",
  selectedSymbol: "SPY",
  samples: [],
  essence: { momentum: 0, volatility: 0, sentiment: 0, liquidity: 0, iv_rank: 0 },
  forecast: null,
  modelReady: false,
  modelName: "Cloudspire Oracle",
  modelMetrics: null,
  featureImportance: essenceKeys.map((name, index) => ({ name, value: [28, 24, 18, 16, 14][index] })),
  pnlHistory: [
    { time: "09:30", value: 10000 },
    { time: "10:00", value: 10000 },
    { time: "10:30", value: 10000 },
  ],
  trades: [],
  pipeline: {
    architecture: "Random Forest",
    architectureType: "Ensemble",
    optimizer: "AdamW",
    features: ["momentum", "volatility", "liquidity"],
  },
  paperMode: "paper",
};

const el = {
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
  consoleLog: byId<HTMLElement>("console-log"),
  trainModel: byId<HTMLButtonElement>("train-model-btn"),
  modelStatus: byId<HTMLElement>("model-status"),
  dataReadiness: byId<HTMLElement>("data-readiness"),
  providerGrid: byId<HTMLElement>("provider-grid"),
  contextBudget: byId<HTMLElement>("context-budget"),
  contextMap: byId<HTMLElement>("context-map"),
  leakageBadge: byId<HTMLElement>("leakage-badge"),
  validationGrid: byId<HTMLElement>("validation-grid"),
  labelLab: byId<HTMLElement>("label-lab"),
  leaderboard: byId<HTMLElement>("leaderboard"),
  challengeList: byId<HTMLElement>("challenge-list"),
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
  placeOrder: byId<HTMLButtonElement>("place-order-btn"),
  orderStatus: byId<HTMLElement>("order-status"),
  decisionAction: byId<HTMLElement>("decision-action"),
  decisionCopy: byId<HTMLElement>("decision-copy"),
  marketRegime: byId<HTMLElement>("market-regime"),
  riskRead: byId<HTMLElement>("risk-read"),
  xpProgress: byId<HTMLElement>("xp-progress"),
  underlyingPrice: byId<HTMLElement>("underlying-price"),
  expectedMove: byId<HTMLElement>("expected-move"),
};

function byId<T extends HTMLElement>(id: string): T | null {
  return document.getElementById(id) as T | null;
}

function money(value: number) {
  return value.toLocaleString(undefined, { style: "currency", currency: "USD" });
}

function pct(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(2)}%`;
}

function widthClass(value: number) {
  const bucket = Math.max(0, Math.min(100, Math.round(value / 5) * 5));
  return `fill-w-${bucket}`;
}

function clamp(value: number, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function hashSymbol(symbol: string) {
  let total = 0;
  for (let index = 0; index < symbol.length; index += 1) {
    total = (total * 31 + symbol.charCodeAt(index)) % 9973;
  }
  return total / 9973;
}

function cleanSymbol(value: string) {
  return value.trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12) || "SPY";
}

function currentSymbol() {
  return cleanSymbol(el.symbolInput?.value || state.selectedSymbol);
}

function expirationDate() {
  const date = new Date();
  date.setDate(date.getDate() + 24 + ((date.getDay() + 2) % 5));
  return date.toISOString().slice(0, 10);
}

function occSymbol(symbol: string, expiration: string, type: "call" | "put", strike: number) {
  const root = symbol.replace(/[^A-Z]/g, "").slice(0, 6) || "SPY";
  const yymmdd = expiration.slice(2).replaceAll("-", "");
  const strikeCode = String(Math.round(strike * 1000)).padStart(8, "0");
  return `${root}${yymmdd}${type === "call" ? "C" : "P"}${strikeCode}`;
}

function getQuote(symbol: string): WatchSymbol {
  const seed = hashSymbol(symbol);
  const base = symbol === "SPY" ? 512 : symbol === "NVDA" ? 875 : symbol === "TSLA" ? 174 : symbol === "AAPL" ? 183 : 80 + seed * 740;
  const change = (Math.sin(seed * 20) * 2.8 + Math.cos(seed * 11) * 0.9);
  return {
    symbol,
    price: Number(base.toFixed(2)),
    changePercent: Number(change.toFixed(2)),
    sector: symbol === "SPY" || symbol === "QQQ" ? "ETF" : "Equity",
  };
}

function buildWatchlist() {
  const symbols = ["SPY", "QQQ", "NVDA", "TSLA", "AAPL", state.selectedSymbol].filter(
    (symbol, index, list) => list.indexOf(symbol) === index,
  );
  return symbols.map(getQuote);
}

function buildFeatures(symbol = state.selectedSymbol): Record<EssenceKey, number> {
  const seed = hashSymbol(symbol) - 0.5;
  const last = state.samples[state.samples.length - 1];
  const essenceBias = Object.fromEntries(essenceKeys.map((key) => [key, clamp((state.essence[key] - 40) / 90)])) as Record<
    EssenceKey,
    number
  >;
  return {
    momentum: clamp((last?.momentum ?? seed * 1.4) * 0.62 + essenceBias.momentum * 0.38),
    volatility: clamp((last?.volatility ?? Math.cos(seed * 8)) * 0.55 + essenceBias.volatility * 0.45),
    sentiment: clamp((last?.sentiment ?? seed) * 0.66 + essenceBias.sentiment * 0.34),
    liquidity: clamp((last?.liquidity ?? 0.58) * 0.7 + essenceBias.liquidity * 0.3),
    iv_rank: clamp((last?.iv_rank ?? -seed) * 0.58 + essenceBias.iv_rank * 0.42),
  };
}

function buildOptions(symbol = state.selectedSymbol): OptionContract[] {
  const quote = getQuote(symbol);
  const expiration = expirationDate();
  const features = buildFeatures(symbol);
  const step = quote.price > 300 ? 5 : quote.price > 100 ? 2.5 : 1;
  const center = Math.round(quote.price / step) * step;
  const strikes = [-2, -1, 0, 1].map((offset) => Number((center + offset * step).toFixed(2)));
  return strikes.flatMap((strike, index) => {
    const distance = Math.abs(strike - quote.price) / Math.max(quote.price, 1);
    const basePremium = Math.max(0.28, quote.price * (0.012 + distance * 0.42));
    const callScore = clamp(0.5 + features.momentum * 0.21 + features.sentiment * 0.16 + features.liquidity * 0.08 - distance, 0.05, 0.95);
    const putScore = clamp(0.5 - features.momentum * 0.21 + features.volatility * 0.13 - features.sentiment * 0.1 - distance, 0.05, 0.95);
    const iv = clamp(0.24 + Math.abs(features.volatility) * 0.18 + features.iv_rank * 0.08, 0.12, 0.72);
    return [
      {
        type: "call" as const,
        strike,
        expiration,
        lastPrice: Number((basePremium * (1 + index * 0.06)).toFixed(2)),
        volume: Math.round(350 + hashSymbol(`${symbol}c${strike}`) * 5000),
        openInterest: Math.round(900 + hashSymbol(`${symbol}co${strike}`) * 16000),
        impliedVolatility: Number(iv.toFixed(2)),
        predictionScore: Number(callScore.toFixed(2)),
        optionSymbol: occSymbol(symbol, expiration, "call", strike),
      },
      {
        type: "put" as const,
        strike,
        expiration,
        lastPrice: Number((basePremium * (0.92 + index * 0.05)).toFixed(2)),
        volume: Math.round(300 + hashSymbol(`${symbol}p${strike}`) * 4300),
        openInterest: Math.round(700 + hashSymbol(`${symbol}po${strike}`) * 13000),
        impliedVolatility: Number((iv + 0.02).toFixed(2)),
        predictionScore: Number(putScore.toFixed(2)),
        optionSymbol: occSymbol(symbol, expiration, "put", strike),
      },
    ];
  });
}

function setStatus(target: HTMLElement | null, message: string, tone: "error" | "success" | "" = "") {
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", tone === "error");
  target.classList.toggle("success", tone === "success");
}

function marketRegime(features: Record<EssenceKey, number>) {
  if (features.volatility > 0.58) return "Stormy";
  if (features.momentum > 0.32 && features.sentiment > -0.15) return "Risk-on";
  if (features.momentum < -0.32 || features.sentiment < -0.45) return "Defensive";
  return "Balanced";
}

function riskRead(features: Record<EssenceKey, number>, forecast: ForecastRecord | null) {
  if (features.iv_rank > 0.54) return "High IV";
  if (features.liquidity < -0.28) return "Thin Tape";
  if (!forecast || forecast.contract === "wait" || forecast.probability < 0.58) return "Guarded";
  return "Tradable";
}

function decisionText(forecast: ForecastRecord | null) {
  if (!forecast) {
    return {
      action: "Awaiting Scan",
      copy: "Pick a symbol, scan the tape, then compare edge against liquidity and premium.",
    };
  }
  if (forecast.contract === "wait") {
    return {
      action: "No-Trade Watch",
      copy: "The desk is not seeing enough edge yet. Preserve paper capital and collect cleaner labels.",
    };
  }
  const side = forecast.contract === "call" ? "Call Bias" : "Put Hedge";
  return {
    action: `${side} ${Math.round(forecast.probability * 100)}%`,
    copy: `${forecast.symbol} has a ${forecast.class.replace("_", " ")} read. Check spread, IV, and sizing before any fill.`,
  };
}

function gainXp(amount: number) {
  state.xp += amount;
  const threshold = state.level * 140;
  if (state.xp >= threshold) {
    state.xp -= threshold;
    state.level += 1;
    pushConsole(`Level ${state.level} reached. New league weighting unlocked.`);
  }
}

function addSample(sample: SignalSample) {
  state.samples = [...state.samples, sample].slice(-200);
  const key = sample.label >= 0.5 ? "momentum" : "volatility";
  state.essence[key] = Math.min(999, state.essence[key] + 10);
  state.essence.liquidity = Math.min(999, state.essence.liquidity + 4);
}

function runPaperDrill() {
  const features = buildFeatures();
  const label = features.momentum + features.sentiment * 0.7 + features.liquidity * 0.25 > features.volatility * 0.4 ? 1 : 0;
  addSample({ ...features, label });
  gainXp(28);
  pushConsole(`Paper drill labeled ${label ? "CALL" : "PUT"} for ${state.selectedSymbol}.`);
  setStatus(el.forecastStatus, "Paper drill added one training row. Deploy or retrain the oracle when ready.", "success");
  queueSave();
  render();
}

function recordOutcome(side: "call" | "put") {
  if (!state.forecast) {
    setStatus(el.forecastStatus, "Scan a symbol before recording an outcome.", "error");
    return;
  }
  addSample({ ...state.forecast.features, label: side === "call" ? 1 : 0 });
  gainXp(18);
  pushConsole(`${state.forecast.symbol} ${side.toUpperCase()} outcome recorded.`);
  setStatus(el.forecastStatus, `${side.toUpperCase()} outcome recorded for the next model version.`, "success");
  queueSave();
  render();
}

function simulateTrade(option: OptionContract) {
  const cost = option.lastPrice * 100;
  if (state.balance < cost) {
    setStatus(el.forecastStatus, "Insufficient paper equity for this contract.", "error");
    return;
  }
  const features = buildFeatures(option.optionSymbol);
  const quality = option.predictionScore + features.liquidity * 0.08 - Math.max(0, option.impliedVolatility - 0.45) * 0.18;
  const win = hashSymbol(`${option.optionSymbol}${state.trades.length}`) < clamp(quality, 0.08, 0.88);
  const multiplier = win ? 1.14 + option.predictionScore * 1.35 : 0.18 + Math.max(0, features.liquidity) * 0.18;
  const pnl = Number((cost * multiplier - cost).toFixed(2));
  const trade: PaperTrade = {
    id: `${Date.now()}-${option.optionSymbol}`,
    time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
    symbol: state.selectedSymbol,
    optionSymbol: option.optionSymbol,
    side: option.type,
    debit: option.lastPrice,
    quantity: 1,
    pnl,
    score: option.predictionScore,
  };
  state.balance = Number((state.balance + pnl).toFixed(2));
  state.pnlHistory = [...state.pnlHistory, { time: trade.time, value: state.balance }].slice(-24);
  state.trades = [trade, ...state.trades].slice(0, 20);
  state.forecast = {
    symbol: state.selectedSymbol,
    contract: option.type,
    probability: option.predictionScore,
    class: option.predictionScore >= 0.58 ? `${option.type}_edge` : "low_conviction",
    features: buildFeatures(),
  };
  gainXp(win ? 45 : 18);
  addSample({ ...state.forecast.features, label: option.type === "call" ? 1 : 0 });
  pushConsole(`${trade.optionSymbol} paper ${win ? "win" : "loss"}: ${money(pnl)}.`);
  setStatus(el.forecastStatus, `${option.type.toUpperCase()} paper trade logged with ${money(pnl)} P&L.`, pnl >= 0 ? "success" : "error");
  queueSave();
  render();
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

function serializeState() {
  return {
    level: state.level,
    xp: state.xp,
    wins: state.trades.filter((trade) => trade.pnl > 0).length,
    essence: state.essence,
    samples: state.samples,
    last_symbol: state.selectedSymbol,
    profession: {
      signalsCollected: state.samples.length,
      questStage: state.modelReady ? 3 : state.samples.length ? 1 : 0,
      contractBias: "auto",
      forecast: state.forecast,
    },
    cockpit: {
      balance: state.balance,
      initialBalance: state.initialBalance,
      pnlHistory: state.pnlHistory,
      trades: state.trades,
      pipeline: state.pipeline,
      paperMode: state.paperMode,
    },
  };
}

function hydrate(saved: unknown) {
  if (!saved || typeof saved !== "object") return;
  const data = saved as Partial<ReturnType<typeof serializeState>>;
  state.level = Number(data.level || state.level);
  state.xp = Number(data.xp || state.xp);
  state.samples = Array.isArray(data.samples) ? (data.samples.slice(-200) as SignalSample[]) : state.samples;
  state.essence = { ...state.essence, ...(data.essence || {}) };
  state.forecast = (data.profession?.forecast || null) as ForecastRecord | null;
  state.selectedSymbol = cleanSymbol(String(data.last_symbol || state.selectedSymbol));
  const cockpit = data.cockpit;
  if (cockpit) {
    state.balance = Number(cockpit.balance || state.balance);
    state.initialBalance = Number(cockpit.initialBalance || state.initialBalance);
    state.pnlHistory = Array.isArray(cockpit.pnlHistory) ? cockpit.pnlHistory.slice(-24) : state.pnlHistory;
    state.trades = Array.isArray(cockpit.trades) ? cockpit.trades.slice(0, 20) : state.trades;
    state.pipeline = { ...state.pipeline, ...(cockpit.pipeline || {}) };
    state.paperMode = cockpit.paperMode === "shadow" ? "shadow" : "paper";
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

async function trainModel() {
  if (!state.pipeline.features.length) {
    setStatus(el.modelStatus, "Choose at least one input dimension.", "error");
    return;
  }
  pushConsole(`Training ${state.pipeline.architecture} on ${state.samples.length} user rows.`);
  setStatus(el.modelStatus, "Training your personal oracle...");
  el.trainModel?.setAttribute("disabled", "true");
  try {
    const data = await api<{
      ok: true;
      model: { name: string; weights: Record<string, number>; metrics: { accuracy: number; brier: number; training_rows: number; user_rows?: number } };
    }>("/api/models/train", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ name: state.pipeline.architecture, samples: state.samples }),
    });
    state.modelReady = true;
    state.modelName = data.model.name;
    state.modelMetrics = data.model.metrics;
    state.featureImportance = essenceKeys
      .map((name) => ({ name, value: Math.abs(Number(data.model.weights[name] || 0)) }))
      .sort((a, b) => b.value - a.value);
    const total = state.featureImportance.reduce((sum, item) => sum + item.value, 0) || 1;
    state.featureImportance = state.featureImportance.map((item) => ({ ...item, value: Math.round((item.value / total) * 100) }));
    gainXp(55 + state.pipeline.features.length * 8);
    pushConsole(`Model deployed: ${(data.model.metrics.accuracy * 100).toFixed(0)}% fit, Brier ${data.model.metrics.brier}.`);
    setStatus(el.modelStatus, "Oracle deployed. Return to the desk and scan a symbol.", "success");
    queueSave();
  } catch (error) {
    setStatus(el.modelStatus, error instanceof Error ? error.message : String(error), "error");
  } finally {
    el.trainModel?.removeAttribute("disabled");
    render();
  }
}

async function forecastSymbol() {
  state.selectedSymbol = currentSymbol();
  if (el.orderSymbol) el.orderSymbol.value = state.selectedSymbol;
  setStatus(el.forecastStatus, `Scanning ${state.selectedSymbol}...`);
  if (!state.modelReady) {
    state.forecast = {
      symbol: state.selectedSymbol,
      contract: "wait",
      probability: 0.5,
      class: "training_required",
      features: buildFeatures(),
    };
    setStatus(el.forecastStatus, "Model not trained yet. Option chain is available for paper learning only.", "error");
    render();
    return;
  }
  try {
    const features = buildFeatures();
    const data = await api<{
      ok: true;
      symbol: string;
      prediction: { probability: number; class: string; features: Record<EssenceKey, number> };
    }>("/api/models/predict", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ symbol: state.selectedSymbol, features }),
    });
    const contract = data.prediction.class === "call_edge" ? "call" : data.prediction.class === "put_hedge" ? "put" : "wait";
    state.forecast = {
      symbol: data.symbol,
      contract,
      probability: data.prediction.probability,
      class: data.prediction.class,
      features,
    };
    gainXp(16);
    pushConsole(`${data.symbol} scan: ${data.prediction.class} at ${(data.prediction.probability * 100).toFixed(0)}%.`);
    setStatus(el.forecastStatus, "Scan complete. Use the chain for a paper trade or record the later outcome.", "success");
    queueSave();
  } catch (error) {
    setStatus(el.forecastStatus, error instanceof Error ? error.message : String(error), "error");
  } finally {
    render();
  }
}

async function refreshModelStatus() {
  try {
    const data = await api<{
      ok: true;
      model: null | {
        name: string;
        weights: Record<string, number>;
        metrics: { accuracy: number; brier: number; training_rows: number; user_rows?: number };
      };
    }>("/api/models/latest");
    if (!data.model) return;
    state.modelReady = true;
    state.modelName = data.model.name;
    state.modelMetrics = data.model.metrics;
    state.featureImportance = essenceKeys.map((name) => ({ name, value: Math.abs(Number(data.model?.weights[name] || 0)) }));
    const total = state.featureImportance.reduce((sum, item) => sum + item.value, 0) || 1;
    state.featureImportance = state.featureImportance
      .map((item) => ({ ...item, value: Math.round((item.value / total) * 100) }))
      .sort((a, b) => b.value - a.value);
  } catch {
    state.modelReady = false;
  }
}

async function refreshLeaderboard() {
  try {
    const data = await api<{ ok: true; leaders: Array<{ display_name: string; level: number; xp: number }> }>("/api/leaderboard");
    const leaders = data.leaders.length
      ? data.leaders
      : [{ display_name: session?.user?.display_name || "You", level: state.level, xp: state.xp }];
    const index = leaders.findIndex((leader) => leader.display_name === session?.user?.display_name);
    state.rank = index >= 0 ? String(index + 1) : "-";
    if (!el.leaderboard) return;
    el.leaderboard.innerHTML = leaders
      .slice(0, 10)
      .map(
        (leader, idx) => `
          <div class="leader-row">
            <span>${idx + 1}</span>
            <strong>${escapeHtml(leader.display_name)}</strong>
            <em>LVL ${leader.level}</em>
            <b>${leader.xp.toLocaleString()} XP</b>
          </div>
        `,
      )
      .join("");
  } catch {
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
      if (el.brokerMode) el.brokerMode.textContent = "Disconnected";
      setStatus(el.tradierStatus, "No Tradier token stored for this account.");
      return;
    }
    if (el.brokerMode) el.brokerMode.textContent = `${data.broker.mode} ${data.broker.account_id_masked}`;
    setStatus(el.tradierStatus, data.profile?.name ? `Connected for ${data.profile.name}.` : "Connected.", "success");
  } catch (error) {
    if (el.brokerMode) el.brokerMode.textContent = "Unavailable";
    setStatus(el.tradierStatus, error instanceof Error ? error.message : String(error), "error");
  }
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

function render() {
  const dayPnl = state.balance - state.initialBalance;
  const quote = getQuote(state.selectedSymbol);
  const features = buildFeatures();
  const decision = decisionText(state.forecast);
  if (el.sessionChip) el.sessionChip.textContent = session?.user?.display_name || "Trader";
  if (el.equity) el.equity.textContent = money(state.balance);
  if (el.dayPnl) {
    el.dayPnl.textContent = money(dayPnl);
    el.dayPnl.classList.toggle("positive", dayPnl >= 0);
    el.dayPnl.classList.toggle("negative", dayPnl < 0);
  }
  if (el.level) el.level.textContent = String(state.level);
  if (el.rank) el.rank.textContent = state.rank;
  if (el.decisionAction) el.decisionAction.textContent = decision.action;
  if (el.decisionCopy) el.decisionCopy.textContent = decision.copy;
  if (el.marketRegime) el.marketRegime.textContent = marketRegime(features);
  if (el.riskRead) el.riskRead.textContent = riskRead(features, state.forecast);
  if (el.xpProgress) el.xpProgress.textContent = `${state.xp} / ${state.level * 140}`;
  if (el.underlyingPrice) el.underlyingPrice.textContent = money(quote.price);
  if (el.expectedMove) {
    el.expectedMove.textContent = pct(quote.changePercent);
    el.expectedMove.classList.toggle("positive", quote.changePercent >= 0);
    el.expectedMove.classList.toggle("negative", quote.changePercent < 0);
  }
  if (el.portfolioTitle) el.portfolioTitle.textContent = `${state.paperMode === "paper" ? "Paper" : "Shadow"} Portfolio Velocity`;
  if (el.chainTitle) el.chainTitle.textContent = `${state.selectedSymbol} Contracts`;
  if (el.dataFreshness) el.dataFreshness.textContent = `Synthetic paper feed - ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  renderWatchlist();
  renderChart();
  renderChain();
  renderModel();
  renderInference();
  renderJournal();
  renderLab();
  renderResearchLab();
  renderChallenges();
}

function renderWatchlist() {
  if (!el.watchlist) return;
  el.watchlist.innerHTML = buildWatchlist()
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
      state.selectedSymbol = cleanSymbol(button.dataset.symbol || "SPY");
      if (el.symbolInput) el.symbolInput.value = state.selectedSymbol;
      void forecastSymbol();
    });
  });
}

function renderChart() {
  if (!el.equityChart) return;
  const width = 720;
  const height = 220;
  const values = state.pnlHistory.length ? state.pnlHistory : [{ time: "Now", value: state.balance }];
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
    <svg viewBox="0 0 ${width} ${height}" role="img" aria-label="Paper account equity curve">
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
  const options = buildOptions();
  el.optionChain.innerHTML = options
    .map(
      (option) => `
        <button class="option-row" type="button" data-option="${option.optionSymbol}">
          <span class="contract-type ${option.type}">${option.type === "call" ? "C" : "P"}</span>
          <span><strong>${money(option.strike)}</strong><small>${option.expiration}</small></span>
          <span><strong>${money(option.lastPrice)}</strong><small>IV ${(option.impliedVolatility * 100).toFixed(0)}%</small></span>
          <span><strong>${option.openInterest.toLocaleString()}</strong><small>OI / ${option.volume.toLocaleString()} vol</small></span>
          <span class="edge-cell"><strong>${Math.round(option.predictionScore * 100)}%</strong><small>Edge</small><span class="score-bar"><i class="${widthClass(
            option.predictionScore * 100,
          )}"></i></span></span>
        </button>
      `,
    )
    .join("");
  el.optionChain.querySelectorAll<HTMLButtonElement>("[data-option]").forEach((button) => {
    button.addEventListener("click", () => {
      const option = options.find((item) => item.optionSymbol === button.dataset.option);
      if (!option) return;
      if (el.orderSymbol) el.orderSymbol.value = state.selectedSymbol;
      if (el.orderOptionSymbol) el.orderOptionSymbol.value = option.optionSymbol;
      if (el.orderPrice) el.orderPrice.value = option.lastPrice.toFixed(2);
      simulateTrade(option);
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
      ? `Brier ${state.modelMetrics.brier} - ${state.modelMetrics.user_rows || 0} user rows`
      : `${state.samples.length} rows collected`;
  }
  if (el.importanceList) {
    el.importanceList.innerHTML = state.featureImportance
      .slice(0, 5)
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
  const forecast = state.forecast;
  if (el.oracleClass) el.oracleClass.textContent = forecast ? forecast.class.replace("_", " ") : "No scan";
  if (el.coachNote) {
    if (!forecast) {
      el.coachNote.textContent = "Train a model, then scan a symbol. The coach will flag liquidity, volatility, and no-trade risk.";
    } else if (forecast.contract === "wait") {
      el.coachNote.textContent = "No-trade is a valid answer. The platform should reward patience when edge is unclear.";
    } else {
      el.coachNote.textContent = `${forecast.symbol} favors a ${forecast.contract.toUpperCase()} read, but size and liquidity still matter more than confidence.`;
    }
  }
  if (!el.inferenceStrip) return;
  if (!forecast) {
    el.inferenceStrip.innerHTML = "<p>No inference yet. Scan a symbol from the trading desk.</p>";
    return;
  }
  el.inferenceStrip.innerHTML = `
    <div><dt>Bias</dt><dd>${forecast.contract.toUpperCase()}</dd><small>${forecast.symbol}</small></div>
    <div><dt>Confidence</dt><dd>${(forecast.probability * 100).toFixed(0)}%</dd></div>
    <div><dt>Liquidity</dt><dd>${Math.round(((forecast.features.liquidity + 1) / 2) * 100)}%</dd></div>
    <div><dt>IV Rank</dt><dd>${Math.round(((forecast.features.iv_rank + 1) / 2) * 100)}%</dd></div>
  `;
}

function renderJournal() {
  if (el.tradeCount) el.tradeCount.textContent = `${state.trades.length} trades`;
  if (!el.tradeJournal) return;
  if (!state.trades.length) {
    el.tradeJournal.innerHTML = "<p>No paper trades yet. Click a contract in the option chain to simulate one.</p>";
    return;
  }
  el.tradeJournal.innerHTML = state.trades
    .slice(0, 6)
    .map(
      (trade) => `
        <div class="trade-row">
          <span><strong>${trade.symbol} ${trade.side.toUpperCase()}</strong><small>${trade.time} - ${trade.optionSymbol}</small></span>
          <span><b class="${trade.pnl >= 0 ? "positive" : "negative"}">${money(trade.pnl)}</b><small>Score ${(trade.score * 100).toFixed(0)}%</small></span>
        </div>
      `,
    )
    .join("");
}

function renderLab() {
  renderChoiceList(el.architectureList, architectures, state.pipeline.architecture, (id) => {
    const selected = architectures.find((item) => item.id === id) || architectures[0];
    state.pipeline.architecture = selected.id;
    state.pipeline.architectureType = selected.type;
    render();
    queueSave();
  });
  renderChoiceList(
    el.featureList,
    essenceKeys.map((key) => ({ id: key, type: featureLabels[key] })),
    "",
    (id) => {
      const feature = id as EssenceKey;
      state.pipeline.features = state.pipeline.features.includes(feature)
        ? state.pipeline.features.filter((item) => item !== feature)
        : [...state.pipeline.features, feature];
      render();
      queueSave();
    },
    state.pipeline.features,
  );
  renderChoiceList(
    el.optimizerList,
    optimizers.map((id) => ({ id, type: "Optimizer" })),
    state.pipeline.optimizer,
    (id) => {
      state.pipeline.optimizer = id;
      render();
      queueSave();
    },
  );
  if (el.pipelineInputs) {
    el.pipelineInputs.textContent = state.pipeline.features.length
      ? state.pipeline.features.map((feature) => featureLabels[feature]).join(" + ")
      : "No inputs connected";
  }
  if (el.pipelineCore) el.pipelineCore.textContent = state.pipeline.architecture;
  if (el.pipelineType) el.pipelineType.textContent = state.pipeline.architectureType;
  if (el.pipelineOptimizer) el.pipelineOptimizer.textContent = state.pipeline.optimizer;
  if (el.pipelineComplexity) el.pipelineComplexity.textContent = `${(1.2 + state.pipeline.features.length * 0.4).toFixed(1)}M params`;
  if (el.trainingRowCount) el.trainingRowCount.textContent = String(state.samples.length);
  if (el.trainingXp) el.trainingXp.textContent = `+${55 + state.pipeline.features.length * 8} XP`;
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

function renderResearchLab() {
  const featureCount = state.pipeline.features.length;
  const sampleCount = state.samples.length;
  const modelScore = state.modelMetrics?.accuracy || 0;
  const readiness =
    state.modelReady && sampleCount >= 25 ? "Ready for replay" : sampleCount >= 6 ? "Research mode" : "Needs labels";
  if (el.dataReadiness) el.dataReadiness.textContent = readiness;
  if (el.contextBudget) el.contextBudget.textContent = `${Math.min(8, featureCount + 3)} / 8 signals`;
  if (el.leakageBadge) {
    el.leakageBadge.textContent = sampleCount >= 6 ? "Point-in-time check on" : "Needs more rows";
  }
  if (el.providerGrid) {
    el.providerGrid.innerHTML = dataProviders
      .map(
        (provider) => `
          <button class="provider-card" type="button" data-provider="${escapeHtml(provider.name)}">
            <span>${provider.status}</span>
            <strong>${provider.name}</strong>
            <small>${provider.kind}</small>
            <em>${provider.copy}</em>
          </button>
        `,
      )
      .join("");
    el.providerGrid.querySelectorAll<HTMLButtonElement>("[data-provider]").forEach((button) => {
      button.addEventListener("click", () => {
        pushConsole(`${button.dataset.provider} queued for research-data curation.`);
      });
    });
  }
  if (el.contextMap) {
    const selectedFeatures = state.pipeline.features.length ? state.pipeline.features : ["momentum", "volatility"];
    el.contextMap.innerHTML = `
      <div class="context-column">
        <span>Possible Context</span>
        <b>Docs</b>
        <b>Tools</b>
        <b>Memory</b>
        <b>Market tape</b>
      </div>
      <div class="context-arrow">Curate</div>
      <div class="context-column active">
        <span>Model Window</span>
        <b>System: risk first</b>
        ${selectedFeatures.map((feature) => `<b>${featureLabels[feature]}</b>`).join("")}
        <b>Labels: ${sampleCount}</b>
      </div>
      <div class="context-arrow">Score</div>
      <div class="context-column output">
        <span>Output</span>
        <b>${state.forecast?.contract.toUpperCase() || "WAIT"}</b>
        <b>${state.forecast ? `${(state.forecast.probability * 100).toFixed(0)}% confidence` : "No scan yet"}</b>
      </div>
    `;
  }
  if (el.validationGrid) {
    const trainRows = state.modelMetrics?.training_rows || Math.max(8, sampleCount);
    const walkForward = modelScore ? Math.max(42, Math.round(modelScore * 82)) : 52;
    const brier = state.modelMetrics?.brier ?? 0.25;
    const noTrade = Math.max(18, 52 - featureCount * 5);
    el.validationGrid.innerHTML = `
      <div><dt>Train rows</dt><dd>${trainRows}</dd><small>Point-in-time only</small></div>
      <div><dt>Walk-forward</dt><dd>${walkForward}%</dd><small>Paper replay target</small></div>
      <div><dt>Brier</dt><dd>${brier.toFixed(3)}</dd><small>Calibration score</small></div>
      <div><dt>No-trade gate</dt><dd>${noTrade}%</dd><small>Abstention pressure</small></div>
    `;
  }
  if (el.labelLab) {
    el.labelLab.innerHTML = labelRecipes
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

function renderChallenges() {
  if (!el.challengeList) return;
  el.challengeList.innerHTML = challenges
    .map(
      (challenge) => `
        <div class="challenge-row">
          <span><strong>${challenge.name}</strong><small>${challenge.copy}</small></span>
          <b>${challenge.reward}</b>
        </div>
      `,
    )
    .join("");
}

function switchView(view: ViewName) {
  document.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.viewPanel === view);
  });
  document.querySelectorAll<HTMLButtonElement>("[data-view]").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  if (view === "league") void refreshLeaderboard().then(render);
  if (view === "vault") void refreshTradierStatus();
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" })[char] || char);
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
  el.openLab?.addEventListener("click", () => switchView("lab"));
  el.scanSymbol?.addEventListener("click", () => void forecastSymbol());
  el.refreshMarket?.addEventListener("click", render);
  el.symbolInput?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") void forecastSymbol();
  });
  el.paperDrill?.addEventListener("click", runPaperDrill);
  el.recordCall?.addEventListener("click", () => recordOutcome("call"));
  el.recordPut?.addEventListener("click", () => recordOutcome("put"));
  el.trainModel?.addEventListener("click", () => void trainModel());
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
      pushConsole("Tradier preview requested through server-side vault.");
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
  pushConsole("Desk initialized. Paper mode active.");
  try {
    const saved = await api<{ ok: true; state: unknown }>("/api/game/state");
    hydrate(saved.state);
  } catch {
    pushConsole("No saved cockpit state found.");
  }
  await refreshModelStatus();
  await refreshLeaderboard();
  render();
  void refreshTradierStatus();
}

void boot().catch((error) => {
  document.body.innerHTML = `<main class="fatal-error"><h1>Option Oracle could not start</h1><p>${escapeHtml(
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
    `Option Oracle Arena`,
    `symbol=${state.selectedSymbol}`,
    `balance=${state.balance}`,
    `level=${state.level}`,
    `samples=${state.samples.length}`,
    `modelReady=${state.modelReady}`,
    `trades=${state.trades.length}`,
    `latestPreview=${latestPreview ? "yes" : "no"}`,
  ].join("\n");

window.advanceTime = () => {
  render();
};
