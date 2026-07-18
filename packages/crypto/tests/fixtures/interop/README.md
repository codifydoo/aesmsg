# Interop test vectors

`generate.py` (using [`pyhpke`](https://pypi.org/project/pyhpke/), an independent
RFC 9180 implementation) emits two deterministic vectors:

- **`vector.json`** — **v1 AAD** (binds `created_at_ms`). Read by
  `tests/interop.test.ts`.
- **`vector-v2.json`** — **v2 AAD** (the default for all new links; drops
  `created_at_ms` entirely). Read by `tests/interop/interop-v2.test.ts`.

Both assert that `@aesmsg/crypto`'s `open` recovers the plaintext from ciphertext
sealed by a different HPKE implementation, and that our `encodeAad` reproduces the
frozen AAD bytes. The v2 test additionally proves both KEM backends (native +
noble) decrypt the committed blob and round-trip bidirectionally at v2.

The committed `vector-v2.json` in this repo may have been captured via the
`@aesmsg/crypto` native backend rather than `pyhpke`; because the tests decrypt
whatever blob is committed and separately freeze the deterministic
`aad_encoded_hex`, regenerating with `pyhpke` produces a different (still valid)
ciphertext blob and the identical AAD bytes — both remain green.

## Why this exists

RFC 9180 Appendix A does not contain a published KAT for our exact suite
(`DHKEM(X25519, HKDF-SHA256)` KEM + `HKDF-SHA256` KDF + `AES-256-GCM` AEAD,
`mode_base`). This fixture, sealed by an independent implementation, is the
strongest available "we are standards-compliant" signal — far stronger than
self-roundtrip.

## Regenerating

Only regenerate when the suite or wire format changes:

```bash
python -m venv .venv
source .venv/bin/activate
pip install -r packages/crypto/tests/fixtures/interop/requirements.txt
python packages/crypto/tests/fixtures/interop/generate.py
```

This rewrites both `vector.json` and `vector-v2.json` deterministically — same
IKM produces same keys, and the AAD bytes are fully deterministic.

After regenerating, run the JS interop tests to confirm both sides still agree:

```bash
pnpm --filter @aesmsg/crypto test interop
```

Commit the regenerated `vector.json` / `vector-v2.json` together with the change
that motivated it.
