const canvas = document.querySelector("#game");
const ctx = canvas.getContext("2d");
const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

const elements = {
  sessionLabel: document.querySelector("#session-label"),
  fullscreen: document.querySelector("#fullscreen-btn"),
  start: document.querySelector("#start-btn"),
  pause: document.querySelector("#pause-btn"),
  save: document.querySelector("#save-btn"),
  oracleStatus: document.querySelector("#oracle-status"),
  authPanel: document.querySelector("#auth-panel"),
  accountPanel: document.querySelector("#account-panel"),
  oraclePanel: document.querySelector("#oracle-panel"),
  tradierPanel: document.querySelector("#tradier-panel"),
  orderPanel: document.querySelector("#order-panel"),
  leaderboardPanel: document.querySelector("#leaderboard-panel"),
  authForm: document.querySelector("#auth-form"),
  authEmail: document.querySelector("#auth-email"),
  authPassword: document.querySelector("#auth-password"),
  displayName: document.querySelector("#display-name"),
  displayNameRow: document.querySelector("#display-name-row"),
  loginTab: document.querySelector("#login-tab"),
  registerTab: document.querySelector("#register-tab"),
  authSubmit: document.querySelector("#auth-submit"),
  authStatus: document.querySelector("#auth-status"),
  playerName: document.querySelector("#player-name"),
  logout: document.querySelector("#logout-btn"),
  level: document.querySelector("#level-value"),
  xp: document.querySelector("#xp-value"),
  samples: document.querySelector("#sample-value"),
  rank: document.querySelector("#rank-value"),
  essenceList: document.querySelector("#essence-list"),
  train: document.querySelector("#train-btn"),
  predictSymbol: document.querySelector("#predict-symbol"),
  predict: document.querySelector("#predict-btn"),
  modelStatus: document.querySelector("#model-status"),
  tradierForm: document.querySelector("#tradier-form"),
  tradierToken: document.querySelector("#tradier-token"),
  tradierAccount: document.querySelector("#tradier-account"),
  tradierMode: document.querySelector("#tradier-mode"),
  tradierStatus: document.querySelector("#tradier-status"),
  brokerMode: document.querySelector("#broker-mode"),
  orderForm: document.querySelector("#order-form"),
  orderAsset: document.querySelector("#order-asset"),
  orderSide: document.querySelector("#order-side"),
  orderSymbol: document.querySelector("#order-symbol"),
  orderQuantity: document.querySelector("#order-quantity"),
  optionSymbolRow: document.querySelector("#option-symbol-row"),
  orderOptionSymbol: document.querySelector("#order-option-symbol"),
  orderType: document.querySelector("#order-type"),
  orderPrice: document.querySelector("#order-price"),
  orderConfirm: document.querySelector("#order-confirm"),
  placeOrder: document.querySelector("#place-order-btn"),
  orderStatus: document.querySelector("#order-status"),
  leaderboard: document.querySelector("#leaderboard"),
};

const essenceTypes = ["momentum", "volatility", "sentiment", "liquidity", "iv_rank"];
const keys = new Set();
let csrfToken = "";
let authMode = "login";
let latestPreview = null;
let model = null;
let lastTime = performance.now();
let deterministic = false;

const game = {
  mode: "title",
  user: null,
  level: 1,
  xp: 0,
  rank: "-",
  essence: {
    momentum: 0,
    volatility: 0,
    sentiment: 0,
    liquidity: 0,
    iv_rank: 0,
  },
  samples: [],
  player: { x: 640, y: 390, vx: 0, vy: 0, r: 16, dash: 0 },
  cameraT: 0,
  entities: [],
  particles: [],
  message: "Collect market essence, train your oracle, preview trades.",
  autosaveTimer: 0,
};

function status(element, message, tone = "") {
  element.textContent = message;
  element.classList.toggle("error", tone === "error");
  element.classList.toggle("success", tone === "success");
}

async function api(path, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has("content-type")) {
    headers.set("content-type", "application/json");
  }
  if (!["GET", "HEAD"].includes(String(options.method || "GET").toUpperCase()) && csrfToken) {
    headers.set("x-csrf-token", csrfToken);
  }
  const response = await fetch(path, {
    ...options,
    headers,
    credentials: "same-origin",
  });
  const data = await response.json().catch(() => ({ ok: false, error: "Invalid server response." }));
  if (!response.ok) {
    throw new Error(data.error || `Request failed with status ${response.status}.`);
  }
  return data;
}

function resizeCanvas() {
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function setAuthMode(mode) {
  authMode = mode;
  elements.loginTab.classList.toggle("active", mode === "login");
  elements.registerTab.classList.toggle("active", mode === "register");
  elements.displayNameRow.classList.toggle("hidden", mode === "login");
  elements.authSubmit.textContent = mode === "login" ? "Login" : "Create account";
  elements.authPassword.autocomplete = mode === "login" ? "current-password" : "new-password";
}

function showApp(isAuthenticated) {
  elements.authPanel.classList.toggle("hidden", isAuthenticated);
  for (const panel of [
    elements.accountPanel,
    elements.oraclePanel,
    elements.tradierPanel,
    elements.orderPanel,
    elements.leaderboardPanel,
  ]) {
    panel.classList.toggle("hidden", !isAuthenticated);
  }
  elements.sessionLabel.textContent = isAuthenticated ? game.user.display_name : "Signed out";
}

function sampleFromEntity(entity) {
  const sample = {};
  for (const type of essenceTypes) {
    sample[type] = Number((Math.sin(entity.seed * (type.length + 3)) * 0.8).toFixed(3));
  }
  sample[entity.type] = Number((0.55 + Math.abs(Math.sin(entity.seed)) * 0.45).toFixed(3));
  const edgeScore =
    sample.momentum * 0.38 +
    sample.sentiment * 0.25 +
    sample.liquidity * 0.21 -
    sample.volatility * 0.18 -
    sample.iv_rank * 0.2;
  sample.label = edgeScore + Math.sin(entity.seed * 0.7) * 0.2 > 0 ? 1 : 0;
  return sample;
}

function spawnEntities() {
  game.entities = [];
  for (let index = 0; index < 26; index += 1) {
    const seed = index * 37.7 + 3.14;
    game.entities.push({
      kind: "essence",
      type: essenceTypes[index % essenceTypes.length],
      x: index === 0 ? 660 : 140 + ((index * 197) % 980),
      y: index === 0 ? 392 : 130 + ((index * 131) % 440),
      r: 12 + (index % 3) * 2,
      phase: seed,
      seed,
    });
  }
  for (let index = 0; index < 8; index += 1) {
    game.entities.push({
      kind: "storm",
      x: 180 + ((index * 313) % 900),
      y: 150 + ((index * 173) % 420),
      r: 18,
      phase: index * 2.3,
      seed: index + 80,
    });
  }
}

function hydrateGameState(saved) {
  if (!saved) {
    return;
  }
  game.level = saved.level || 1;
  game.xp = saved.xp || 0;
  game.essence = { ...game.essence, ...(saved.essence || {}) };
  game.samples = Array.isArray(saved.samples) ? saved.samples.slice(-80) : [];
  elements.predictSymbol.value = saved.last_symbol || "SPY";
}

function serializableState() {
  return {
    level: game.level,
    xp: game.xp,
    essence: game.essence,
    samples: game.samples.slice(-80),
    last_symbol: elements.predictSymbol.value || "SPY",
  };
}

async function loadSession() {
  const data = await api("/api/auth/session");
  if (!data.authenticated) {
    showApp(false);
    return;
  }
  csrfToken = data.csrf_token;
  game.user = data.user;
  elements.playerName.textContent = data.user.display_name;
  showApp(true);
  const [stateData, modelData] = await Promise.all([
    api("/api/game/state").catch(() => ({ state: null })),
    api("/api/models/latest").catch(() => ({ model: null })),
  ]);
  hydrateGameState(stateData.state);
  model = modelData.model;
  if (model) {
    status(
      elements.modelStatus,
      `${model.name}: accuracy ${(model.metrics.accuracy * 100).toFixed(0)}%, Brier ${model.metrics.brier}.`,
      "success",
    );
  }
  await refreshTradierStatus();
  await refreshLeaderboard();
  game.mode = "ready";
  updateUi();
}

async function refreshTradierStatus() {
  try {
    const data = await api("/api/tradier/status");
    if (!data.broker.configured) {
      elements.brokerMode.textContent = "Disconnected";
      status(elements.tradierStatus, "No Tradier token stored for this account.");
      return;
    }
    elements.brokerMode.textContent = `${data.broker.mode} ${data.broker.account_id_masked}`;
    status(
      elements.tradierStatus,
      data.profile?.name ? `Connected for ${data.profile.name}.` : "Connected. Profile check skipped or unavailable.",
      "success",
    );
  } catch (error) {
    elements.brokerMode.textContent = "Unavailable";
    status(elements.tradierStatus, error.message, "error");
  }
}

async function refreshLeaderboard() {
  try {
    const data = await api("/api/leaderboard");
    elements.leaderboard.replaceChildren();
    data.leaders.forEach((leader) => {
      const item = document.createElement("li");
      item.textContent = `${leader.display_name}: ${leader.xp} XP`;
      elements.leaderboard.appendChild(item);
    });
    const index = data.leaders.findIndex((leader) => leader.display_name === game.user?.display_name);
    game.rank = index >= 0 ? String(index + 1) : "-";
  } catch {
    game.rank = "-";
  }
}

function updateEssenceUi() {
  elements.essenceList.replaceChildren();
  for (const type of essenceTypes) {
    const value = Math.round(game.essence[type] || 0);
    const row = document.createElement("div");
    row.className = "meter-row";
    const label = document.createElement("span");
    label.textContent = type.replace("_", " ");
    const track = document.createElement("div");
    track.className = "meter-track";
    const fill = document.createElement("div");
    fill.className = "meter-fill";
    fill.style.width = `${Math.min(100, value)}%`;
    const number = document.createElement("span");
    number.textContent = String(value);
    track.appendChild(fill);
    row.append(label, track, number);
    elements.essenceList.appendChild(row);
  }
}

function updateUi() {
  elements.level.textContent = String(game.level);
  elements.xp.textContent = String(game.xp);
  elements.samples.textContent = String(game.samples.length);
  elements.rank.textContent = game.rank;
  elements.oracleStatus.textContent = game.message;
  updateEssenceUi();
}

function setOrderSides() {
  const asset = elements.orderAsset.value;
  const options =
    asset === "option"
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
  elements.orderSide.replaceChildren();
  for (const [value, label] of options) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    elements.orderSide.appendChild(option);
  }
  elements.optionSymbolRow.classList.toggle("hidden", asset !== "option");
}

async function saveGameState() {
  if (!game.user) {
    return;
  }
  await api("/api/game/state", {
    method: "POST",
    body: JSON.stringify({ state: serializableState() }),
  });
  game.message = "Progress saved.";
  updateUi();
}

function startRun() {
  if (!game.user) {
    game.message = "Login or create an account to save oracle progress.";
    updateUi();
    return;
  }
  game.mode = "playing";
  game.message = "Run active. Gather essence and avoid storms.";
  spawnEntities();
  updateUi();
}

function collect(entity) {
  game.essence[entity.type] = Math.min(999, (game.essence[entity.type] || 0) + 8);
  game.xp += 12;
  game.level = 1 + Math.floor(game.xp / 240);
  game.samples.push(sampleFromEntity(entity));
  game.samples = game.samples.slice(-80);
  game.message = `${entity.type.replace("_", " ")} essence captured.`;
  game.particles.push({ x: entity.x, y: entity.y, life: 0.8, color: "#c99c35" });
  entity.x = -9999;
  entity.y = -9999;
  entity.dead = true;
  updateUi();
}

function hitStorm(entity) {
  game.xp = Math.max(0, game.xp - 6);
  game.player.vx -= Math.sign(entity.x - game.player.x) * 90;
  game.player.vy -= Math.sign(entity.y - game.player.y) * 90;
  game.message = "Storm shear cut into your run.";
  game.particles.push({ x: entity.x, y: entity.y, life: 0.7, color: "#5f568f" });
  updateUi();
}

function update(dt) {
  game.cameraT += dt;
  if (game.mode !== "playing") {
    return;
  }

  const inputX = (keys.has("ArrowRight") || keys.has("d") ? 1 : 0) - (keys.has("ArrowLeft") || keys.has("a") ? 1 : 0);
  const inputY = (keys.has("ArrowDown") || keys.has("s") ? 1 : 0) - (keys.has("ArrowUp") || keys.has("w") ? 1 : 0);
  const length = Math.hypot(inputX, inputY) || 1;
  const speed = keys.has(" ") && game.player.dash <= 0 ? 420 : 240;
  if (keys.has(" ") && game.player.dash <= 0) {
    game.player.dash = 0.8;
    game.particles.push({ x: game.player.x, y: game.player.y, life: 0.5, color: "#ffffff" });
  }
  game.player.vx += (inputX / length) * speed * dt * 6;
  game.player.vy += (inputY / length) * speed * dt * 6;
  game.player.vx *= 0.86;
  game.player.vy *= 0.86;
  game.player.x = Math.max(54, Math.min(1226, game.player.x + game.player.vx * dt));
  game.player.y = Math.max(88, Math.min(650, game.player.y + game.player.vy * dt));
  game.player.dash = Math.max(0, game.player.dash - dt);

  for (const entity of game.entities) {
    entity.phase += dt;
    if (entity.kind === "storm") {
      entity.x += Math.cos(entity.phase * 0.8) * dt * 38;
      entity.y += Math.sin(entity.phase * 0.9) * dt * 28;
    }
    const distance = Math.hypot(entity.x - game.player.x, entity.y - game.player.y);
    if (entity.kind === "essence" && distance < entity.r + game.player.r + 4) {
      collect(entity);
    }
    if (entity.kind === "storm" && distance < entity.r + game.player.r) {
      hitStorm(entity);
    }
  }

  game.entities = game.entities.filter((entity) => !entity.dead);
  if (game.entities.filter((entity) => entity.kind === "essence").length < 10) {
    spawnEntities();
  }

  for (const particle of game.particles) {
    particle.life -= dt;
    particle.y -= dt * 30;
  }
  game.particles = game.particles.filter((particle) => particle.life > 0);

  game.autosaveTimer += dt;
  if (game.autosaveTimer > 30) {
    game.autosaveTimer = 0;
    saveGameState().catch(() => {});
  }
}

function drawCloud(x, y, scale, tone = "#f6fbfb") {
  ctx.fillStyle = tone;
  ctx.beginPath();
  ctx.arc(x, y, 28 * scale, Math.PI, 0);
  ctx.arc(x + 30 * scale, y - 16 * scale, 34 * scale, Math.PI, 0);
  ctx.arc(x + 70 * scale, y, 26 * scale, Math.PI, 0);
  ctx.lineTo(x + 96 * scale, y + 24 * scale);
  ctx.lineTo(x - 28 * scale, y + 24 * scale);
  ctx.closePath();
  ctx.fill();
}

function drawBackground(width, height) {
  const gradient = ctx.createLinearGradient(0, 0, 0, height);
  gradient.addColorStop(0, "#7fc4dd");
  gradient.addColorStop(0.5, "#d5eef3");
  gradient.addColorStop(1, "#f6f3dc");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  ctx.save();
  ctx.globalAlpha = 0.85;
  for (let index = 0; index < 10; index += 1) {
    const x = ((index * 181 + game.cameraT * 18) % (width + 180)) - 120;
    const y = 80 + ((index * 53) % 300);
    drawCloud(x, y, 0.7 + (index % 3) * 0.18);
  }
  ctx.restore();

  ctx.fillStyle = "rgba(82, 111, 63, 0.26)";
  ctx.beginPath();
  ctx.ellipse(width * 0.52, height * 0.7, width * 0.28, height * 0.06, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#f4e6bf";
  ctx.strokeStyle = "rgba(20, 34, 40, 0.18)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(width * 0.42, height * 0.62);
  ctx.lineTo(width * 0.58, height * 0.62);
  ctx.lineTo(width * 0.62, height * 0.72);
  ctx.lineTo(width * 0.38, height * 0.72);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#c99c35";
  for (let index = 0; index < 5; index += 1) {
    const x = width * 0.45 + index * 28;
    ctx.fillRect(x, height * 0.56, 10, height * 0.16);
  }
  ctx.beginPath();
  ctx.moveTo(width * 0.43, height * 0.55);
  ctx.lineTo(width * 0.5, height * 0.48);
  ctx.lineTo(width * 0.57, height * 0.55);
  ctx.closePath();
  ctx.fill();
}

function drawEntity(entity) {
  const bob = Math.sin(entity.phase * 3) * 5;
  if (entity.kind === "storm") {
    ctx.save();
    ctx.translate(entity.x, entity.y + bob);
    ctx.rotate(entity.phase);
    ctx.strokeStyle = "#5f568f";
    ctx.lineWidth = 4;
    ctx.beginPath();
    for (let index = 0; index < 6; index += 1) {
      const angle = (Math.PI * 2 * index) / 6;
      ctx.lineTo(Math.cos(angle) * entity.r, Math.sin(angle) * entity.r);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.fillStyle = "rgba(95, 86, 143, 0.18)";
    ctx.fill();
    ctx.restore();
    return;
  }

  const colors = {
    momentum: "#c99c35",
    volatility: "#5f568f",
    sentiment: "#c9674b",
    liquidity: "#526f3f",
    iv_rank: "#14819a",
  };
  ctx.save();
  ctx.translate(entity.x, entity.y + bob);
  ctx.fillStyle = colors[entity.type] || "#c99c35";
  ctx.strokeStyle = "rgba(255, 255, 255, 0.86)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (let index = 0; index < 5; index += 1) {
    const angle = -Math.PI / 2 + (Math.PI * 2 * index) / 5;
    const radius = index % 2 === 0 ? entity.r + 4 : entity.r * 0.55;
    ctx.lineTo(Math.cos(angle) * radius, Math.sin(angle) * radius);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

function drawPlayer() {
  ctx.save();
  ctx.translate(game.player.x, game.player.y);
  const angle = Math.atan2(game.player.vy, game.player.vx || 1);
  ctx.rotate(angle * 0.18);
  ctx.fillStyle = "#fffdf5";
  ctx.strokeStyle = "#12343b";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(-16, -14);
  ctx.lineTo(-7, 0);
  ctx.lineTo(-16, 14);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#c99c35";
  ctx.beginPath();
  ctx.arc(-2, 0, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawOverlay(width) {
  ctx.fillStyle = "rgba(18, 52, 59, 0.72)";
  ctx.fillRect(24, 116, 300, 84);
  ctx.fillStyle = "#fffdf5";
  ctx.font = "700 18px Inter, sans-serif";
  ctx.fillText(game.mode === "title" ? "Awaiting sky gate" : `Level ${game.level} Oracle Run`, 42, 146);
  ctx.font = "500 14px Inter, sans-serif";
  ctx.fillText(game.message.slice(0, 46), 42, 174);
  ctx.fillStyle = "#c99c35";
  ctx.fillRect(42, 184, Math.min(240, game.xp % 240), 6);

  if (game.mode !== "playing") {
    ctx.fillStyle = "rgba(255, 253, 245, 0.84)";
    ctx.fillRect(width / 2 - 190, 245, 380, 112);
    ctx.strokeStyle = "rgba(20, 34, 40, 0.16)";
    ctx.strokeRect(width / 2 - 190, 245, 380, 112);
    ctx.fillStyle = "#12343b";
    ctx.font = "700 22px Georgia, serif";
    ctx.fillText("Train beneath the cloud temples", width / 2 - 150, 286);
    ctx.font = "500 14px Inter, sans-serif";
    ctx.fillText("WASD moves. Space dashes. F toggles fullscreen.", width / 2 - 150, 318);
  }
}

function render() {
  const rect = canvas.getBoundingClientRect();
  const width = rect.width;
  const height = rect.height;
  drawBackground(width, height);
  for (const entity of game.entities) {
    if (entity.dead) {
      continue;
    }
    drawEntity(entity);
  }
  drawPlayer();
  for (const particle of game.particles) {
    ctx.globalAlpha = Math.max(0, particle.life);
    ctx.fillStyle = particle.color;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 18 * particle.life, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
  drawOverlay(width, height);
}

function loop(time) {
  const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (!deterministic) {
    update(dt);
    render();
  }
  requestAnimationFrame(loop);
}

function renderGameToText() {
  return JSON.stringify({
    coordinate_system: "origin top-left, x right, y down",
    mode: game.mode,
    player: {
      x: Math.round(game.player.x),
      y: Math.round(game.player.y),
      vx: Math.round(game.player.vx),
      vy: Math.round(game.player.vy),
    },
    level: game.level,
    xp: game.xp,
    samples: game.samples.length,
    essence: game.essence,
    visible_entities: game.entities
      .filter((entity) => !entity.dead)
      .slice(0, 16)
      .map((entity) => ({
        kind: entity.kind,
        type: entity.type || null,
        x: Math.round(entity.x),
        y: Math.round(entity.y),
        r: entity.r,
      })),
    message: game.message,
  });
}

window.render_game_to_text = renderGameToText;
window.advanceTime = (ms) => {
  deterministic = true;
  const steps = Math.max(1, Math.round(Number(ms || 16) / (1000 / 60)));
  for (let index = 0; index < steps; index += 1) {
    update(1 / 60);
  }
  render();
  deterministic = false;
};

elements.loginTab.addEventListener("click", () => setAuthMode("login"));
elements.registerTab.addEventListener("click", () => setAuthMode("register"));
elements.authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  status(elements.authStatus, "Working...");
  const endpoint = authMode === "login" ? "/api/auth/login" : "/api/auth/register";
  try {
    const data = await api(endpoint, {
      method: "POST",
      body: JSON.stringify({
        email: elements.authEmail.value,
        password: elements.authPassword.value,
        display_name: elements.displayName.value,
      }),
    });
    csrfToken = data.csrf_token;
    game.user = data.user;
    elements.playerName.textContent = data.user.display_name;
    showApp(true);
    status(elements.authStatus, "Signed in.", "success");
    await loadSession();
  } catch (error) {
    status(elements.authStatus, error.message, "error");
  }
});

elements.logout.addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST", body: JSON.stringify({}) }).catch(() => {});
  csrfToken = "";
  game.user = null;
  game.mode = "title";
  showApp(false);
});

elements.start.addEventListener("click", startRun);
elements.pause.addEventListener("click", () => {
  game.mode = game.mode === "playing" ? "paused" : "playing";
  game.message = game.mode === "paused" ? "Run paused." : "Run resumed.";
  updateUi();
});
elements.save.addEventListener("click", () => saveGameState().catch((error) => {
  game.message = error.message;
  updateUi();
}));
elements.fullscreen.addEventListener("click", () => {
  if (!document.fullscreenElement) {
    document.querySelector(".game-stage").requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

elements.train.addEventListener("click", async () => {
  status(elements.modelStatus, "Training oracle...");
  try {
    const data = await api("/api/models/train", {
      method: "POST",
      body: JSON.stringify({ name: "Cloud Oracle", samples: game.samples }),
    });
    model = data.model;
    status(
      elements.modelStatus,
      `Trained with ${model.metrics.training_rows} rows. Accuracy ${(model.metrics.accuracy * 100).toFixed(0)}%.`,
      "success",
    );
  } catch (error) {
    status(elements.modelStatus, error.message, "error");
  }
});

elements.predict.addEventListener("click", async () => {
  const total = Math.max(1, essenceTypes.reduce((sum, type) => sum + game.essence[type], 0));
  const features = Object.fromEntries(
    essenceTypes.map((type) => [type, Math.max(-1, Math.min(1, (game.essence[type] / total) * 2 - 0.55))]),
  );
  try {
    const data = await api("/api/models/predict", {
      method: "POST",
      body: JSON.stringify({ symbol: elements.predictSymbol.value, features }),
    });
    const pct = (data.prediction.probability * 100).toFixed(1);
    status(elements.modelStatus, `${data.symbol}: ${data.prediction.class} at ${pct}% probability.`, "success");
  } catch (error) {
    status(elements.modelStatus, error.message, "error");
  }
});

elements.tradierForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  status(elements.tradierStatus, "Saving encrypted broker link...");
  try {
    await api("/api/tradier/connect", {
      method: "POST",
      body: JSON.stringify({
        access_token: elements.tradierToken.value,
        account_id: elements.tradierAccount.value,
        mode: elements.tradierMode.value,
      }),
    });
    elements.tradierToken.value = "";
    await refreshTradierStatus();
  } catch (error) {
    status(elements.tradierStatus, error.message, "error");
  }
});

elements.orderAsset.addEventListener("change", setOrderSides);
elements.orderForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  latestPreview = null;
  status(elements.orderStatus, "Requesting broker preview...");
  const order = orderPayload();
  try {
    const data = await api("/api/tradier/order-preview", {
      method: "POST",
      body: JSON.stringify(order),
    });
    latestPreview = order;
    status(elements.orderStatus, `Preview accepted. Intent ${data.intent_id}.`, "success");
  } catch (error) {
    status(elements.orderStatus, error.message, "error");
  }
});

elements.placeOrder.addEventListener("click", async () => {
  const order = latestPreview || orderPayload();
  order.confirm_phrase = elements.orderConfirm.value;
  status(elements.orderStatus, "Submitting gated order...");
  try {
    const data = await api("/api/tradier/order-place", {
      method: "POST",
      body: JSON.stringify(order),
    });
    status(elements.orderStatus, `Order route returned ${data.intent_id}.`, "success");
  } catch (error) {
    status(elements.orderStatus, error.message, "error");
  }
});

function orderPayload() {
  return {
    asset_class: elements.orderAsset.value,
    side: elements.orderSide.value,
    symbol: elements.orderSymbol.value,
    option_symbol: elements.orderOptionSymbol.value,
    quantity: Number(elements.orderQuantity.value),
    type: elements.orderType.value,
    duration: "day",
    limit_price: Number(elements.orderPrice.value),
  };
}

window.addEventListener("keydown", (event) => {
  keys.add(event.key);
  if (event.key.toLowerCase() === "f") {
    elements.fullscreen.click();
  }
});
window.addEventListener("keyup", (event) => keys.delete(event.key));
window.addEventListener("resize", () => {
  resizeCanvas();
  render();
});
document.addEventListener("fullscreenchange", () => {
  resizeCanvas();
  render();
});

setAuthMode("login");
setOrderSides();
resizeCanvas();
spawnEntities();
updateUi();
loadSession().catch(() => showApp(false));
requestAnimationFrame(loop);
