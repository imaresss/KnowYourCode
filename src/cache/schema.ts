export const MIGRATION_V2_SQL = `
ALTER TABLE explanations ADD COLUMN source_code TEXT;
ALTER TABLE explanations ADD COLUMN incremental_depth INTEGER DEFAULT 0;
`;

export const MIGRATION_V3_SQL = `
CREATE TABLE IF NOT EXISTS tutorial_cache (
  code_hash TEXT NOT NULL,
  language TEXT NOT NULL,
  tutorials_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (code_hash, language)
);
`;

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS explanations (
  symbol_key TEXT NOT NULL,
  explanation_type TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  dependency_hash TEXT NOT NULL,
  model_name TEXT NOT NULL,
  provider_mode TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  content_json TEXT NOT NULL,
  created_at TEXT NOT NULL,
  source_code TEXT,
  incremental_depth INTEGER DEFAULT 0,
  PRIMARY KEY (symbol_key, explanation_type, model_name, provider_mode, prompt_version)
);

CREATE TABLE IF NOT EXISTS call_edges (
  parent_symbol_key TEXT NOT NULL,
  child_symbol_name TEXT NOT NULL,
  child_file_path TEXT NOT NULL,
  child_signature TEXT,
  discovered_at TEXT NOT NULL,
  PRIMARY KEY (parent_symbol_key, child_symbol_name, child_file_path)
);
`;
