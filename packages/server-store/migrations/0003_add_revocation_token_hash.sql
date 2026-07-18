-- BE-1 / R2: authenticated revocation.
--
-- Adds a nullable SHA-256 hash of a per-link secret revocation token. The token is minted at create
-- time, returned to the creator ONCE (never retrievable again), and required to revoke a link. The
-- server hashes the token presented on revoke and compares it against this column in constant time;
-- only the hash is ever persisted, so the raw token never touches the server after the create
-- response and a leaked store cannot revoke anything.
--
-- NULLABLE with no default ON PURPOSE: rows created BEFORE this migration (legacy links) have NULL
-- here and stay "un-tokened" — revoke() accepts an un-tokened request for exactly those rows so
-- existing users' revoke keeps working. They age out via expiry. Every row created after this ship
-- carries a hash, and revoke of a tokened row without the matching token is a silent no-op.
--
-- This migration only ADDs a nullable column; existing row data is untouched.

ALTER TABLE links ADD COLUMN revocation_token_hash text;
