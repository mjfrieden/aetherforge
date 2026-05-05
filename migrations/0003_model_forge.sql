CREATE TABLE IF NOT EXISTS feature_manifests (
  id TEXT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  owner_user_id TEXT,
  scope TEXT NOT NULL CHECK (scope IN ('system', 'user')),
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  feature_keys_json TEXT NOT NULL,
  manifest_json TEXT NOT NULL,
  is_public INTEGER NOT NULL DEFAULT 1,
  supports_training INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_manifests_scope_public
  ON feature_manifests(scope, is_public, updated_at DESC);

CREATE TABLE IF NOT EXISTS user_feature_manifest_imports (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  manifest_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  notes TEXT,
  imported_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (manifest_id) REFERENCES feature_manifests(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_user_feature_manifest_imports_unique
  ON user_feature_manifest_imports(user_id, manifest_id);

CREATE INDEX IF NOT EXISTS idx_user_feature_manifest_imports_user
  ON user_feature_manifest_imports(user_id, imported_at DESC);
