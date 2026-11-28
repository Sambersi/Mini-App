ALTER TABLE dice_runtime_rounds
  ADD COLUMN bot_mode VARCHAR(16) NULL,
  ADD COLUMN offer_until BIGINT NULL,
  ADD COLUMN plan_json LONGTEXT NULL CHECK (plan_json IS NULL OR JSON_VALID(plan_json)),
  ADD COLUMN result_json LONGTEXT NULL CHECK (result_json IS NULL OR JSON_VALID(result_json)),
  ADD COLUMN delivered_at BIGINT NULL;
