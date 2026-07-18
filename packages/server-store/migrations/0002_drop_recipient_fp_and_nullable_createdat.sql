-- Metadata-leakage mitigation (spec 2026-05-30-metadata-leakage-audit.md).
--
-- 1. Drop recipient_fp entirely. It was a deterministic function of the recipient's public key,
--    so a public/leaked store could GROUP BY it to rebuild the recipient social graph. It is NOT
--    part of the HPKE AAD, so removing it has zero effect on decryption.
-- 2. Make created_at nullable and drop its default. New links no longer persist a creation
--    timestamp (it leaked ms-precision timing + timezone). Pre-existing v1 rows keep their
--    created_at value so their AAD (which binds createdAt) can still be reconstructed until they
--    expire; new v2 rows store NULL and bind no createdAt.
--
-- Note: this migration only loosens/removes columns; existing row data is preserved. A future
-- migration may DROP COLUMN created_at once all v1 links have aged out.

ALTER TABLE links DROP COLUMN recipient_fp;
ALTER TABLE links ALTER COLUMN created_at DROP NOT NULL;
ALTER TABLE links ALTER COLUMN created_at DROP DEFAULT;
