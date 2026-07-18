CREATE TABLE IF NOT EXISTS links (
  id              text PRIMARY KEY,
  status          text NOT NULL CHECK (status IN ('active', 'revoked', 'expired')),
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  max_opens       integer NOT NULL CHECK (max_opens > 0 OR max_opens = -1),
  opens_count     integer NOT NULL DEFAULT 0 CHECK (opens_count >= 0),
  recipient_fp    text NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_links_active_expires ON links (expires_at) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS link_ciphertexts (
  link_id   text PRIMARY KEY REFERENCES links(id) ON DELETE CASCADE,
  blob      bytea NOT NULL,
  size      integer NOT NULL CHECK (size >= 0)
);
