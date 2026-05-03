const RESEARCH_FEATURES = ["change_pct", "intraday_range", "atm_iv", "liquidity", "call_put_skew"];

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

export function normalizeFeatures(input, selectedFeatures = RESEARCH_FEATURES) {
  const features = {};
  for (const feature of selectedFeatures) {
    features[feature] = clamp(input?.[feature]);
  }
  return features;
}

function normalizeRow(sample, selectedFeatures) {
  return {
    ...normalizeFeatures(sample, selectedFeatures),
    label: Number(sample?.label) >= 0.5 ? 1 : 0,
    created_at: String(sample?.created_at || ""),
  };
}

function fitLogistic(rows, selectedFeatures, options = {}) {
  const learningRate = Number(options.learningRate || 0.12);
  const iterations = Number(options.iterations || 380);
  const weights = Object.fromEntries(selectedFeatures.map((feature) => [feature, 0]));
  let bias = 0;

  for (let step = 0; step < iterations; step += 1) {
    const gradients = Object.fromEntries(selectedFeatures.map((feature) => [feature, 0]));
    let biasGradient = 0;
    for (const row of rows) {
      const prediction = predictWithWeights({ weights, bias }, row, selectedFeatures).probability;
      const error = prediction - row.label;
      biasGradient += error;
      for (const feature of selectedFeatures) {
        gradients[feature] += error * row[feature];
      }
    }
    const scale = 1 / Math.max(rows.length, 1);
    bias -= learningRate * biasGradient * scale;
    for (const feature of selectedFeatures) {
      weights[feature] -= learningRate * gradients[feature] * scale;
    }
  }

  return { weights, bias };
}

function classification(probability) {
  if (probability >= 0.58) return "call_edge";
  if (probability <= 0.42) return "put_edge";
  return "no_trade";
}

function metricsFromPredictions(rows, predictions) {
  const correct = predictions.filter((probability, index) => (probability >= 0.5 ? 1 : 0) === rows[index].label).length;
  const brier =
    predictions.reduce((total, probability, index) => total + (probability - rows[index].label) ** 2, 0) /
    Math.max(predictions.length, 1);
  return {
    accuracy: Number((correct / Math.max(rows.length, 1)).toFixed(4)),
    brier: Number(brier.toFixed(4)),
  };
}

function walkForwardMetrics(rows, selectedFeatures) {
  if (rows.length < 8) {
    return {
      accuracy: null,
      brier: null,
      evaluation_rows: 0,
      training_rows: rows.length,
    };
  }

  const ordered = [...rows].sort((left, right) => left.created_at.localeCompare(right.created_at));
  const minimumTrainRows = Math.max(6, Math.floor(ordered.length * 0.55));
  const predictions = [];
  const evaluationRows = [];

  for (let index = minimumTrainRows; index < ordered.length; index += 1) {
    const trainRows = ordered.slice(0, index);
    const current = ordered[index];
    const model = fitLogistic(trainRows, selectedFeatures);
    predictions.push(predictWithWeights(model, current, selectedFeatures).probability);
    evaluationRows.push(current);
  }

  if (!evaluationRows.length) {
    return {
      accuracy: null,
      brier: null,
      evaluation_rows: 0,
      training_rows: rows.length,
    };
  }

  const metrics = metricsFromPredictions(evaluationRows, predictions);
  return {
    accuracy: metrics.accuracy,
    brier: metrics.brier,
    evaluation_rows: evaluationRows.length,
    training_rows: rows.length,
  };
}

export function trainLogisticModel(samples, options = {}) {
  const selectedFeatures = Array.isArray(options.featureKeys) && options.featureKeys.length ? options.featureKeys : RESEARCH_FEATURES;
  const rows = samples
    .map((sample) => normalizeRow(sample, selectedFeatures))
    .filter((row) => row.label === 0 || row.label === 1);

  if (rows.length < 8) {
    throw new Error("Collect at least 8 resolved replay outcomes before training the Cumulonimbus model.");
  }

  const { weights, bias } = fitLogistic(rows, selectedFeatures, options);
  const inSamplePredictions = rows.map((row) => predictWithWeights({ weights, bias }, row, selectedFeatures).probability);
  const inSampleMetrics = metricsFromPredictions(rows, inSamplePredictions);
  const walkForward = walkForwardMetrics(rows, selectedFeatures);

  return {
    kind: "cumulonimbus_replay_logistic_v2",
    features: selectedFeatures,
    weights,
    bias,
    metrics: {
      accuracy: walkForward.accuracy ?? inSampleMetrics.accuracy,
      brier: walkForward.brier ?? inSampleMetrics.brier,
      training_rows: rows.length,
      evaluation_rows: walkForward.evaluation_rows,
      in_sample_accuracy: inSampleMetrics.accuracy,
      in_sample_brier: inSampleMetrics.brier,
      validation: walkForward.evaluation_rows ? "walk_forward" : "insufficient_history",
    },
  };
}

export function predictWithWeights(model, rawFeatures, selectedFeatures = null) {
  const featureKeys =
    selectedFeatures && selectedFeatures.length
      ? selectedFeatures
      : Array.isArray(model?.features) && model.features.length
        ? model.features
        : RESEARCH_FEATURES;
  const features = normalizeFeatures(rawFeatures, featureKeys);
  let score = Number(model?.bias || 0);
  const weights = model?.weights || {};
  for (const feature of featureKeys) {
    score += Number(weights[feature] || 0) * features[feature];
  }
  const probability = sigmoid(score);
  return {
    probability: Number(probability.toFixed(4)),
    class: classification(probability),
    features,
  };
}

export function parseStoredModel(row) {
  if (!row) {
    return null;
  }
  const weights = JSON.parse(row.weights_json);
  const bias = Number(weights.bias || 0);
  delete weights.bias;
  return {
    id: row.id,
    name: row.name,
    kind: row.kind,
    weights,
    bias,
    metrics: JSON.parse(row.metrics_json),
    features: JSON.parse(row.features_json),
    training_rows: row.training_rows,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
