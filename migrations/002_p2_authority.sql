ALTER TABLE runs ADD COLUMN environment_fingerprint TEXT;
ALTER TABLE runs ADD COLUMN environment_json TEXT;
ALTER TABLE runs ADD COLUMN issue_identifier TEXT;
ALTER TABLE runs ADD COLUMN release_intent TEXT;
ALTER TABLE runs ADD COLUMN planner_error TEXT;

ALTER TABLE approvals ADD COLUMN intent_id TEXT;
ALTER TABLE approvals ADD COLUMN team_id TEXT;
ALTER TABLE approvals ADD COLUMN channel_id TEXT;
ALTER TABLE approvals ADD COLUMN message_ts TEXT;
ALTER TABLE approvals ADD COLUMN reviewer_user_id TEXT;
ALTER TABLE approvals ADD COLUMN created_at TEXT;
ALTER TABLE approvals ADD COLUMN transport_dedupe_key TEXT;
ALTER TABLE approvals ADD COLUMN action_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS approvals_intent_id_idx ON approvals(intent_id);
CREATE UNIQUE INDEX IF NOT EXISTS approvals_transport_dedupe_idx ON approvals(transport_dedupe_key) WHERE transport_dedupe_key IS NOT NULL;
