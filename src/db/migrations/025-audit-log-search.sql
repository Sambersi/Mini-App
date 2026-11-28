ALTER TABLE finance_log
  ADD COLUMN operation_key VARCHAR(191) CHARACTER SET ascii NULL,
  ADD COLUMN entity_type VARCHAR(32) CHARACTER SET ascii NULL,
  ADD COLUMN entity_id VARCHAR(191) NULL,
  ADD COLUMN actor_name_snapshot TEXT NULL,
  ADD COLUMN target_name_snapshot TEXT NULL,
  ADD COLUMN schema_version SMALLINT NOT NULL DEFAULT 1;
CREATE INDEX idx_finance_actor_time ON finance_log(actor_user_id,ts,id);
CREATE INDEX idx_finance_target_time ON finance_log(target_user_id,ts,id);
CREATE INDEX idx_finance_chat_time ON finance_log(chat_id,ts,id);
CREATE INDEX idx_finance_operation ON finance_log(operation_key,ts,id);
CREATE INDEX idx_finance_entity ON finance_log(entity_type,entity_id,ts,id);
