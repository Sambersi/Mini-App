CREATE INDEX idx_finance_log_ts_id ON finance_log(ts,id);
CREATE INDEX idx_finance_log_type_ts ON finance_log(type(64),ts);
