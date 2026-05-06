export const MINIMUM_SHADOW_PROMOTION_PAIRS = 3;

function toNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function average(values) {
  if (!values.length) {
    return null;
  }
  const total = values.reduce((sum, value) => sum + value, 0);
  return Number((total / values.length).toFixed(4));
}

function decisionWin(decision, outcomeLabel) {
  if (!decision || !outcomeLabel) {
    return 0;
  }
  if (decision === "no_trade") {
    return outcomeLabel === "no_trade_win" ? 1 : 0;
  }
  return outcomeLabel === `${decision}_win` ? 1 : 0;
}

export function splitChronologicalHoldout(samples) {
  const ordered = [...samples].sort((left, right) => String(left.created_at).localeCompare(String(right.created_at)));
  const maxHoldout = Math.max(0, ordered.length - 8);
  if (!maxHoldout) {
    return {
      trainRows: ordered,
      holdoutRows: [],
      holdoutWindow: {
        starts_at: null,
        ends_at: null,
      },
    };
  }
  const requestedHoldout = ordered.length >= 15 ? Math.ceil(ordered.length * 0.2) : 2;
  const holdoutSize = Math.min(maxHoldout, requestedHoldout);
  const trainRows = ordered.slice(0, ordered.length - holdoutSize);
  const holdoutRows = ordered.slice(ordered.length - holdoutSize);
  return {
    trainRows,
    holdoutRows,
    holdoutWindow: {
      starts_at: holdoutRows[0]?.created_at || null,
      ends_at: holdoutRows[holdoutRows.length - 1]?.created_at || null,
    },
  };
}

export function summarizeShadowPromotionPairs(rows, minimumPairs = MINIMUM_SHADOW_PROMOTION_PAIRS) {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const candidateScores = normalizedRows.map((row) => toNumber(row.candidate_outcome_score, 0));
  const activeScores = normalizedRows.map((row) => toNumber(row.active_outcome_score, 0));
  const candidateWins = normalizedRows.map((row) => decisionWin(row.candidate_decision, row.candidate_outcome_label));
  const activeWins = normalizedRows.map((row) => decisionWin(row.active_decision, row.active_outcome_label));
  const candidateAvgScore = average(candidateScores);
  const activeAvgScore = average(activeScores);
  const candidateWinRate = average(candidateWins);
  const activeWinRate = average(activeWins);
  const scoreDelta =
    candidateAvgScore === null || activeAvgScore === null
      ? null
      : Number((candidateAvgScore - activeAvgScore).toFixed(4));
  const winRateDelta =
    candidateWinRate === null || activeWinRate === null
      ? null
      : Number((candidateWinRate - activeWinRate).toFixed(4));
  const evaluatedPairs = normalizedRows.length;
  const passed =
    evaluatedPairs >= minimumPairs &&
    (scoreDelta ?? -1) >= 0 &&
    (winRateDelta ?? -1) >= 0;
  return {
    evaluatedPairs,
    minimumPairs,
    candidateAvgScore,
    activeAvgScore,
    candidateWinRate,
    activeWinRate,
    scoreDelta,
    winRateDelta,
    passed,
  };
}

export function buildPromotionComparison(activeModel, candidateModel, activeScore, candidateScore, holdoutWindow, shadowStats) {
  if (!activeModel) {
    return {
      againstModelId: null,
      evaluatedRows: candidateScore.rows,
      accuracyDelta: null,
      brierDelta: null,
      verdict: "first_model",
      summary: "First trainable model. No active benchmark exists yet.",
      holdoutWindow,
      shadowEvaluation: shadowStats,
      promotionGate: {
        minimumTrainingRows: 8,
        minimumEvaluationRows: 1,
        minimumShadowPairs: 0,
        passed: true,
      },
    };
  }

  const accuracyDelta = Number(((candidateScore.accuracy ?? 0) - (activeScore.accuracy ?? 0)).toFixed(4));
  const brierDelta = Number(((candidateScore.brier ?? 0) - (activeScore.brier ?? 0)).toFixed(4));
  const holdoutPassed =
    candidateModel.metrics.training_rows >= 8 &&
    candidateScore.rows >= 1 &&
    accuracyDelta >= 0 &&
    brierDelta <= 0;
  const passed = holdoutPassed && Boolean(shadowStats?.passed);
  let summary = "Candidate is saved in shadow until it proves itself on later untouched data.";
  if (!holdoutPassed) {
    summary = "Candidate is saved in shadow until it clearly beats the active model on the historical holdout window.";
  } else if ((shadowStats?.evaluatedPairs || 0) < (shadowStats?.minimumPairs || MINIMUM_SHADOW_PROMOTION_PAIRS)) {
    summary = `Candidate cleared the historical holdout and is now collecting future shadow evidence (${shadowStats?.evaluatedPairs || 0}/${shadowStats?.minimumPairs || MINIMUM_SHADOW_PROMOTION_PAIRS} resolved comparisons).`;
  } else if (!shadowStats?.passed) {
    summary = "Candidate passed the historical holdout but has not yet beaten the active model in future shadow results.";
  } else {
    summary = "Candidate cleared both the historical holdout and the future shadow window and is ready for promotion.";
  }
  return {
    againstModelId: activeModel.id,
    againstVersionStatus: activeModel.status || "active",
    evaluatedRows: Math.min(activeScore.rows || 0, candidateScore.rows || 0),
    activeAccuracy: activeScore.accuracy,
    candidateAccuracy: candidateScore.accuracy,
    activeBrier: activeScore.brier,
    candidateBrier: candidateScore.brier,
    holdoutWindow,
    shadowEvaluation: shadowStats,
    accuracyDelta,
    brierDelta,
    verdict: passed ? "promote_ready" : "shadow_first",
    summary,
    promotionGate: {
      minimumTrainingRows: 8,
      minimumEvaluationRows: 1,
      minimumShadowPairs: shadowStats?.minimumPairs || MINIMUM_SHADOW_PROMOTION_PAIRS,
      validationWindow: "chronological_holdout_plus_shadow",
      requiresNonWorseAccuracy: true,
      requiresNonHigherBrier: true,
      requiresNonWorseShadowScore: true,
      requiresNonWorseShadowWinRate: true,
      passed,
    },
  };
}

export async function loadShadowPromotionPairs(db, userId, workspace, candidateRow, activeRow) {
  if (!candidateRow?.id || !activeRow?.id) {
    return [];
  }
  const rows = await db
    .prepare(
      `SELECT
         cd.snapshot_id,
         cd.created_at AS candidate_created_at,
         cd.decision AS candidate_decision,
         co.outcome_label AS candidate_outcome_label,
         co.score AS candidate_outcome_score,
         ad.decision AS active_decision,
         ao.outcome_label AS active_outcome_label,
         ao.score AS active_outcome_score
       FROM research_decisions cd
       JOIN research_outcomes co
         ON co.decision_id = cd.id
        AND co.workspace = cd.workspace
       JOIN research_decisions ad
         ON ad.snapshot_id = cd.snapshot_id
        AND ad.user_id = cd.user_id
        AND ad.workspace = cd.workspace
        AND ad.model_id = ?
       JOIN research_outcomes ao
         ON ao.decision_id = ad.id
        AND ao.workspace = ad.workspace
       WHERE cd.user_id = ?
         AND cd.workspace = ?
         AND cd.model_id = ?
         AND datetime(cd.created_at) >= datetime(?)
         AND COALESCE(json_extract(cd.rationale_json, '$.auto_shadow_candidate'), 0) = 1
       ORDER BY datetime(cd.created_at) ASC`,
    )
    .bind(activeRow.id, userId, workspace, candidateRow.id, candidateRow.created_at)
    .all();
  return rows.results || [];
}
