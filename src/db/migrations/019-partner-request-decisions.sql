CREATE TABLE IF NOT EXISTS partner_request_decisions (
  request_id BIGINT PRIMARY KEY,
  admin_id VARCHAR(32) CHARACTER SET ascii NOT NULL,
  decision VARCHAR(16) CHARACTER SET ascii NOT NULL,
  result_json LONGTEXT NOT NULL CHECK (JSON_VALID(result_json)),
  FOREIGN KEY (request_id) REFERENCES partner_requests(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;
