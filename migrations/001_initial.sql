CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL,
  checksum TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  environment_id TEXT NOT NULL,
  request_key TEXT NOT NULL,
  request_hash TEXT NOT NULL,
  phase TEXT NOT NULL,
  status TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  manifest_id TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(environment_id, request_key)
);

CREATE TABLE IF NOT EXISTS commands (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  kind TEXT NOT NULL,
  expected_version INTEGER,
  dedupe_key TEXT NOT NULL UNIQUE,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL,
  error_code TEXT,
  created_at TEXT NOT NULL,
  applied_at TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  sequence INTEGER NOT NULL,
  kind TEXT NOT NULL,
  actor TEXT NOT NULL,
  correlation_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE(run_id, sequence)
);

CREATE TABLE IF NOT EXISTS manifests (
  id TEXT PRIMARY KEY,
  hash TEXT NOT NULL UNIQUE,
  canonical_json TEXT NOT NULL,
  release_body TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  manifest_id TEXT NOT NULL REFERENCES manifests(id),
  intent_nonce TEXT NOT NULL UNIQUE,
  decision TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  reserved_operation_id TEXT
);

CREATE TABLE IF NOT EXISTS operations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  manifest_id TEXT REFERENCES manifests(id),
  environment_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  target_key TEXT NOT NULL,
  effect_key TEXT NOT NULL,
  status TEXT NOT NULL,
  next_attempt_at TEXT,
  remote_object_id TEXT,
  UNIQUE(environment_id, effect_key)
);

CREATE TABLE IF NOT EXISTS attempts (
  id TEXT PRIMARY KEY,
  operation_id TEXT NOT NULL REFERENCES operations(id),
  ordinal INTEGER NOT NULL,
  reserved_at TEXT NOT NULL,
  sent_at TEXT,
  result_kind TEXT,
  completed_at TEXT,
  UNIQUE(operation_id, ordinal)
);

CREATE TABLE IF NOT EXISTS observations (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  attempt_id TEXT REFERENCES attempts(id),
  provider TEXT NOT NULL,
  mode TEXT NOT NULL,
  object_id TEXT NOT NULL,
  observed_at TEXT NOT NULL,
  normalized_json TEXT NOT NULL,
  payload_digest TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS worker_state (
  singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
  heartbeat_at TEXT NOT NULL,
  process_id INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS scenario_runs (
  id TEXT PRIMARY KEY,
  scenario_id TEXT NOT NULL,
  environment_id TEXT NOT NULL,
  seed INTEGER NOT NULL,
  schedule_json TEXT NOT NULL,
  implementation_digest TEXT NOT NULL,
  rule_results_json TEXT NOT NULL,
  status TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS commands_status_created_at_idx ON commands(status, created_at);
CREATE INDEX IF NOT EXISTS operations_status_next_attempt_at_idx ON operations(status, next_attempt_at);
CREATE INDEX IF NOT EXISTS events_run_id_sequence_idx ON events(run_id, sequence);
CREATE INDEX IF NOT EXISTS observations_run_id_provider_idx ON observations(run_id, provider);
CREATE INDEX IF NOT EXISTS scenario_runs_scenario_id_seed_idx ON scenario_runs(scenario_id, seed);
