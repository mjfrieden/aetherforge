ALTER TABLE research_snapshots ADD COLUMN workspace TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE research_decisions ADD COLUMN workspace TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE research_outcomes ADD COLUMN workspace TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE research_paper_trades ADD COLUMN workspace TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE research_events ADD COLUMN workspace TEXT NOT NULL DEFAULT 'demo';
ALTER TABLE models ADD COLUMN workspace TEXT NOT NULL DEFAULT 'demo';

UPDATE research_snapshots
SET workspace = 'live'
WHERE user_id IN (SELECT user_id FROM tradier_accounts);

UPDATE research_decisions
SET workspace = 'live'
WHERE user_id IN (SELECT user_id FROM tradier_accounts);

UPDATE research_outcomes
SET workspace = 'live'
WHERE user_id IN (SELECT user_id FROM tradier_accounts);

UPDATE research_paper_trades
SET workspace = 'live'
WHERE user_id IN (SELECT user_id FROM tradier_accounts);

UPDATE research_events
SET workspace = 'live'
WHERE user_id IN (SELECT user_id FROM tradier_accounts);

UPDATE research_decisions
SET workspace = 'demo'
WHERE COALESCE(json_extract(rationale_json, '$.seeded'), 0) = 1
   OR COALESCE(json_extract(rationale_json, '$.engine'), '') IN ('seeded_demo', 'seeded_demo_model', 'seeded_backfill');

UPDATE research_outcomes
SET workspace = 'demo'
WHERE decision_id IN (
  SELECT id
  FROM research_decisions
  WHERE workspace = 'demo'
);

UPDATE research_paper_trades
SET workspace = 'demo'
WHERE decision_id IN (
  SELECT id
  FROM research_decisions
  WHERE workspace = 'demo'
);

UPDATE research_events
SET workspace = 'demo'
WHERE source IN ('System seed', 'System coach');

UPDATE research_snapshots
SET workspace = 'demo'
WHERE id IN (
  SELECT snapshot_id
  FROM research_decisions
  WHERE workspace = 'demo'
  UNION
  SELECT entry_snapshot_id
  FROM research_outcomes
  WHERE workspace = 'demo'
  UNION
  SELECT exit_snapshot_id
  FROM research_outcomes
  WHERE workspace = 'demo'
  UNION
  SELECT snapshot_id
  FROM research_events
  WHERE workspace = 'demo'
);

UPDATE models
SET workspace = 'live'
WHERE id IN (
  SELECT DISTINCT model_id
  FROM research_decisions
  WHERE workspace = 'live'
    AND model_id IS NOT NULL
);

UPDATE models
SET workspace = 'live'
WHERE user_id IN (
    SELECT DISTINCT user_id
    FROM research_snapshots
    WHERE workspace = 'live'
  )
  AND datetime(created_at) >= COALESCE(
    (
      SELECT MIN(datetime(rs.created_at))
      FROM research_snapshots rs
      WHERE rs.user_id = models.user_id
        AND rs.workspace = 'live'
    ),
    datetime(created_at)
  );

CREATE INDEX IF NOT EXISTS idx_research_snapshots_user_workspace_symbol_created
  ON research_snapshots(user_id, workspace, symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_decisions_user_workspace_symbol_created
  ON research_decisions(user_id, workspace, symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_outcomes_user_workspace_created
  ON research_outcomes(user_id, workspace, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_paper_trades_user_workspace_mode_opened
  ON research_paper_trades(user_id, workspace, mode, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_events_user_workspace_symbol_created
  ON research_events(user_id, workspace, symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_models_user_workspace_status
  ON models(user_id, workspace, status, updated_at DESC);
