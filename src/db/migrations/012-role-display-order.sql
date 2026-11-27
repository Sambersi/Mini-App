ALTER TABLE player_roles ADD COLUMN role_order BIGINT NOT NULL DEFAULT 0;

ALTER TABLE player_roles ADD COLUMN original_value_json LONGTEXT NULL CHECK (original_value_json IS NULL OR JSON_VALID(original_value_json));
