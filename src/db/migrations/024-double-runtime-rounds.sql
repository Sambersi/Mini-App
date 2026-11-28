CREATE TABLE IF NOT EXISTS double_runtime_rounds (
  round_id VARCHAR(191) PRIMARY KEY,
  plan_json LONGTEXT NULL CHECK (plan_json IS NULL OR JSON_VALID(plan_json)),
  payout_json LONGTEXT NULL CHECK (payout_json IS NULL OR JSON_VALID(payout_json)),
  FOREIGN KEY (round_id) REFERENCES double_rounds(round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
CREATE TABLE IF NOT EXISTS double_statistics_batches (
  round_id VARCHAR(191) PRIMARY KEY,
  result_json LONGTEXT NOT NULL CHECK (JSON_VALID(result_json)),
  FOREIGN KEY (round_id) REFERENCES double_runtime_rounds(round_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
