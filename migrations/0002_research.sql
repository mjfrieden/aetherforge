CREATE TABLE IF NOT EXISTS research_snapshots (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  symbol TEXT NOT NULL,
  expiration_date TEXT,
  snapshot_at TEXT NOT NULL,
  quote_json TEXT NOT NULL,
  feature_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_research_snapshots_user_symbol_created
  ON research_snapshots(user_id, symbol, created_at DESC);

CREATE TABLE IF NOT EXISTS research_option_quotes (
  id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  option_symbol TEXT NOT NULL,
  contract_type TEXT NOT NULL CHECK (contract_type IN ('call', 'put')),
  strike REAL NOT NULL,
  expiration_date TEXT NOT NULL,
  bid REAL,
  ask REAL,
  last REAL,
  mark REAL NOT NULL,
  volume INTEGER NOT NULL,
  open_interest INTEGER NOT NULL,
  implied_volatility REAL,
  delta REAL,
  gamma REAL,
  theta REAL,
  vega REAL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (snapshot_id) REFERENCES research_snapshots(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_research_option_quotes_snapshot_symbol
  ON research_option_quotes(snapshot_id, option_symbol);

CREATE TABLE IF NOT EXISTS research_decisions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  snapshot_id TEXT NOT NULL,
  model_id TEXT,
  mode TEXT NOT NULL CHECK (mode IN ('paper', 'shadow')),
  symbol TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('call', 'put', 'no_trade')),
  probability REAL NOT NULL,
  score REAL NOT NULL,
  selected_option_symbol TEXT,
  selected_contract_type TEXT CHECK (selected_contract_type IN ('call', 'put')),
  selected_entry_mark REAL,
  call_option_symbol TEXT,
  call_entry_mark REAL,
  put_option_symbol TEXT,
  put_entry_mark REAL,
  underlying_entry_price REAL NOT NULL,
  features_json TEXT NOT NULL,
  rationale_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  resolved_at TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES research_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_research_decisions_user_symbol_created
  ON research_decisions(user_id, symbol, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_decisions_user_resolved
  ON research_decisions(user_id, resolved_at, created_at DESC);

CREATE TABLE IF NOT EXISTS research_outcomes (
  id TEXT PRIMARY KEY,
  decision_id TEXT NOT NULL UNIQUE,
  user_id TEXT NOT NULL,
  entry_snapshot_id TEXT NOT NULL,
  exit_snapshot_id TEXT NOT NULL,
  outcome_label TEXT NOT NULL CHECK (outcome_label IN ('call_win', 'put_win', 'no_trade_win', 'mixed', 'insufficient_data')),
  selected_return REAL,
  call_return REAL,
  put_return REAL,
  underlying_return REAL,
  score REAL NOT NULL,
  horizon_minutes INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (decision_id) REFERENCES research_decisions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (entry_snapshot_id) REFERENCES research_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (exit_snapshot_id) REFERENCES research_snapshots(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_research_outcomes_user_created
  ON research_outcomes(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS research_paper_trades (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  decision_id TEXT,
  snapshot_id TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('paper', 'shadow')),
  symbol TEXT NOT NULL,
  option_symbol TEXT NOT NULL,
  side TEXT NOT NULL CHECK (side IN ('call', 'put')),
  quantity INTEGER NOT NULL,
  entry_price REAL NOT NULL,
  entry_underlying_price REAL NOT NULL,
  entry_score REAL NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('open', 'closed')),
  opened_at TEXT NOT NULL,
  closed_at TEXT,
  exit_snapshot_id TEXT,
  exit_price REAL,
  pnl REAL,
  outcome_label TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (decision_id) REFERENCES research_decisions(id) ON DELETE SET NULL,
  FOREIGN KEY (snapshot_id) REFERENCES research_snapshots(id) ON DELETE CASCADE,
  FOREIGN KEY (exit_snapshot_id) REFERENCES research_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_research_paper_trades_user_mode_opened
  ON research_paper_trades(user_id, mode, opened_at DESC);

CREATE INDEX IF NOT EXISTS idx_research_paper_trades_user_status
  ON research_paper_trades(user_id, status, opened_at DESC);

CREATE TABLE IF NOT EXISTS research_events (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  snapshot_id TEXT,
  symbol TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  source TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (snapshot_id) REFERENCES research_snapshots(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_research_events_user_symbol_created
  ON research_events(user_id, symbol, created_at DESC);
