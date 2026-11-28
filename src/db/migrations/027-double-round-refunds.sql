ALTER TABLE double_runtime_rounds
  ADD COLUMN refund_json LONGTEXT NULL CHECK (refund_json IS NULL OR JSON_VALID(refund_json));
