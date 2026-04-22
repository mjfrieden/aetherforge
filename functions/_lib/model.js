const FEATURES = ["momentum", "volatility", "sentiment", "liquidity", "iv_rank"];

function clamp(value, min = -1, max = 1) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return 0;
  }
  return Math.max(min, Math.min(max, number));
}

function sigmoid(value) {
  return 1 / (1 + Math.exp(-Math.max(-30, Math.min(30, value))));
}

export function normalizeSample(sample) {
  const features = {};
  for (const feature of FEATURES) {
    features[feature] = clamp(sample?.[feature]);
  }
  const label = Number(sample?.label) >= 0.5 ? 1 : 0;
  return { ...features, label };
}

export function normalizeFeatures(input) {
  const features = {};
  for (const feature of FEATURES) {
    features[feature] = clamp(input?.[feature]);
  }
  return features;
}

export function defaultSamples() {
  return [
    { momentum: 0.8, volatility: -0.2, sentiment: 0.5, liquidity: 0.8, iv_rank: -0.4, label: 1 },
    { momentum: 0.6, volatility: 0.2, sentiment: 0.6, liquidity: 0.5, iv_rank: -0.1, label: 1 },
    { momentum: -0.7, volatility: 0.5, sentiment: -0.6, liquidity: 0.6, iv_rank: 0.3, label: 0 },
    { momentum: -0.4, volatility: 0.7, sentiment: -0.7, liquidity: 0.2, iv_rank: 0.8, label: 0 },
    { momentum: 0.2, volatility: -0.6, sentiment: 0.1, liquidity: 0.9, iv_rank: -0.5, label: 1 },
    { momentum: -0.1, volatility: 0.8, sentiment: 0.1, liquidity: 0.1, iv_rank: 0.9, label: 0 },
    { momentum: 0.4, volatility: 0.1, sentiment: -0.2, liquidity: 0.7, iv_rank: -0.2, label: 1 },
    { momentum: -0.6, volatility: -0.1, sentiment: -0.3, liquidity: 0.5, iv_rank: 0.1, label: 0 },
  ];
}

export function trainLogisticModel(samples, options = {}) {
  const rows = samples.map(normalizeSample).filter((row) => row.label === 0 || row.label === 1);
  const trainingRows = rows.length >= 6 ? rows : defaultSamples().concat(rows);
  const learningRate = Number(options.learningRate || 0.14);
  const iterations = Number(options.iterations || 340);
  const weights = Object.fromEntries(FEATURES.map((feature) => [feature, 0]));
  let bias = 0;

  for (let step = 0; step < iterations; step += 1) {
    const gradients = Object.fromEntries(FEATURES.map((feature) => [feature, 0]));
    let biasGradient = 0;

    for (const row of trainingRows) {
      const prediction = predictWithWeights({ weights, bias }, row).probability;
      const error = prediction - row.label;
      biasGradient += error;
      for (const feature of FEATURES) {
        gradients[feature] += error * row[feature];
      }
    }

    const scale = 1 / trainingRows.length;
    bias -= learningRate * biasGradient * scale;
    for (const feature of FEATURES) {
      weights[feature] -= learningRate * gradients[feature] * scale;
    }
  }

  const predictions = trainingRows.map((row) => predictWithWeights({ weights, bias }, row).probability);
  const correct = predictions.filter((probability, index) => (probability >= 0.5 ? 1 : 0) === trainingRows[index].label).length;
  const brier =
    predictions.reduce((total, probability, index) => total + (probability - trainingRows[index].label) ** 2, 0) /
    trainingRows.length;

  return {
    kind: "logistic_edge_v1",
    features: FEATURES,
    weights,
    bias,
    metrics: {
      accuracy: Number((correct / trainingRows.length).toFixed(4)),
      brier: Number(brier.toFixed(4)),
      training_rows: trainingRows.length,
      user_rows: rows.length,
    },
  };
}

export function predictWithWeights(model, rawFeatures) {
  const features = normalizeFeatures(rawFeatures);
  let score = Number(model?.bias || 0);
  const weights = model?.weights || {};
  for (const feature of FEATURES) {
    score += Number(weights[feature] || 0) * features[feature];
  }
  const probability = sigmoid(score);
  return {
    probability: Number(probability.toFixed(4)),
    class: probability >= 0.58 ? "call_edge" : probability <= 0.42 ? "put_hedge" : "no_trade",
    features,
  };
}

export function parseStoredModel(row) {
  if (!row) {
    return null;
  }
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    weights: JSON.parse(row.weights_json),
    metrics: JSON.parse(row.metrics_json),
    features: JSON.parse(row.features_json),
    training_rows: row.training_rows,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
