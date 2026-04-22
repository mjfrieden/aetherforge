import Phaser from "phaser";
import { api, getSession, type SessionPayload } from "../api";

import arenaUrl from "../../assets/generated/battle-cloud-colosseum.png";
import creaturesUrl from "../../assets/generated/option-creatures-sheet.png";

type EssenceKey = "momentum" | "volatility" | "sentiment" | "liquidity" | "iv_rank";
type SpriteKey = "delta-hawk" | "theta-tortoise" | "vega-wisp" | "gamma-hydra";
type ContractBias = "auto" | "call" | "put";
type ContractSide = "call" | "put" | "wait";
type StationKind = "oracle" | "market" | "broker" | "guild" | "arena";

type Companion = {
  id: string;
  name: string;
  sprite: SpriteKey;
  role: string;
  level: number;
  xp: number;
  thesis: string;
};

type SignalSample = Record<EssenceKey, number> & { label: number };

type ForecastRecord = {
  symbol: string;
  contract: ContractSide;
  probability: number;
  class: string;
  features: Record<EssenceKey, number>;
};

type Peer = {
  displayName: string;
  level: number;
  xp: number;
  x: number;
  y: number;
  sprite: SpriteKey;
};

type MmoState = {
  level: number;
  xp: number;
  samples: SignalSample[];
  essence: Record<EssenceKey, number>;
  player: { x: number; y: number };
  signalsCollected: number;
  questStage: number;
  rank: string;
  roster: Companion[];
  activeCompanionId: string;
  contractBias: ContractBias;
  forecast: ForecastRecord | null;
  modelReady: boolean;
  modelSummary: string;
  notice: string;
  busy: boolean;
  onlinePeers: Peer[];
};

type Station = {
  id: string;
  kind: StationKind;
  name: string;
  x: number;
  y: number;
  radius: number;
  prompt: string;
  description: string;
};

type SignalNode = {
  id: string;
  name: string;
  key: EssenceKey;
  side: Exclude<ContractSide, "wait">;
  x: number;
  y: number;
  features: Record<EssenceKey, number>;
  label: number;
};

type MovementKeys = {
  up: Phaser.Input.Keyboard.Key;
  down: Phaser.Input.Keyboard.Key;
  left: Phaser.Input.Keyboard.Key;
  right: Phaser.Input.Keyboard.Key;
  upAlt: Phaser.Input.Keyboard.Key;
  downAlt: Phaser.Input.Keyboard.Key;
  leftAlt: Phaser.Input.Keyboard.Key;
  rightAlt: Phaser.Input.Keyboard.Key;
  interact: Phaser.Input.Keyboard.Key;
  sprint: Phaser.Input.Keyboard.Key;
  fullscreen: Phaser.Input.Keyboard.Key;
};

const worldWidth = 2200;
const worldHeight = 1500;
const essenceKeys: EssenceKey[] = ["momentum", "volatility", "sentiment", "liquidity", "iv_rank"];
const nodeCooldownMs = 45_000;

let csrfToken = "";
let session: SessionPayload | null = null;
let phaserGame: Phaser.Game | null = null;
let sceneRef: WorldScene | null = null;
let latestPreview: Record<string, unknown> | null = null;
const nodeCooldowns: Record<string, number> = {};
let saveTimer = 0;
let activeInteractableId = "";

const el = {
  trainerChip: document.querySelector<HTMLElement>("#trainer-chip"),
  playerName: document.querySelector<HTMLElement>("#player-name"),
  logout: document.querySelector<HTMLButtonElement>("#logout-btn"),
  fullscreen: document.querySelector<HTMLButtonElement>("#fullscreen-btn"),
  interactionPrompt: document.querySelector<HTMLElement>("#interaction-prompt"),
  level: document.querySelector<HTMLElement>("#level-value"),
  xp: document.querySelector<HTMLElement>("#xp-value"),
  xpFill: document.querySelector<HTMLElement>("#xp-fill"),
  samples: document.querySelector<HTMLElement>("#sample-value"),
  rank: document.querySelector<HTMLElement>("#rank-value"),
  worldMode: document.querySelector<HTMLElement>("#world-mode"),
  worldStatus: document.querySelector<HTMLElement>("#world-status"),
  questTitle: document.querySelector<HTMLElement>("#quest-title"),
  questCopy: document.querySelector<HTMLElement>("#quest-copy"),
  essenceList: document.querySelector<HTMLElement>("#essence-list"),
  companionList: document.querySelector<HTMLElement>("#companion-list"),
  train: document.querySelector<HTMLButtonElement>("#train-btn"),
  paperDrill: document.querySelector<HTMLButtonElement>("#paper-drill-btn"),
  predict: document.querySelector<HTMLButtonElement>("#predict-btn"),
  predictSymbol: document.querySelector<HTMLInputElement>("#predict-symbol"),
  contractBias: document.querySelector<HTMLSelectElement>("#contract-bias"),
  modelStatus: document.querySelector<HTMLElement>("#model-status"),
  forecastStatus: document.querySelector<HTMLElement>("#forecast-status"),
  forecastCard: document.querySelector<HTMLElement>("#forecast-card"),
  recordCall: document.querySelector<HTMLButtonElement>("#record-call-btn"),
  recordPut: document.querySelector<HTMLButtonElement>("#record-put-btn"),
  tradierForm: document.querySelector<HTMLFormElement>("#tradier-form"),
  tradierToken: document.querySelector<HTMLInputElement>("#tradier-token"),
  tradierAccount: document.querySelector<HTMLInputElement>("#tradier-account"),
  tradierMode: document.querySelector<HTMLSelectElement>("#tradier-mode"),
  brokerMode: document.querySelector<HTMLElement>("#broker-mode"),
  tradierStatus: document.querySelector<HTMLElement>("#tradier-status"),
  brokerPanel: document.querySelector<HTMLDetailsElement>("#broker-panel"),
  orderPanel: document.querySelector<HTMLDetailsElement>("#order-panel"),
  orderForm: document.querySelector<HTMLFormElement>("#order-form"),
  orderAsset: document.querySelector<HTMLInputElement>("#order-asset"),
  orderSide: document.querySelector<HTMLInputElement>("#order-side"),
  orderSymbol: document.querySelector<HTMLInputElement>("#order-symbol"),
  orderQuantity: document.querySelector<HTMLInputElement>("#order-quantity"),
  orderOptionSymbol: document.querySelector<HTMLInputElement>("#order-option-symbol"),
  orderType: document.querySelector<HTMLSelectElement>("#order-type"),
  orderPrice: document.querySelector<HTMLInputElement>("#order-price"),
  orderConfirm: document.querySelector<HTMLInputElement>("#order-confirm"),
  placeOrder: document.querySelector<HTMLButtonElement>("#place-order-btn"),
  orderStatus: document.querySelector<HTMLElement>("#order-status"),
};

const starterRoster: Companion[] = [
  {
    id: "delta-hawk",
    name: "Delta Hawk",
    sprite: "delta-hawk",
    role: "Call scout",
    level: 5,
    xp: 0,
    thesis: "Breakout momentum and short-term call setups.",
  },
  {
    id: "gamma-hydra",
    name: "Gamma Hydra",
    sprite: "gamma-hydra",
    role: "Put scout",
    level: 5,
    xp: 0,
    thesis: "Breakdown pressure and short-term put setups.",
  },
  {
    id: "vega-wisp",
    name: "Vega Wisp",
    sprite: "vega-wisp",
    role: "Volatility scout",
    level: 5,
    xp: 0,
    thesis: "Expansion, events, IV rank, and whipsaw risk.",
  },
  {
    id: "theta-tortoise",
    name: "Theta Tortoise",
    sprite: "theta-tortoise",
    role: "Risk steward",
    level: 5,
    xp: 0,
    thesis: "Patience, liquidity, no-trade discipline, and position sizing.",
  },
];

const stations: Station[] = [
  {
    id: "oracle-forge",
    kind: "oracle",
    name: "Oracle Forge",
    x: 470,
    y: 420,
    radius: 125,
    prompt: "Press E to train your AI oracle",
    description: "Turn labeled call/put outcomes into a personal short-term prediction model.",
  },
  {
    id: "market-scryer",
    kind: "market",
    name: "Market Scryer",
    x: 1130,
    y: 350,
    radius: 120,
    prompt: "Press E to scan a symbol",
    description: "Ask the trained oracle for a short-term single call or put read.",
  },
  {
    id: "tradier-vault",
    kind: "broker",
    name: "Tradier Vault",
    x: 1740,
    y: 710,
    radius: 120,
    prompt: "Press E to open broker vault",
    description: "Connect your own Tradier account and preview single-leg orders server-side.",
  },
  {
    id: "guild-board",
    kind: "guild",
    name: "Sky Guild Board",
    x: 610,
    y: 1120,
    radius: 110,
    prompt: "Press E to refresh nearby players",
    description: "See other trainers as leaderboard ghosts around the city.",
  },
  {
    id: "paper-arena",
    kind: "arena",
    name: "Paper Arena",
    x: 1525,
    y: 1165,
    radius: 120,
    prompt: "Press E to run a paper contract drill",
    description: "Generate one labeled training outcome without touching a broker account.",
  },
];

const signalNodes: SignalNode[] = [
  {
    id: "breakout-wisp",
    name: "Breakout Wisp",
    key: "momentum",
    side: "call",
    x: 840,
    y: 515,
    label: 1,
    features: { momentum: 0.82, volatility: -0.18, sentiment: 0.55, liquidity: 0.74, iv_rank: -0.28 },
  },
  {
    id: "dip-flame",
    name: "Dip Flame",
    key: "liquidity",
    side: "call",
    x: 1280,
    y: 675,
    label: 1,
    features: { momentum: 0.46, volatility: -0.34, sentiment: 0.22, liquidity: 0.88, iv_rank: -0.42 },
  },
  {
    id: "breakdown-rune",
    name: "Breakdown Rune",
    key: "sentiment",
    side: "put",
    x: 1820,
    y: 1035,
    label: 0,
    features: { momentum: -0.78, volatility: 0.42, sentiment: -0.68, liquidity: 0.42, iv_rank: 0.22 },
  },
  {
    id: "storm-echo",
    name: "Storm Echo",
    key: "volatility",
    side: "put",
    x: 1000,
    y: 1135,
    label: 0,
    features: { momentum: -0.36, volatility: 0.83, sentiment: -0.35, liquidity: 0.18, iv_rank: 0.76 },
  },
  {
    id: "iv-orb",
    name: "IV Orb",
    key: "iv_rank",
    side: "put",
    x: 385,
    y: 875,
    label: 0,
    features: { momentum: -0.18, volatility: 0.68, sentiment: -0.2, liquidity: 0.32, iv_rank: 0.92 },
  },
  {
    id: "breadth-laurel",
    name: "Breadth Laurel",
    key: "sentiment",
    side: "call",
    x: 1485,
    y: 425,
    label: 1,
    features: { momentum: 0.62, volatility: 0.08, sentiment: 0.7, liquidity: 0.66, iv_rank: -0.08 },
  },
];

const state: MmoState = {
  level: 1,
  xp: 0,
  samples: [],
  essence: { momentum: 0, volatility: 0, sentiment: 0, liquidity: 0, iv_rank: 0 },
  player: { x: 1050, y: 820 },
  signalsCollected: 0,
  questStage: 0,
  rank: "-",
  roster: starterRoster.map((companion) => ({ ...companion })),
  activeCompanionId: "delta-hawk",
  contractBias: "auto",
  forecast: null,
  modelReady: false,
  modelSummary: "Collect labeled call/put outcomes, then train the oracle.",
  notice: "Move through Cloudspire. Signal wisps become training examples for your oracle.",
  busy: false,
  onlinePeers: [],
};

function clamp(value: number, min = -1, max = 1) {
  return Math.max(min, Math.min(max, value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function activeCompanion() {
  return state.roster.find((companion) => companion.id === state.activeCompanionId) || state.roster[0];
}

function setStatus(target: HTMLElement | null, message: string, tone: "error" | "success" | "" = "") {
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", tone === "error");
  target.classList.toggle("success", tone === "success");
}

function hashSymbol(symbol: string) {
  let total = 0;
  for (let index = 0; index < symbol.length; index += 1) {
    total = (total * 31 + symbol.charCodeAt(index)) % 997;
  }
  return total / 997;
}

function currentSymbol() {
  return String(el.predictSymbol?.value || "SPY").trim().toUpperCase().replace(/[^A-Z0-9.-]/g, "").slice(0, 12) || "SPY";
}

function buildCurrentFeatures(): Record<EssenceKey, number> {
  const symbol = currentSymbol();
  const symbolSeed = hashSymbol(symbol) - 0.5;
  const last = state.samples[state.samples.length - 1];
  const essenceBias = Object.fromEntries(
    essenceKeys.map((key) => [key, clamp((state.essence[key] - 48) / 80)]),
  ) as Record<EssenceKey, number>;
  const base: Record<EssenceKey, number> = {
    momentum: clamp((last?.momentum ?? symbolSeed) * 0.68 + essenceBias.momentum * 0.32),
    volatility: clamp((last?.volatility ?? -symbolSeed) * 0.62 + essenceBias.volatility * 0.38),
    sentiment: clamp((last?.sentiment ?? symbolSeed * 0.7) * 0.65 + essenceBias.sentiment * 0.35),
    liquidity: clamp((last?.liquidity ?? 0.55) * 0.72 + essenceBias.liquidity * 0.28),
    iv_rank: clamp((last?.iv_rank ?? -symbolSeed * 0.8) * 0.64 + essenceBias.iv_rank * 0.36),
  };

  if (state.contractBias === "call") {
    base.momentum = clamp(base.momentum + 0.2);
    base.sentiment = clamp(base.sentiment + 0.14);
  }
  if (state.contractBias === "put") {
    base.momentum = clamp(base.momentum - 0.2);
    base.volatility = clamp(base.volatility + 0.14);
    base.sentiment = clamp(base.sentiment - 0.12);
  }
  return base;
}

function questCopy() {
  if (state.questStage <= 0) {
    return {
      title: "First Signal Run",
      copy: `Gather ${Math.max(0, 3 - state.signalsCollected)} more signal wisps, then train your first oracle.`,
    };
  }
  if (state.questStage === 1) {
    return {
      title: "Forge The Oracle",
      copy: "Use the Oracle Forge to train a personal model from your collected call/put outcomes.",
    };
  }
  if (state.questStage === 2) {
    return {
      title: "Read The Market",
      copy: "Scan a stock symbol at the Market Scryer for a short-term single call or put read.",
    };
  }
  if (state.questStage === 3) {
    return {
      title: "Preview, Then Decide",
      copy: "Use the Order Shrine to preview a single-leg option order. Sandbox mode stays the default.",
    };
  }
  return {
    title: "Iterate The Edge",
    copy: "Gather labels, record real outcomes, retrain, and compare the oracle against short-term call/put results.",
  };
}

function updateQuestProgress() {
  if (state.signalsCollected >= 3 && state.questStage < 1) state.questStage = 1;
  if (state.modelReady && state.questStage < 2) state.questStage = 2;
  if (state.forecast && state.questStage < 3) state.questStage = 3;
  if (latestPreview && state.questStage < 4) state.questStage = 4;
}

function gainXp(amount: number) {
  state.xp += amount;
  const nextLevel = state.level * 120;
  if (state.xp >= nextLevel) {
    state.xp -= nextLevel;
    state.level += 1;
    state.notice = `Level ${state.level}. Your market craft sharpened.`;
  }
  const companion = activeCompanion();
  companion.xp += Math.round(amount * 0.55);
  if (companion.xp >= companion.level * 90) {
    companion.xp = 0;
    companion.level += 1;
    state.notice = `${companion.name} reached level ${companion.level}.`;
  }
}

function addSample(sample: SignalSample, source: string, key: EssenceKey) {
  state.samples.push(sample);
  state.samples = state.samples.slice(-160);
  state.essence[key] = Math.min(999, state.essence[key] + 12);
  state.signalsCollected += 1;
  gainXp(24);
  state.notice = `${source} added a ${sample.label >= 0.5 ? "call" : "put"} outcome to your training set.`;
  updateQuestProgress();
  renderHud();
  queueSave();
}

function collectSignal(node: SignalNode) {
  const now = Date.now();
  if ((nodeCooldowns[node.id] || 0) > now) {
    const seconds = Math.ceil((nodeCooldowns[node.id] - now) / 1000);
    state.notice = `${node.name} is still recharging for ${seconds}s.`;
    renderHud();
    return;
  }
  nodeCooldowns[node.id] = now + nodeCooldownMs;
  addSample({ ...node.features, label: node.label }, node.name, node.key);
  sceneRef?.pulseNode(node.id);
}

function sampleFromDrill() {
  const features = buildCurrentFeatures();
  const callScore = features.momentum + features.sentiment + features.liquidity * 0.35 - features.iv_rank * 0.28;
  const putScore = -features.momentum + features.volatility * 0.55 - features.sentiment * 0.3 + features.iv_rank * 0.15;
  const label = callScore >= putScore ? 1 : 0;
  const key: EssenceKey = label ? "momentum" : "volatility";
  addSample({ ...features, label }, "Paper contract drill", key);
}

function recordOutcome(side: Exclude<ContractSide, "wait">) {
  if (!state.forecast) {
    setStatus(el.forecastStatus, "Scan a symbol before recording the outcome.", "error");
    return;
  }
  const label = side === "call" ? 1 : 0;
  const key: EssenceKey = side === "call" ? "momentum" : "sentiment";
  addSample({ ...state.forecast.features, label }, `${state.forecast.symbol} ${side.toUpperCase()} result`, key);
  setStatus(el.forecastStatus, `${side.toUpperCase()} outcome recorded. Retrain when ready.`, "success");
}

function serializeGameState() {
  return {
    level: state.level,
    xp: state.xp,
    wins: state.signalsCollected,
    activeCreatureId: state.activeCompanionId,
    roster: state.roster.map(({ id, name, role, level, xp, sprite }) => ({ id, name, role, level, xp, sprite })),
    essence: state.essence,
    samples: state.samples.slice(-160),
    last_symbol: currentSymbol(),
    player: state.player,
    profession: {
      signalsCollected: state.signalsCollected,
      questStage: state.questStage,
      contractBias: state.contractBias,
      forecast: state.forecast,
    },
  };
}

function hydrate(saved: unknown) {
  if (!saved || typeof saved !== "object") return;
  const data = saved as Partial<ReturnType<typeof serializeGameState>>;
  state.level = Number(data.level || 1);
  state.xp = Number(data.xp || 0);
  state.signalsCollected = Number(data.profession?.signalsCollected ?? data.wins ?? 0);
  state.questStage = Number(data.profession?.questStage || 0);
  state.contractBias = (data.profession?.contractBias || "auto") as ContractBias;
  state.forecast = (data.profession?.forecast || null) as ForecastRecord | null;
  state.samples = Array.isArray(data.samples) ? (data.samples.slice(-160) as SignalSample[]) : [];
  state.essence = { ...state.essence, ...(data.essence || {}) };
  if (data.player) {
    state.player.x = clamp(Number(data.player.x || state.player.x), 120, worldWidth - 120);
    state.player.y = clamp(Number(data.player.y || state.player.y), 120, worldHeight - 120);
  }
  if (Array.isArray(data.roster) && data.roster.length) {
    state.roster = starterRoster.map((starter) => {
      const savedCompanion = data.roster?.find((companion) => companion.id === starter.id);
      return savedCompanion
        ? {
            ...starter,
            level: Number(savedCompanion.level || starter.level),
            xp: Number(savedCompanion.xp || 0),
          }
        : { ...starter };
    });
  }
  state.activeCompanionId = data.activeCreatureId || state.activeCompanionId;
  if (data.last_symbol && el.predictSymbol) el.predictSymbol.value = String(data.last_symbol);
  if (el.contractBias) el.contractBias.value = state.contractBias;
  updateQuestProgress();
}

async function saveGameState() {
  await api("/api/game/state", {
    method: "POST",
    csrfToken,
    body: JSON.stringify({ state: serializeGameState() }),
  });
}

function queueSave() {
  window.clearTimeout(saveTimer);
  saveTimer = window.setTimeout(() => {
    void saveGameState().catch(() => {});
  }, 400);
}

async function loadGameState() {
  const data = await api<{ ok: true; state: unknown }>("/api/game/state");
  hydrate(data.state);
}

async function trainModel() {
  state.busy = true;
  renderHud();
  setStatus(el.modelStatus, "Training your personal oracle...");
  try {
    const data = await api<{
      ok: true;
      model: { metrics: { accuracy: number; brier: number; training_rows: number; user_rows: number } };
    }>("/api/models/train", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ name: "Cloudspire Oracle", samples: state.samples }),
    });
    state.modelReady = true;
    state.modelSummary = `Cloudspire Oracle: ${(data.model.metrics.accuracy * 100).toFixed(0)}% fit, Brier ${data.model.metrics.brier}, ${data.model.metrics.user_rows} user rows.`;
    state.notice = "Oracle trained. Bring it to the Market Scryer for a call/put scan.";
    gainXp(40);
    updateQuestProgress();
    setStatus(el.modelStatus, state.modelSummary, "success");
    queueSave();
  } catch (error) {
    setStatus(el.modelStatus, error instanceof Error ? error.message : String(error), "error");
  } finally {
    state.busy = false;
    renderHud();
  }
}

async function forecastSymbol() {
  if (!state.modelReady) {
    setStatus(el.forecastStatus, "Train your oracle before scanning symbols.", "error");
    return;
  }
  const symbol = currentSymbol();
  const features = buildCurrentFeatures();
  setStatus(el.forecastStatus, `Scanning ${symbol} through the oracle...`);
  try {
    const data = await api<{
      ok: true;
      symbol: string;
      prediction: { probability: number; class: string; features: Record<EssenceKey, number> };
    }>("/api/models/predict", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ symbol, features }),
    });
    let contract: ContractSide = "wait";
    if (state.contractBias === "call") contract = "call";
    else if (state.contractBias === "put") contract = "put";
    else if (data.prediction.class === "call_edge") contract = "call";
    else if (data.prediction.class === "put_hedge") contract = "put";

    state.forecast = {
      symbol: data.symbol,
      contract,
      probability: data.prediction.probability,
      class: data.prediction.class,
      features,
    };
    state.notice = `${data.symbol}: oracle reads ${data.prediction.class.replace("_", " ")}.`;
    if (el.orderSymbol) el.orderSymbol.value = data.symbol;
    if (el.orderOptionSymbol) {
      const typeLetter = contract === "put" ? "P" : "C";
      el.orderOptionSymbol.placeholder = `${data.symbol}260515${typeLetter}00500000`;
    }
    gainXp(18);
    updateQuestProgress();
    setStatus(el.forecastStatus, "Scan complete. Record the later call/put outcome to improve the next model.", "success");
    renderHud();
    queueSave();
  } catch (error) {
    setStatus(el.forecastStatus, error instanceof Error ? error.message : String(error), "error");
  }
}

async function refreshModelStatus() {
  try {
    const data = await api<{
      ok: true;
      model: null | { name: string; metrics: { accuracy: number; brier: number; user_rows?: number } };
    }>("/api/models/latest");
    if (!data.model) {
      state.modelReady = false;
      state.modelSummary = "Collect labeled call/put outcomes, then train the oracle.";
      setStatus(el.modelStatus, state.modelSummary);
      return;
    }
    state.modelReady = true;
    state.modelSummary = `${data.model.name}: ${(data.model.metrics.accuracy * 100).toFixed(0)}% fit, Brier ${data.model.metrics.brier}.`;
    updateQuestProgress();
    setStatus(el.modelStatus, state.modelSummary, "success");
  } catch {
    state.modelReady = false;
    state.modelSummary = "Collect labeled call/put outcomes, then train the oracle.";
    setStatus(el.modelStatus, state.modelSummary);
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

async function refreshLeaderboard() {
  try {
    const data = await api<{ ok: true; leaders: Array<{ display_name: string; level: number; xp: number }> }>("/api/leaderboard");
    const index = data.leaders.findIndex((leader) => leader.display_name === session?.user?.display_name);
    state.rank = index >= 0 ? String(index + 1) : "-";
    const peerPositions = [
      [720, 1180],
      [900, 360],
      [1350, 1040],
      [1610, 510],
      [520, 710],
      [1180, 1225],
    ];
    state.onlinePeers = data.leaders
      .filter((leader) => leader.display_name !== session?.user?.display_name)
      .slice(0, 6)
      .map((leader, index) => ({
        displayName: leader.display_name,
        level: leader.level,
        xp: leader.xp,
        x: peerPositions[index][0],
        y: peerPositions[index][1],
        sprite: starterRoster[index % starterRoster.length].sprite,
      }));
    sceneRef?.syncPeers();
  } catch {
    state.rank = "-";
  }
}

function orderPayload() {
  return {
    asset_class: el.orderAsset?.value || "option",
    side: el.orderSide?.value || "buy_to_open",
    symbol: el.orderSymbol?.value || currentSymbol(),
    option_symbol: el.orderOptionSymbol?.value || "",
    quantity: Number(el.orderQuantity?.value || 1),
    type: el.orderType?.value || "limit",
    duration: "day",
    limit_price: Number(el.orderPrice?.value || 0),
  };
}

function openPanel(panel: "oracle" | "market" | "broker") {
  const target =
    panel === "oracle" ? document.querySelector("#oracle-panel") : panel === "market" ? document.querySelector("#market-panel") : el.brokerPanel;
  if (panel === "broker" && el.brokerPanel) el.brokerPanel.open = true;
  target?.scrollIntoView({ block: "nearest", behavior: "smooth" });
}

function interactWithNearest() {
  const station = nearestStation();
  const node = nearestSignalNode();
  if (node && (!station || distanceTo(node.x, node.y) < distanceTo(station.x, station.y))) {
    collectSignal(node);
    return;
  }
  if (!station) return;
  if (station.kind === "oracle") {
    openPanel("oracle");
    void trainModel();
  } else if (station.kind === "market") {
    openPanel("market");
    void forecastSymbol();
  } else if (station.kind === "broker") {
    openPanel("broker");
    state.notice = "Tradier remains server-side. Preview before any gated placement.";
    renderHud();
  } else if (station.kind === "guild") {
    state.notice = "Sky Guild refreshed. Other trainers appear as ghost companions.";
    void refreshLeaderboard().then(renderHud);
  } else {
    sampleFromDrill();
  }
}

function distanceTo(x: number, y: number) {
  return Math.hypot(state.player.x - x, state.player.y - y);
}

function nearestStation() {
  return stations.find((station) => distanceTo(station.x, station.y) <= station.radius) || null;
}

function nearestSignalNode() {
  return signalNodes.find((node) => distanceTo(node.x, node.y) <= 86) || null;
}

function updateInteractionPrompt() {
  const station = nearestStation();
  const node = nearestSignalNode();
  const active = node && (!station || distanceTo(node.x, node.y) < distanceTo(station.x, station.y)) ? node : station;
  const id = active?.id || "";
  if (id === activeInteractableId) return;
  activeInteractableId = id;
  renderHud();
}

function renderHud() {
  updateQuestProgress();
  if (el.trainerChip) el.trainerChip.textContent = session?.user?.display_name || "Trainer";
  if (el.playerName) el.playerName.textContent = session?.user?.display_name || "Cloud Initiate";
  if (el.level) el.level.textContent = String(state.level);
  if (el.xp) el.xp.textContent = String(state.xp);
  if (el.samples) el.samples.textContent = String(state.samples.length);
  if (el.rank) el.rank.textContent = state.rank;
  if (el.worldMode) el.worldMode.textContent = state.modelReady ? "Oracle Online" : "Gathering";
  const levelTarget = Math.max(1, state.level * 120);
  if (el.xpFill) el.xpFill.style.width = `${Math.min(100, (state.xp / levelTarget) * 100)}%`;

  const quest = questCopy();
  if (el.questTitle) el.questTitle.textContent = quest.title;
  if (el.questCopy) el.questCopy.textContent = quest.copy;
  setStatus(el.worldStatus, state.notice);

  const station = nearestStation();
  const node = nearestSignalNode();
  const active = node && (!station || distanceTo(node.x, node.y) < distanceTo(station.x, station.y)) ? node : station;
  if (el.interactionPrompt) {
    if (!active) {
      el.interactionPrompt.classList.add("hidden");
      el.interactionPrompt.textContent = "";
    } else {
      el.interactionPrompt.classList.remove("hidden");
      if ("side" in active) {
        el.interactionPrompt.textContent = `E - collect ${active.name} (${active.side.toUpperCase()} memory)`;
      } else {
        el.interactionPrompt.textContent = active.prompt;
      }
    }
  }

  el.essenceList?.replaceChildren();
  for (const key of essenceKeys) {
    const row = document.createElement("div");
    row.className = "meter-row";
    const label = document.createElement("span");
    label.textContent = key.replace("_", " ");
    const track = document.createElement("div");
    track.className = "meter-track";
    const fill = document.createElement("div");
    fill.className = "meter-fill";
    fill.style.width = `${Math.min(100, state.essence[key])}%`;
    const value = document.createElement("span");
    value.textContent = String(Math.round(state.essence[key]));
    track.appendChild(fill);
    row.append(label, track, value);
    el.essenceList?.appendChild(row);
  }

  el.companionList?.replaceChildren();
  for (const companion of state.roster) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `party-row ${companion.id === state.activeCompanionId ? "active" : ""}`;
    const name = document.createElement("strong");
    const detail = document.createElement("span");
    const bar = document.createElement("i");
    name.textContent = `${companion.name} - ${companion.role}`;
    detail.textContent = `Lv ${companion.level} / ${companion.thesis}`;
    bar.style.width = `${Math.min(100, Math.max(6, (companion.xp / Math.max(1, companion.level * 90)) * 100))}%`;
    row.append(name, detail, bar);
    row.addEventListener("click", () => {
      state.activeCompanionId = companion.id;
      state.notice = `${companion.name} is now following you.`;
      sceneRef?.syncCompanion();
      renderHud();
      queueSave();
    });
    el.companionList?.appendChild(row);
  }

  if (el.forecastCard) {
    el.forecastCard.replaceChildren();
    const title = document.createElement("strong");
    const detail = document.createElement("span");
    if (!state.forecast) {
      title.textContent = "No scan yet";
      detail.textContent = "Train the oracle, then scan a symbol from the Market Scryer.";
    } else {
      title.textContent =
        state.forecast.contract === "wait"
          ? `${state.forecast.symbol}: wait`
          : `${state.forecast.symbol}: single ${state.forecast.contract.toUpperCase()}`;
      detail.textContent = `${state.forecast.class.replace("_", " ")} at ${(state.forecast.probability * 100).toFixed(1)}%.`;
    }
    el.forecastCard.append(title, detail);
  }
  if (el.contractBias) el.contractBias.value = state.contractBias;
}

function wireUi() {
  el.logout?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST", csrfToken, body: JSON.stringify({}) }).catch(() => {});
    window.location.assign("/login");
  });
  el.fullscreen?.addEventListener("click", () => {
    if (!document.fullscreenElement) document.querySelector(".world-stage")?.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });
  el.train?.addEventListener("click", () => void trainModel());
  el.paperDrill?.addEventListener("click", sampleFromDrill);
  el.predict?.addEventListener("click", () => void forecastSymbol());
  el.recordCall?.addEventListener("click", () => recordOutcome("call"));
  el.recordPut?.addEventListener("click", () => recordOutcome("put"));
  el.contractBias?.addEventListener("change", () => {
    state.contractBias = (el.contractBias?.value || "auto") as ContractBias;
    state.notice = `Contract bias set to ${state.contractBias}.`;
    renderHud();
    queueSave();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-panel-jump]").forEach((button) => {
    button.addEventListener("click", () => openPanel(button.dataset.panelJump as "oracle" | "market" | "broker"));
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
      await refreshTradierStatus();
    } catch (error) {
      setStatus(el.tradierStatus, error instanceof Error ? error.message : String(error), "error");
    }
  });
  el.orderForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    latestPreview = null;
    setStatus(el.orderStatus, "Requesting single-leg broker preview...");
    try {
      const payload = orderPayload();
      const data = await api<{ ok: true; intent_id: string }>("/api/tradier/order-preview", {
        method: "POST",
        csrfToken,
        body: JSON.stringify(payload),
      });
      latestPreview = payload;
      updateQuestProgress();
      renderHud();
      queueSave();
      setStatus(el.orderStatus, `Preview accepted. Intent ${data.intent_id}.`, "success");
    } catch (error) {
      setStatus(el.orderStatus, error instanceof Error ? error.message : String(error), "error");
    }
  });
  el.placeOrder?.addEventListener("click", async () => {
    setStatus(el.orderStatus, "Submitting gated order...");
    try {
      const data = await api<{ ok: true; intent_id: string }>("/api/tradier/order-place", {
        method: "POST",
        csrfToken,
        body: JSON.stringify({ ...(latestPreview || orderPayload()), confirm_phrase: el.orderConfirm?.value || "" }),
      });
      setStatus(el.orderStatus, `Order route returned ${data.intent_id}.`, "success");
    } catch (error) {
      setStatus(el.orderStatus, error instanceof Error ? error.message : String(error), "error");
    }
  });
  window.addEventListener("keydown", (event) => {
    if (event.key.toLowerCase() === "f") el.fullscreen?.click();
  });
}

class WorldScene extends Phaser.Scene {
  private keys?: MovementKeys;
  private player?: Phaser.GameObjects.Container;
  private companion?: Phaser.GameObjects.Image;
  private signalViews = new Map<string, Phaser.GameObjects.Container>();
  private peerGroup?: Phaser.GameObjects.Group;
  private lastHudSync = 0;

  constructor() {
    super("world");
  }

  preload() {
    this.load.image("arena", arenaUrl);
    this.load.image("creature-sheet", creaturesUrl);
  }

  create() {
    sceneRef = this;
    this.createCreatureTextures();
    this.createGeneratedTextures();
    this.drawWorld();
    this.createStations();
    this.createSignals();
    this.createPeers();
    this.createPlayer();
    this.configureCamera();
    this.configureInput();
    this.cameras.main.fadeIn(450, 255, 255, 255);
  }

  update(time: number, delta: number) {
    if (!this.player || !this.keys) return;
    let dx = 0;
    let dy = 0;
    if (this.keys.left.isDown || this.keys.leftAlt.isDown) dx -= 1;
    if (this.keys.right.isDown || this.keys.rightAlt.isDown) dx += 1;
    if (this.keys.up.isDown || this.keys.upAlt.isDown) dy -= 1;
    if (this.keys.down.isDown || this.keys.downAlt.isDown) dy += 1;
    const length = Math.hypot(dx, dy) || 1;
    const speed = this.keys.sprint.isDown ? 285 : 205;
    state.player.x = clamp(state.player.x + (dx / length) * speed * (delta / 1000), 85, worldWidth - 85);
    state.player.y = clamp(state.player.y + (dy / length) * speed * (delta / 1000), 90, worldHeight - 90);
    this.player.setPosition(state.player.x, state.player.y);
    this.player.setDepth(state.player.y + 12);
    this.companion?.setPosition(state.player.x - 58, state.player.y + 36).setDepth(state.player.y + 6);
    if (dx !== 0 && this.companion) this.companion.setFlipX(dx < 0);
    if (Phaser.Input.Keyboard.JustDown(this.keys.interact)) interactWithNearest();
    if (Phaser.Input.Keyboard.JustDown(this.keys.fullscreen)) el.fullscreen?.click();
    if (time - this.lastHudSync > 160) {
      updateInteractionPrompt();
      this.lastHudSync = time;
    }
  }

  syncCompanion() {
    this.companion?.setTexture(activeCompanion().sprite);
  }

  syncPeers() {
    this.peerGroup?.clear(true, true);
    this.createPeers();
  }

  pulseNode(id: string) {
    const view = this.signalViews.get(id);
    if (!view) return;
    this.tweens.add({
      targets: view,
      scale: 1.8,
      alpha: 0.2,
      duration: 260,
      yoyo: true,
      ease: "Sine.easeOut",
      onComplete: () => view.setScale(1).setAlpha(1),
    });
  }

  private createCreatureTextures() {
    const source = this.textures.get("creature-sheet").getSourceImage() as HTMLImageElement;
    const frames = {
      "delta-hawk": { x: 0, y: 95, w: 443, h: 620 },
      "theta-tortoise": { x: 443, y: 95, w: 444, h: 620 },
      "vega-wisp": { x: 887, y: 95, w: 443, h: 620 },
      "gamma-hydra": { x: 1330, y: 95, w: 444, h: 620 },
    } as const;
    for (const [key, frame] of Object.entries(frames)) {
      if (this.textures.exists(key)) continue;
      const texture = this.textures.createCanvas(key, frame.w, frame.h);
      const context = texture?.getContext();
      if (!texture || !context) continue;
      context.drawImage(source, frame.x, frame.y, frame.w, frame.h, 0, 0, frame.w, frame.h);
      const image = context.getImageData(0, 0, frame.w, frame.h);
      const bg = image.data.slice(0, 3);
      for (let index = 0; index < image.data.length; index += 4) {
        const diff =
          Math.abs(image.data[index] - bg[0]) +
          Math.abs(image.data[index + 1] - bg[1]) +
          Math.abs(image.data[index + 2] - bg[2]);
        if (diff < 36) image.data[index + 3] = 0;
      }
      context.putImageData(image, 0, 0);
      texture.refresh();
    }
  }

  private createGeneratedTextures() {
    if (!this.textures.exists("hero-avatar")) {
      const avatar = this.make.graphics({ x: 0, y: 0 });
      avatar.fillStyle(0x13383f, 1).fillRoundedRect(20, 22, 28, 42, 12);
      avatar.fillStyle(0xf4d47a, 1).fillCircle(34, 18, 15);
      avatar.fillStyle(0x4f7f71, 1).fillTriangle(10, 64, 34, 30, 58, 64);
      avatar.lineStyle(3, 0xfff7d6, 1).strokeCircle(34, 18, 17);
      avatar.generateTexture("hero-avatar", 68, 76);
      avatar.destroy();
    }
    const signalColors: Record<EssenceKey, number> = {
      momentum: 0xeecf62,
      volatility: 0x7e66d6,
      sentiment: 0xda6b52,
      liquidity: 0x4f9b70,
      iv_rank: 0x1592a0,
    };
    for (const key of essenceKeys) {
      const textureKey = `signal-${key}`;
      if (this.textures.exists(textureKey)) continue;
      const orb = this.make.graphics({ x: 0, y: 0 });
      orb.fillStyle(signalColors[key], 0.24).fillCircle(30, 30, 29);
      orb.fillStyle(signalColors[key], 0.88).fillCircle(30, 30, 16);
      orb.fillStyle(0xfff9df, 0.95).fillCircle(25, 24, 6);
      orb.lineStyle(2, 0xffffff, 0.7).strokeCircle(30, 30, 24);
      orb.generateTexture(textureKey, 60, 60);
      orb.destroy();
    }
  }

  private drawWorld() {
    this.add.image(worldWidth / 2, worldHeight / 2, "arena").setDisplaySize(worldWidth, worldHeight).setAlpha(0.35);
    const g = this.add.graphics();
    g.fillStyle(0xeaf7f3, 0.92).fillEllipse(1080, 780, 1320, 780);
    g.fillStyle(0xd8eee9, 0.86).fillEllipse(475, 420, 570, 390);
    g.fillStyle(0xe5f2e4, 0.92).fillEllipse(1740, 740, 600, 430);
    g.fillStyle(0xf5f0d3, 0.9).fillEllipse(1530, 1165, 560, 350);
    g.fillStyle(0xd9e9d7, 0.88).fillEllipse(610, 1120, 520, 340);
    g.lineStyle(34, 0xf7e3aa, 0.62);
    g.beginPath();
    g.moveTo(470, 420);
    g.lineTo(1130, 350);
    g.lineTo(1740, 710);
    g.lineTo(1525, 1165);
    g.lineTo(610, 1120);
    g.lineTo(470, 420);
    g.strokePath();
    g.lineStyle(8, 0xc99c35, 0.45);
    g.strokeEllipse(1080, 780, 1320, 780);
    g.strokeEllipse(475, 420, 570, 390);
    g.strokeEllipse(1740, 740, 600, 430);
    g.strokeEllipse(1530, 1165, 560, 350);
    g.strokeEllipse(610, 1120, 520, 340);

    for (let index = 0; index < 48; index += 1) {
      const x = 100 + ((index * 149) % (worldWidth - 220));
      const y = 80 + ((index * 97) % (worldHeight - 170));
      g.fillStyle(0xffffff, 0.18 + (index % 4) * 0.04).fillEllipse(x, y, 170 + (index % 5) * 18, 44 + (index % 3) * 16);
    }
  }

  private createStations() {
    const iconColors: Record<StationKind, number> = {
      oracle: 0xc99c35,
      market: 0x1592a0,
      broker: 0x11363d,
      guild: 0x526f3f,
      arena: 0xc9674b,
    };
    for (const station of stations) {
      this.add.circle(station.x, station.y, station.radius, iconColors[station.kind], 0.08).setDepth(station.y - 20);
      this.add.circle(station.x, station.y, 46, iconColors[station.kind], 0.95).setStrokeStyle(4, 0xfff7d6, 0.88).setDepth(station.y);
      this.add.text(station.x, station.y + 66, station.name, {
        fontFamily: "Georgia",
        fontSize: "21px",
        color: "#153238",
        backgroundColor: "rgba(255,255,248,0.72)",
        padding: { x: 10, y: 5 },
      }).setOrigin(0.5).setDepth(station.y + 1);
    }
  }

  private createSignals() {
    for (const node of signalNodes) {
      const container = this.add.container(node.x, node.y).setDepth(node.y + 4);
      const orb = this.add.image(0, 0, `signal-${node.key}`).setScale(0.96);
      const label = this.add.text(0, 40, node.name, {
        fontFamily: "Inter",
        fontSize: "13px",
        fontStyle: "700",
        color: "#143036",
        backgroundColor: "rgba(255,255,248,0.76)",
        padding: { x: 7, y: 3 },
      }).setOrigin(0.5);
      container.add([orb, label]);
      this.signalViews.set(node.id, container);
      this.tweens.add({ targets: orb, y: -8, duration: 1200 + node.x % 380, yoyo: true, repeat: -1, ease: "Sine.easeInOut" });
    }
  }

  private createPeers() {
    this.peerGroup = this.add.group();
    for (const peer of state.onlinePeers) {
      const avatar = this.add.image(peer.x, peer.y, peer.sprite).setDisplaySize(74, 96).setAlpha(0.58).setTint(0x84a7ff);
      const label = this.add.text(peer.x, peer.y + 58, `${peer.displayName} Lv ${peer.level}`, {
        fontFamily: "Inter",
        fontSize: "12px",
        color: "#153238",
        backgroundColor: "rgba(255,255,255,0.7)",
        padding: { x: 7, y: 3 },
      }).setOrigin(0.5);
      avatar.setDepth(peer.y);
      label.setDepth(peer.y + 1);
      this.peerGroup.addMultiple([avatar, label]);
    }
  }

  private createPlayer() {
    this.player = this.add.container(state.player.x, state.player.y).setDepth(state.player.y + 12);
    const shadow = this.add.ellipse(0, 38, 58, 20, 0x153238, 0.22);
    const avatar = this.add.image(0, 0, "hero-avatar").setDisplaySize(64, 74);
    this.player.add([shadow, avatar]);
    this.companion = this.add.image(state.player.x - 58, state.player.y + 36, activeCompanion().sprite).setDisplaySize(86, 104);
  }

  private configureCamera() {
    this.cameras.main.setBounds(0, 0, worldWidth, worldHeight);
    if (this.player) this.cameras.main.startFollow(this.player, true, 0.11, 0.11);
    this.cameras.main.setZoom(0.93);
  }

  private configureInput() {
    const keyboard = this.input.keyboard;
    if (!keyboard) return;
    this.keys = keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
      upAlt: Phaser.Input.Keyboard.KeyCodes.UP,
      downAlt: Phaser.Input.Keyboard.KeyCodes.DOWN,
      leftAlt: Phaser.Input.Keyboard.KeyCodes.LEFT,
      rightAlt: Phaser.Input.Keyboard.KeyCodes.RIGHT,
      interact: Phaser.Input.Keyboard.KeyCodes.E,
      sprint: Phaser.Input.Keyboard.KeyCodes.SPACE,
      fullscreen: Phaser.Input.Keyboard.KeyCodes.F,
    }) as MovementKeys;
    keyboard.addCapture([
      Phaser.Input.Keyboard.KeyCodes.W,
      Phaser.Input.Keyboard.KeyCodes.A,
      Phaser.Input.Keyboard.KeyCodes.S,
      Phaser.Input.Keyboard.KeyCodes.D,
      Phaser.Input.Keyboard.KeyCodes.UP,
      Phaser.Input.Keyboard.KeyCodes.DOWN,
      Phaser.Input.Keyboard.KeyCodes.LEFT,
      Phaser.Input.Keyboard.KeyCodes.RIGHT,
      Phaser.Input.Keyboard.KeyCodes.E,
      Phaser.Input.Keyboard.KeyCodes.SPACE,
    ]);
  }
}

function bootPhaser() {
  phaserGame = new Phaser.Game({
    type: Phaser.AUTO,
    parent: "game-root",
    width: 1280,
    height: 720,
    backgroundColor: "#9fd5e7",
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
    render: {
      pixelArt: false,
      antialias: true,
    },
    scene: [WorldScene],
  });
}

async function boot() {
  session = await getSession();
  if (!session.authenticated || !session.user || !session.csrf_token) {
    window.location.assign(`/login?next=${encodeURIComponent("/game")}`);
    return;
  }
  csrfToken = session.csrf_token;
  if (el.trainerChip) el.trainerChip.textContent = session.user.display_name;
  if (el.playerName) el.playerName.textContent = session.user.display_name;
  await Promise.all([loadGameState(), refreshTradierStatus(), refreshLeaderboard(), refreshModelStatus()]);
  wireUi();
  renderHud();
  bootPhaser();
}

declare global {
  interface Window {
    render_game_to_text?: () => string;
    advanceTime?: (ms: number) => Promise<void>;
  }
}

window.render_game_to_text = () =>
  JSON.stringify({
    mode: "mmo_oracle_hub",
    coordinate_system: "origin top-left, x increases right, y increases down",
    player: state.player,
    nearby: activeInteractableId,
    quest: questCopy(),
    level: state.level,
    xp: state.xp,
    samples: state.samples.length,
    model_ready: state.modelReady,
    forecast: state.forecast,
    essence: state.essence,
    notice: state.notice,
  });

window.advanceTime = async (ms: number) => delay(ms);

void boot();
