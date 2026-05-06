ALTER TABLE models ADD COLUMN status TEXT NOT NULL DEFAULT 'active';
ALTER TABLE models ADD COLUMN promoted_from_model_id TEXT;
ALTER TABLE models ADD COLUMN promotion_reason TEXT;
ALTER TABLE models ADD COLUMN comparison_json TEXT NOT NULL DEFAULT '{}';
ALTER TABLE models ADD COLUMN activated_at TEXT;
ALTER TABLE models ADD COLUMN archived_at TEXT;

WITH ranked_models AS (
  SELECT
    id,
    user_id,
    ROW_NUMBER() OVER (
      PARTITION BY user_id
      ORDER BY datetime(updated_at) DESC, datetime(created_at) DESC, id DESC
    ) AS version_rank
  FROM models
)
UPDATE models
SET
  status = CASE
    WHEN id IN (SELECT id FROM ranked_models WHERE version_rank = 1) THEN 'active'
    ELSE 'archived'
  END,
  activated_at = CASE
    WHEN id IN (SELECT id FROM ranked_models WHERE version_rank = 1) THEN COALESCE(activated_at, updated_at)
    ELSE activated_at
  END,
  archived_at = CASE
    WHEN id IN (SELECT id FROM ranked_models WHERE version_rank > 1) THEN COALESCE(archived_at, updated_at)
    ELSE archived_at
  END
WHERE EXISTS (SELECT 1 FROM ranked_models WHERE ranked_models.id = models.id);

CREATE INDEX IF NOT EXISTS idx_models_user_status
  ON models(user_id, status, updated_at DESC);
