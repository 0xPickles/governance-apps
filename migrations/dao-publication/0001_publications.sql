-- Keep this database across releases. Never refund uncertain attempts or delete abandoned rows.
CREATE TABLE dao_publication_policy (
  singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
  limits_json TEXT NOT NULL
);
CREATE TABLE dao_publications (
  digest TEXT PRIMARY KEY,
  cid TEXT NOT NULL UNIQUE,
  content BLOB NOT NULL,
  byte_length INTEGER NOT NULL CHECK (byte_length > 0 AND byte_length <= 131072),
  admitted_at INTEGER NOT NULL,
  published_at INTEGER,
  upload_accepted INTEGER NOT NULL DEFAULT 0,
  upload_attempts INTEGER NOT NULL DEFAULT 0,
  retrieval_attempts INTEGER NOT NULL DEFAULT 0,
  reservations INTEGER NOT NULL DEFAULT 0,
  lease_token TEXT,
  lease_until INTEGER NOT NULL DEFAULT 0,
  retry_after INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX dao_publications_admitted ON dao_publications(admitted_at);
