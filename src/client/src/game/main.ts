import Phaser from "phaser";
import { api, getSession, type SessionPayload } from "../api";

import arenaUrl from "../../assets/generated/battle-cloud-colosseum.png";
import creaturesUrl from "../../assets/generated/option-creatures-sheet.png";

type EssenceKey = "momentum" | "volatility" | "sentiment" | "liquidity" | "iv_rank";

type Creature = {
  id: string;
  name: string;
  archetype: "call" | "put" | "theta" | "volatility";
  sprite: "delta-hawk" | "theta-tortoise" | "vega-wisp" | "gamma-hydra";
  level: number;
  xp: number;
  hp: number;
  maxHp: number;
  thesis: string;
};

type Opponent = {
  name: string;
  regime: string;
  hp: number;
  maxHp: number;
  features: Record<EssenceKey, number>;
  sprite: "delta-hawk" | "theta-tortoise" | "vega-wisp" | "gamma-hydra";
};

type MoveId = "call-strike" | "put-guard" | "theta-stall" | "vol-surge";

type BattleState = {
  playerLevel: number;
  wins: number;
  samples: Array<Record<string, number>>;
  essence: Record<EssenceKey, number>;
  roster: Creature[];
  activeCreatureId: string;
  opponent: Opponent;
  log: string;
  busy: boolean;
  modelSummary: string;
  rank: string;
};

const essenceKeys: EssenceKey[] = ["momentum", "volatility", "sentiment", "liquidity", "iv_rank"];
let csrfToken = "";
let session: SessionPayload | null = null;
let phaserGame: Phaser.Game | null = null;
let sceneRef: BattleScene | null = null;
let latestPreview: Record<string, unknown> | null = null;
let oracleReady = false;

const el = {
  trainerChip: document.querySelector<HTMLElement>("#trainer-chip"),
  playerName: document.querySelector<HTMLElement>("#player-name"),
  logout: document.querySelector<HTMLButtonElement>("#logout-btn"),
  fullscreen: document.querySelector<HTMLButtonElement>("#fullscreen-btn"),
  battleLog: document.querySelector<HTMLElement>("#battle-log"),
  moveGrid: document.querySelector<HTMLElement>("#move-grid"),
  partyList: document.querySelector<HTMLElement>("#party-list"),
  level: document.querySelector<HTMLElement>("#level-value"),
  wins: document.querySelector<HTMLElement>("#wins-value"),
  samples: document.querySelector<HTMLElement>("#sample-value"),
  rank: document.querySelector<HTMLElement>("#rank-value"),
  essenceList: document.querySelector<HTMLElement>("#essence-list"),
  newBattle: document.querySelector<HTMLButtonElement>("#new-battle-btn"),
  train: document.querySelector<HTMLButtonElement>("#train-btn"),
  predict: document.querySelector<HTMLButtonElement>("#predict-btn"),
  predictSymbol: document.querySelector<HTMLInputElement>("#predict-symbol"),
  modelStatus: document.querySelector<HTMLElement>("#model-status"),
  tradierForm: document.querySelector<HTMLFormElement>("#tradier-form"),
  tradierToken: document.querySelector<HTMLInputElement>("#tradier-token"),
  tradierAccount: document.querySelector<HTMLInputElement>("#tradier-account"),
  tradierMode: document.querySelector<HTMLSelectElement>("#tradier-mode"),
  brokerMode: document.querySelector<HTMLElement>("#broker-mode"),
  tradierStatus: document.querySelector<HTMLElement>("#tradier-status"),
  orderForm: document.querySelector<HTMLFormElement>("#order-form"),
  orderAsset: document.querySelector<HTMLSelectElement>("#order-asset"),
  orderSide: document.querySelector<HTMLSelectElement>("#order-side"),
  orderSymbol: document.querySelector<HTMLInputElement>("#order-symbol"),
  orderQuantity: document.querySelector<HTMLInputElement>("#order-quantity"),
  optionSymbolRow: document.querySelector<HTMLElement>("#option-symbol-row"),
  orderOptionSymbol: document.querySelector<HTMLInputElement>("#order-option-symbol"),
  orderType: document.querySelector<HTMLSelectElement>("#order-type"),
  orderPrice: document.querySelector<HTMLInputElement>("#order-price"),
  orderConfirm: document.querySelector<HTMLInputElement>("#order-confirm"),
  placeOrder: document.querySelector<HTMLButtonElement>("#place-order-btn"),
  orderStatus: document.querySelector<HTMLElement>("#order-status"),
};

const starterRoster: Creature[] = [
  {
    id: "delta-hawk",
    name: "Delta Hawk",
    archetype: "call",
    sprite: "delta-hawk",
    level: 5,
    xp: 0,
    hp: 112,
    maxHp: 112,
    thesis: "Fast call momentum and breakout reads.",
  },
  {
    id: "theta-tortoise",
    name: "Theta Tortoise",
    archetype: "theta",
    sprite: "theta-tortoise",
    level: 5,
    xp: 0,
    hp: 138,
    maxHp: 138,
    thesis: "No-trade patience, time decay, and risk control.",
  },
  {
    id: "vega-wisp",
    name: "Vega Wisp",
    archetype: "volatility",
    sprite: "vega-wisp",
    level: 5,
    xp: 0,
    hp: 104,
    maxHp: 104,
    thesis: "Volatility shocks, IV rank, and event pressure.",
  },
  {
    id: "gamma-hydra",
    name: "Gamma Hydra",
    archetype: "put",
    sprite: "gamma-hydra",
    level: 5,
    xp: 0,
    hp: 126,
    maxHp: 126,
    thesis: "Put hedges, breakdowns, and downside continuation.",
  },
];

const opponents: Opponent[] = [
  {
    name: "Risk-On Rival",
    regime: "Bullish breadth",
    hp: 130,
    maxHp: 130,
    sprite: "theta-tortoise",
    features: { momentum: 0.78, volatility: -0.22, sentiment: 0.46, liquidity: 0.72, iv_rank: -0.35 },
  },
  {
    name: "Volatility Cave",
    regime: "Expansion shock",
    hp: 150,
    maxHp: 150,
    sprite: "vega-wisp",
    features: { momentum: -0.18, volatility: 0.84, sentiment: -0.12, liquidity: 0.14, iv_rank: 0.82 },
  },
  {
    name: "Breakdown Hydra",
    regime: "Risk-off tape",
    hp: 146,
    maxHp: 146,
    sprite: "gamma-hydra",
    features: { momentum: -0.72, volatility: 0.42, sentiment: -0.55, liquidity: 0.48, iv_rank: 0.28 },
  },
  {
    name: "Theta Trial",
    regime: "No-trade chop",
    hp: 122,
    maxHp: 122,
    sprite: "theta-tortoise",
    features: { momentum: 0.08, volatility: -0.08, sentiment: 0.04, liquidity: 0.62, iv_rank: 0.1 },
  },
];

const moves: Array<{ id: MoveId; label: string; detail: string }> = [
  { id: "call-strike", label: "Call Strike", detail: "Bullish attack. Strong when the oracle sees call edge." },
  { id: "put-guard", label: "Put Guard", detail: "Bearish counter. Strong when the oracle sees put hedge." },
  { id: "theta-stall", label: "Theta Stall", detail: "Heal and collect no-trade discipline samples." },
  { id: "vol-surge", label: "Vega Surge", detail: "Volatility attack. Strong in event pressure." },
];

const state: BattleState = {
  playerLevel: 1,
  wins: 0,
  samples: [],
  essence: { momentum: 0, volatility: 0, sentiment: 0, liquidity: 0, iv_rank: 0 },
  roster: starterRoster.map((creature) => ({ ...creature })),
  activeCreatureId: "delta-hawk",
  opponent: makeOpponent(0),
  log: "Choose a move. Your oracle learns from every battle.",
  busy: false,
  modelSummary: "Collect samples through battle moves.",
  rank: "-",
};

function cloneRoster(roster: Creature[]) {
  return roster.map((creature) => ({ ...creature, hp: creature.maxHp }));
}

function makeOpponent(offset = 0): Opponent {
  const base = opponents[offset % opponents.length];
  const bonus = Math.floor(offset / opponents.length) * 18;
  return {
    ...base,
    hp: base.maxHp + bonus,
    maxHp: base.maxHp + bonus,
    features: { ...base.features },
  };
}

function activeCreature() {
  return state.roster.find((creature) => creature.id === state.activeCreatureId) || state.roster[0];
}

function setStatus(target: HTMLElement | null, message: string, tone: "error" | "success" | "" = "") {
  if (!target) return;
  target.textContent = message;
  target.classList.toggle("error", tone === "error");
  target.classList.toggle("success", tone === "success");
}

function sampleForMove(move: MoveId, damage: number, predictionClass: string) {
  const sample: Record<string, number> = { ...state.opponent.features };
  const success = damage >= 32 || predictionClass === moveSynergy(move);
  sample.label = success ? 1 : 0;
  if (move === "theta-stall") sample.label = predictionClass === "no_trade" ? 1 : 0;
  return sample;
}

function moveSynergy(move: MoveId) {
  if (move === "call-strike") return "call_edge";
  if (move === "put-guard") return "put_hedge";
  if (move === "theta-stall") return "no_trade";
  return "call_edge";
}

function essenceGain(move: MoveId) {
  if (move === "call-strike") return "momentum";
  if (move === "put-guard") return "sentiment";
  if (move === "theta-stall") return "liquidity";
  return "volatility";
}

async function predictForMove(move: MoveId) {
  if (!oracleReady) {
    const fallbackClass = move === "put-guard" ? "put_hedge" : move === "theta-stall" ? "no_trade" : "call_edge";
    return { ok: true, prediction: { probability: 0.56, class: fallbackClass } };
  }
  const payload = {
    symbol: el.predictSymbol?.value || "SPY",
    features: {
      ...state.opponent.features,
      ...(move === "call-strike" ? { momentum: Math.max(state.opponent.features.momentum, 0.7) } : {}),
      ...(move === "put-guard" ? { momentum: Math.min(state.opponent.features.momentum, -0.55), sentiment: -0.45 } : {}),
      ...(move === "theta-stall" ? { momentum: 0.04, volatility: -0.1, iv_rank: 0.05 } : {}),
      ...(move === "vol-surge" ? { volatility: 0.86, iv_rank: 0.76 } : {}),
    },
  };
  try {
    return await api<{
      ok: boolean;
      prediction: { probability: number; class: string };
    }>("/api/models/predict", {
      method: "POST",
      csrfToken,
      body: JSON.stringify(payload),
    });
  } catch {
    const fallbackClass = move === "put-guard" ? "put_hedge" : move === "theta-stall" ? "no_trade" : "call_edge";
    return { ok: true, prediction: { probability: 0.56, class: fallbackClass } };
  }
}

async function performMove(move: MoveId) {
  if (state.busy) return;
  state.busy = true;
  renderHud();

  const creature = activeCreature();
  const prediction = await predictForMove(move);
  const probability = prediction.prediction.probability;
  const predictionClass = prediction.prediction.class;
  let damage = 18 + creature.level * 2 + Math.round(probability * 24);
  if (predictionClass === moveSynergy(move)) damage += 22;
  if (move === "vol-surge" && state.opponent.features.volatility > 0.55) damage += 18;
  if (move === "theta-stall") {
    const healed = Math.min(creature.maxHp - creature.hp, 26 + creature.level);
    creature.hp += healed;
    damage = predictionClass === "no_trade" ? 18 : 8;
    state.log = `${creature.name} waited for a cleaner setup and recovered ${healed} HP.`;
  } else {
    state.log = `${creature.name} used ${moves.find((item) => item.id === move)?.label}. Oracle read: ${predictionClass} ${(probability * 100).toFixed(0)}%.`;
  }

  state.opponent.hp = Math.max(0, state.opponent.hp - damage);
  const key = essenceGain(move);
  state.essence[key] = Math.min(999, state.essence[key] + 8);
  state.samples.push(sampleForMove(move, damage, predictionClass));
  state.samples = state.samples.slice(-120);
  creature.xp += 14 + damage;
  if (creature.xp >= creature.level * 90) {
    creature.xp = 0;
    creature.level += 1;
    creature.maxHp += 8;
    creature.hp = creature.maxHp;
    state.log += ` ${creature.name} leveled up.`;
  }

  sceneRef?.flashHit(false);
  if (state.opponent.hp <= 0) {
    state.wins += 1;
    state.playerLevel = 1 + Math.floor(state.wins / 2);
    state.log = `${state.opponent.name} was defeated. A new market rival appears.`;
    state.opponent = makeOpponent(state.wins);
    for (const ally of state.roster) ally.hp = Math.min(ally.maxHp, ally.hp + 18);
    sceneRef?.restartOpponent();
    await saveGameState();
  } else {
    await delay(500);
    const retaliation = 14 + Math.round(Math.abs(state.opponent.features.volatility) * 22) + Math.floor(state.wins * 1.5);
    creature.hp = Math.max(0, creature.hp - retaliation);
    sceneRef?.flashHit(true);
    if (creature.hp <= 0) {
      const next = state.roster.find((candidate) => candidate.hp > 0);
      if (next) {
        state.activeCreatureId = next.id;
        state.log += ` ${creature.name} fainted; ${next.name} enters.`;
      } else {
        state.roster = cloneRoster(starterRoster);
        state.activeCreatureId = "theta-tortoise";
        state.log = "Your team regrouped at the oracle shrine. Try a different read.";
      }
    } else {
      state.log += ` ${state.opponent.name} hit back for ${retaliation}.`;
    }
  }

  state.busy = false;
  renderHud();
  sceneRef?.syncSprites();
}

function delay(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function serializeGameState() {
  return {
    level: state.playerLevel,
    xp: state.wins * 100,
    wins: state.wins,
    activeCreatureId: state.activeCreatureId,
    roster: state.roster.map(({ id, name, archetype, level, xp, maxHp }) => ({ id, name, archetype, level, xp, maxHp })),
    essence: state.essence,
    samples: state.samples.slice(-120),
    last_symbol: el.predictSymbol?.value || "SPY",
  };
}

function hydrate(saved: unknown) {
  if (!saved || typeof saved !== "object") return;
  const data = saved as Partial<ReturnType<typeof serializeGameState>>;
  state.playerLevel = Number(data.level || 1);
  state.wins = Number(data.wins || 0);
  state.essence = { ...state.essence, ...(data.essence || {}) };
  state.samples = Array.isArray(data.samples) ? data.samples.slice(-120) : [];
  if (Array.isArray(data.roster) && data.roster.length) {
    state.roster = starterRoster.map((starter) => {
      const savedCreature = data.roster?.find((creature) => creature.id === starter.id);
      return savedCreature
        ? {
            ...starter,
            level: Number(savedCreature.level || starter.level),
            xp: Number(savedCreature.xp || 0),
            maxHp: Number(savedCreature.maxHp || starter.maxHp),
            hp: Number(savedCreature.maxHp || starter.maxHp),
          }
        : { ...starter };
    });
  }
  state.activeCreatureId = data.activeCreatureId || state.activeCreatureId;
  state.opponent = makeOpponent(state.wins);
  if (data.last_symbol && el.predictSymbol) el.predictSymbol.value = String(data.last_symbol);
}

async function saveGameState() {
  await api("/api/game/state", {
    method: "POST",
    csrfToken,
    body: JSON.stringify({ state: serializeGameState() }),
  });
}

function renderHud() {
  const creature = activeCreature();
  if (el.battleLog) el.battleLog.textContent = state.log;
  if (el.level) el.level.textContent = String(state.playerLevel);
  if (el.wins) el.wins.textContent = String(state.wins);
  if (el.samples) el.samples.textContent = String(state.samples.length);
  if (el.rank) el.rank.textContent = state.rank;

  el.moveGrid?.replaceChildren();
  for (const move of moves) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "move-button";
    button.disabled = state.busy;
    const label = document.createElement("strong");
    label.textContent = move.label;
    const detail = document.createElement("span");
    detail.textContent = move.detail;
    button.append(label, detail);
    button.addEventListener("click", () => void performMove(move.id));
    el.moveGrid?.appendChild(button);
  }

  el.partyList?.replaceChildren();
  for (const ally of state.roster) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = `party-row ${ally.id === creature.id ? "active" : ""}`;
    row.disabled = state.busy || ally.hp <= 0;
    const name = document.createElement("strong");
    const detail = document.createElement("span");
    const bar = document.createElement("i");
    name.textContent = ally.name;
    detail.textContent = `Lv ${ally.level} / ${ally.thesis}`;
    bar.style.width = `${Math.max(4, (ally.hp / ally.maxHp) * 100)}%`;
    row.append(name, detail, bar);
    row.addEventListener("click", () => {
      state.activeCreatureId = ally.id;
      state.log = `${ally.name} steps into the options arena.`;
      renderHud();
      sceneRef?.syncSprites();
    });
    el.partyList?.appendChild(row);
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
}

class BattleScene extends Phaser.Scene {
  private playerSprite?: Phaser.GameObjects.Image;
  private opponentSprite?: Phaser.GameObjects.Image;
  private playerHp?: Phaser.GameObjects.Graphics;
  private opponentHp?: Phaser.GameObjects.Graphics;
  private cameraReady = false;

  constructor() {
    super("battle");
  }

  preload() {
    this.load.image("arena", arenaUrl);
    this.load.image("creature-sheet", creaturesUrl);
  }

  create() {
    sceneRef = this;
    this.add.image(640, 360, "arena").setDisplaySize(1280, 720);
    this.createCreatureTextures();
    this.playerSprite = this.add.image(305, 475, activeCreature().sprite).setDisplaySize(250, 250);
    this.opponentSprite = this.add.image(965, 360, state.opponent.sprite).setDisplaySize(245, 245).setFlipX(true);
    this.playerHp = this.add.graphics();
    this.opponentHp = this.add.graphics();
    this.addBattleLabels();
    this.syncSprites();
    this.cameraReady = true;
    this.cameras.main.fadeIn(500, 255, 255, 255);
  }

  createCreatureTextures() {
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

  addBattleLabels() {
    this.add.rectangle(216, 154, 328, 68, 0xf8fbf8, 0.9).setStrokeStyle(2, 0x153238, 0.18);
    this.add.rectangle(1046, 134, 332, 68, 0xf8fbf8, 0.9).setStrokeStyle(2, 0x153238, 0.18);
    this.add.text(78, 130, activeCreature().name, { fontFamily: "Georgia", fontSize: "23px", color: "#153238" });
    this.add.text(904, 110, state.opponent.name, { fontFamily: "Georgia", fontSize: "23px", color: "#153238" });
  }

  syncSprites() {
    const ally = activeCreature();
    this.playerSprite?.setTexture(ally.sprite);
    this.opponentSprite?.setTexture(state.opponent.sprite);
    this.redrawHealth();
    if (!this.cameraReady) return;
    this.tweens.add({
      targets: this.playerSprite,
      y: 465,
      duration: 260,
      yoyo: true,
      ease: "Sine.easeInOut",
    });
  }

  redrawHealth() {
    const ally = activeCreature();
    this.playerHp?.clear();
    this.playerHp?.fillStyle(0x153238, 0.82).fillRoundedRect(80, 174, 272, 14, 6);
    this.playerHp?.fillStyle(0x55a36b, 1).fillRoundedRect(84, 178, Math.max(4, (ally.hp / ally.maxHp) * 264), 6, 4);
    this.opponentHp?.clear();
    this.opponentHp?.fillStyle(0x153238, 0.82).fillRoundedRect(910, 154, 272, 14, 6);
    this.opponentHp?.fillStyle(0xc9674b, 1).fillRoundedRect(914, 158, Math.max(4, (state.opponent.hp / state.opponent.maxHp) * 264), 6, 4);
  }

  flashHit(playerHit: boolean) {
    const target = playerHit ? this.playerSprite : this.opponentSprite;
    if (!target) return;
    this.tweens.add({
      targets: target,
      alpha: 0.35,
      duration: 80,
      yoyo: true,
      repeat: 2,
      onComplete: () => target.setAlpha(1),
    });
    this.cameras.main.shake(120, 0.004);
    this.redrawHealth();
  }

  restartOpponent() {
    this.opponentSprite?.setTexture(state.opponent.sprite);
    this.opponentSprite?.setPosition(1100, 360).setAlpha(0);
    this.tweens.add({
      targets: this.opponentSprite,
      x: 965,
      alpha: 1,
      duration: 320,
      ease: "Back.easeOut",
    });
    this.redrawHealth();
  }
}

async function loadGameState() {
  const data = await api<{ ok: true; state: unknown }>("/api/game/state");
  hydrate(data.state);
}

async function trainModel() {
  setStatus(el.modelStatus, "Training oracle from battle samples...");
  try {
    const data = await api<{
      ok: true;
      model: { metrics: { accuracy: number; brier: number; training_rows: number } };
    }>("/api/models/train", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({ name: "League Oracle", samples: state.samples }),
    });
    state.modelSummary = `League Oracle: accuracy ${(data.model.metrics.accuracy * 100).toFixed(0)}%, Brier ${data.model.metrics.brier}.`;
    oracleReady = true;
    setStatus(el.modelStatus, state.modelSummary, "success");
  } catch (error) {
    setStatus(el.modelStatus, error instanceof Error ? error.message : String(error), "error");
  }
}

async function forecastSymbol() {
  if (!oracleReady) {
    setStatus(el.modelStatus, "Train the oracle before requesting forecasts.", "error");
    return;
  }
  setStatus(el.modelStatus, "Forecasting symbol...");
  try {
    const data = await api<{
      ok: true;
      symbol: string;
      prediction: { probability: number; class: string };
    }>("/api/models/predict", {
      method: "POST",
      csrfToken,
      body: JSON.stringify({
        symbol: el.predictSymbol?.value || "SPY",
        features: state.opponent.features,
      }),
    });
    setStatus(
      el.modelStatus,
      `${data.symbol}: ${data.prediction.class} at ${(data.prediction.probability * 100).toFixed(1)}%.`,
      "success",
    );
  } catch (error) {
    setStatus(el.modelStatus, error instanceof Error ? error.message : String(error), "error");
  }
}

async function refreshModelStatus() {
  try {
    const data = await api<{
      ok: true;
      model: null | { name: string; metrics: { accuracy: number; brier: number } };
    }>("/api/models/latest");
    if (!data.model) {
      oracleReady = false;
      setStatus(el.modelStatus, "Collect samples, then train the oracle.");
      return;
    }
    oracleReady = true;
    state.modelSummary = `${data.model.name}: accuracy ${(data.model.metrics.accuracy * 100).toFixed(0)}%, Brier ${data.model.metrics.brier}.`;
    setStatus(el.modelStatus, state.modelSummary, "success");
  } catch {
    oracleReady = false;
    setStatus(el.modelStatus, "Collect samples, then train the oracle.");
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
    const data = await api<{ ok: true; leaders: Array<{ display_name: string; xp: number }> }>("/api/leaderboard");
    const index = data.leaders.findIndex((leader) => leader.display_name === session?.user?.display_name);
    state.rank = index >= 0 ? String(index + 1) : "-";
  } catch {
    state.rank = "-";
  }
}

function setOrderSides() {
  if (!el.orderSide || !el.orderAsset || !el.optionSymbolRow) return;
  const options =
    el.orderAsset.value === "option"
      ? [
          ["buy_to_open", "Buy to open"],
          ["sell_to_close", "Sell to close"],
          ["buy_to_close", "Buy to close"],
          ["sell_to_open", "Sell to open"],
        ]
      : [
          ["buy", "Buy"],
          ["sell", "Sell"],
          ["buy_to_cover", "Buy to cover"],
          ["sell_short", "Sell short"],
        ];
  el.orderSide.replaceChildren();
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    el.orderSide.appendChild(option);
  }
  el.optionSymbolRow.classList.toggle("hidden", el.orderAsset.value !== "option");
}

function orderPayload() {
  return {
    asset_class: el.orderAsset?.value,
    side: el.orderSide?.value,
    symbol: el.orderSymbol?.value,
    option_symbol: el.orderOptionSymbol?.value,
    quantity: Number(el.orderQuantity?.value || 1),
    type: el.orderType?.value,
    duration: "day",
    limit_price: Number(el.orderPrice?.value || 0),
  };
}

function wireUi() {
  el.logout?.addEventListener("click", async () => {
    await api("/api/auth/logout", { method: "POST", csrfToken, body: JSON.stringify({}) }).catch(() => {});
    window.location.assign("/login");
  });
  el.fullscreen?.addEventListener("click", () => {
    if (!document.fullscreenElement) document.querySelector(".battle-stage")?.requestFullscreen().catch(() => {});
    else document.exitFullscreen().catch(() => {});
  });
  el.newBattle?.addEventListener("click", () => {
    state.opponent = makeOpponent(state.wins + 1);
    state.log = `${state.opponent.name} entered with ${state.opponent.regime}.`;
    sceneRef?.restartOpponent();
    renderHud();
  });
  el.train?.addEventListener("click", () => void trainModel());
  el.predict?.addEventListener("click", () => void forecastSymbol());
  el.orderAsset?.addEventListener("change", setOrderSides);
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
    setStatus(el.orderStatus, "Requesting broker preview...");
    try {
      const payload = orderPayload();
      const data = await api<{ ok: true; intent_id: string }>("/api/tradier/order-preview", {
        method: "POST",
        csrfToken,
        body: JSON.stringify(payload),
      });
      latestPreview = payload;
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
    scene: [BattleScene],
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
  setOrderSides();
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
    mode: "turn_based_battle",
    active_creature: activeCreature(),
    opponent: state.opponent,
    wins: state.wins,
    samples: state.samples.length,
    essence: state.essence,
    log: state.log,
  });

window.advanceTime = async (ms: number) => delay(ms);

boot();
