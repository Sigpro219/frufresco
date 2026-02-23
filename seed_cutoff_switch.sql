
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    description TEXT
);

INSERT INTO app_settings (key, value, description)
VALUES ('enable_cutoff_rules', 'false', 'Set to false to bypass 6PM/8PM cutoff rules for testing')
ON CONFLICT (key) DO UPDATE SET value = 'false';
