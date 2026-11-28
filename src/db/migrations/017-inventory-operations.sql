CREATE TABLE IF NOT EXISTS inventory_operations (
  operation_key VARCHAR(150) CHARACTER SET ascii COLLATE ascii_bin PRIMARY KEY,
  request_hash CHAR(64) CHARACTER SET ascii NOT NULL,
  result_json LONGTEXT NULL CHECK (result_json IS NULL OR JSON_VALID(result_json))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
