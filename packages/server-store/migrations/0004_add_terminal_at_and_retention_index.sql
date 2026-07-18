-- BE-7 / R18: bounded terminal-row retention + an index for the sweep DELETE.
--
-- Terminal (expired/revoked/exhausted) link rows were kept forever: after the metadata-leakage audit
-- dropped recipient_fp and created_at, a leaked DB could still reconstruct full historical
-- volume/timing from the retained rows, and the table grew without bound. The sweep's terminal-status
-- DELETE also had no supporting index (only the partial `active` index from 0001), so it degraded to
-- a growing seq scan every run.
--
-- 1. Add a nullable `terminal_at` timestamp, stamped `now()` the moment a row goes terminal
--    (revoke / last-open exhaustion / expiry sweep). Unlike expires_at it exists for EVERY terminal
--    row regardless of how it terminalized, so retention can be measured uniformly — including for
--    early-revoked or opens-exhausted links whose expires_at is far in the future. It is internal
--    bookkeeping only: it is never returned to the API, so it leaks no timing to clients, and the row
--    (and thus the timestamp) is deleted once past the retention window.
-- 2. Backfill existing terminal rows so they become prune-eligible. We don't know when they actually
--    terminalized, so we stamp now(): this conservatively starts their retention clock at this
--    migration — they prune N later, never earlier.
-- 3. Add a partial index over terminal rows. It supports BOTH the existing ciphertext-purge subquery
--    (`WHERE status IN ('expired','revoked')`) and the new prune DELETE (which additionally ranges on
--    terminal_at), so neither is a seq scan.
--
-- Forward-only (no down migration): a rollback is a database restore, per the Phase-1 convention.

ALTER TABLE links ADD COLUMN terminal_at timestamptz;

UPDATE links SET terminal_at = now() WHERE status IN ('expired', 'revoked') AND terminal_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_links_terminal_at
  ON links (terminal_at)
  WHERE status IN ('expired', 'revoked');
