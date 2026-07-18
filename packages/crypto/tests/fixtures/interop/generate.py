"""
Generate a aesmsg interop test vector by sealing a known plaintext for a
deterministic X25519 recipient using pyhpke (RFC 9180 reference implementation),
then writing the result as a JSON file the JavaScript test reads.

Run from the repo root after installing the requirements:

    python -m venv .venv
    source .venv/bin/activate
    pip install -r packages/crypto/tests/fixtures/interop/requirements.txt
    python packages/crypto/tests/fixtures/interop/generate.py

The resulting vector.json is committed to the repo and read by interop.test.ts.
Regenerate only when changing the suite, wire format, or AAD encoding.

AAD layout (must match packages/crypto/src/aad.ts encodeAad()):

    [AAD_VERSION       : u8        = 0x01]
    [WIRE_VERSION      : u8        = 0x01]
    [SUITE             : u8        = 0x01]   # X25519 + AES-256-GCM
    [link_id_length    : u16 BE]
    [link_id           : utf-8 bytes]
    [recipient_hash    : 32 bytes  = SHA-256(raw 32-byte X25519 public key)]
    [created_at_ms     : u64 BE]
    [expires_at_ms     : u64 BE]
    [max_opens         : i32 BE]
"""

from __future__ import annotations

import hashlib
import json
import struct
from pathlib import Path

from pyhpke import AEADId, CipherSuite, KDFId, KEMId

# Suite must match @aesmsg/crypto: X25519-HKDF-SHA256 + HKDF-SHA256 + AES-256-GCM
SUITE = CipherSuite.new(
    KEMId.DHKEM_X25519_HKDF_SHA256,
    KDFId.HKDF_SHA256,
    AEADId.AES256_GCM,
)

WIRE_VERSION = 0x01
SUITE_BYTE = 0x01
AAD_VERSION = 0x01

PLAINTEXT = b"hello from python interop"

# Fixed MessageBindingContext for the fixture. Must match interop.test.ts.
LINK_ID = "interop-vector16"  # 16-byte ASCII; matches encodeAad's wire invariant.
CREATED_AT_MS = 1700000000000
EXPIRES_AT_MS = 1700086400000
MAX_OPENS = 1

# RFC 9180 §7.1.3: DeriveKeyPair from IKM is deterministic.
# The JS side derives the same keypair via @hpke/core's deriveKeyPair(ikm).
IKM = bytes([0x42] * 32)
kp = SUITE.kem.derive_key_pair(IKM)
recipient_pubkey_raw = kp.public_key.to_public_bytes()
recipient_privkey_raw = kp.private_key.to_private_bytes()
assert len(recipient_pubkey_raw) == 32, recipient_pubkey_raw
assert len(recipient_privkey_raw) == 32, recipient_privkey_raw


def encode_aad(
    link_id: str,
    recipient_pubkey_raw: bytes,
    created_at_ms: int,
    expires_at_ms: int,
    max_opens: int,
) -> bytes:
    """Mirror of encodeAad() in packages/crypto/src/aad.ts."""
    link_id_bytes = link_id.encode("utf-8")
    assert 0 < len(link_id_bytes) <= 0xFFFF, "linkId length out of range"

    # Hash the RAW 32-byte X25519 public key (not the amk1: encoded form).
    recip_hash = hashlib.sha256(recipient_pubkey_raw).digest()
    assert len(recip_hash) == 32

    out = bytearray()
    out.append(AAD_VERSION)
    out.append(WIRE_VERSION)
    out.append(SUITE_BYTE)
    out += struct.pack(">H", len(link_id_bytes))  # u16 BE
    out += link_id_bytes
    out += recip_hash
    out += struct.pack(">Q", created_at_ms)  # u64 BE
    out += struct.pack(">Q", expires_at_ms)  # u64 BE
    out += struct.pack(">i", max_opens)  # i32 BE
    return bytes(out)


aad = encode_aad(
    LINK_ID,
    recipient_pubkey_raw,
    CREATED_AT_MS,
    EXPIRES_AT_MS,
    MAX_OPENS,
)

encapsulated_key, sender_ctx = SUITE.create_sender_context(kp.public_key)
aead_output = sender_ctx.seal(PLAINTEXT, aad=aad)
assert len(encapsulated_key) == 32, encapsulated_key

# Build the aesmsg wire-format ciphertext blob:
# [version_byte][suite_byte][encapsulated_key (32 bytes)][aead_output]
blob = bytes([WIRE_VERSION, SUITE_BYTE]) + encapsulated_key + aead_output

vector = {
    "_comment": (
        "aesmsg interop vector. Regenerated only when the suite, wire format, "
        "or AAD encoding changes. Do not edit by hand."
    ),
    "suite": "X25519-HKDF-SHA256 + HKDF-SHA256 + AES-256-GCM, mode_base",
    "wire_version": WIRE_VERSION,
    "wire_suite_byte": SUITE_BYTE,
    "aad_version": AAD_VERSION,
    "ikm_hex": IKM.hex(),
    "recipient_pubkey_raw_hex": recipient_pubkey_raw.hex(),
    "recipient_privkey_raw_hex": recipient_privkey_raw.hex(),
    "aad_context": {
        "linkId": LINK_ID,
        "createdAtMs": CREATED_AT_MS,
        "expiresAtMs": EXPIRES_AT_MS,
        "maxOpens": MAX_OPENS,
    },
    "aad_encoded_hex": aad.hex(),
    "plaintext_utf8": PLAINTEXT.decode("utf-8"),
    "ciphertext_blob_hex": blob.hex(),
}

out_path = Path(__file__).parent / "vector.json"
out_path.write_text(json.dumps(vector, indent=2) + "\n")
print(f"Wrote {out_path}")


# ─────────────────────────────────────────────────────────────────────────────
# v2-AAD vector. v2 is the DEFAULT AAD for all new links: it drops created_at_ms
# entirely (metadata-leakage mitigation), so the server never has to store it.
# Layout differs from v1 only by omitting the [created_at_ms : u64 BE] field and
# using AAD version byte 0x02. Read by tests/interop/interop-v2.test.ts.
AAD_VERSION_V2 = 0x02
IKM_V2 = bytes([0x43] * 32)
LINK_ID_V2 = "interop-vec2-16b"  # 16-byte ASCII
EXPIRES_AT_MS_V2 = 1700086400000
MAX_OPENS_V2 = 1
PLAINTEXT_V2 = b"hello from v2 interop"

kp_v2 = SUITE.kem.derive_key_pair(IKM_V2)
recipient_pubkey_raw_v2 = kp_v2.public_key.to_public_bytes()
assert len(recipient_pubkey_raw_v2) == 32, recipient_pubkey_raw_v2


def encode_aad_v2(
    link_id: str,
    recipient_pubkey_raw: bytes,
    expires_at_ms: int,
    max_opens: int,
) -> bytes:
    """Mirror of encodeAad() in packages/crypto/src/aad.ts, v2 branch (no created_at_ms)."""
    link_id_bytes = link_id.encode("utf-8")
    assert 0 < len(link_id_bytes) <= 0xFFFF, "linkId length out of range"
    recip_hash = hashlib.sha256(recipient_pubkey_raw).digest()
    assert len(recip_hash) == 32

    out = bytearray()
    out.append(AAD_VERSION_V2)
    out.append(WIRE_VERSION)
    out.append(SUITE_BYTE)
    out += struct.pack(">H", len(link_id_bytes))  # u16 BE
    out += link_id_bytes
    out += recip_hash
    out += struct.pack(">Q", expires_at_ms)  # u64 BE  (no created_at_ms in v2)
    out += struct.pack(">i", max_opens)  # i32 BE
    return bytes(out)


aad_v2 = encode_aad_v2(
    LINK_ID_V2,
    recipient_pubkey_raw_v2,
    EXPIRES_AT_MS_V2,
    MAX_OPENS_V2,
)

encapsulated_key_v2, sender_ctx_v2 = SUITE.create_sender_context(kp_v2.public_key)
aead_output_v2 = sender_ctx_v2.seal(PLAINTEXT_V2, aad=aad_v2)
assert len(encapsulated_key_v2) == 32, encapsulated_key_v2

blob_v2 = bytes([WIRE_VERSION, SUITE_BYTE]) + encapsulated_key_v2 + aead_output_v2

vector_v2 = {
    "_comment": (
        "aesmsg v2-AAD interop vector. Regenerated only when the suite, wire format, "
        "or v2 AAD encoding changes. Do not edit by hand."
    ),
    "suite": "X25519-HKDF-SHA256 + HKDF-SHA256 + AES-256-GCM, mode_base",
    "wire_version": WIRE_VERSION,
    "wire_suite_byte": SUITE_BYTE,
    "aad_version": AAD_VERSION_V2,
    "ikm_hex": IKM_V2.hex(),
    "recipient_pubkey_raw_hex": recipient_pubkey_raw_v2.hex(),
    "aad_context": {
        "linkId": LINK_ID_V2,
        "expiresAtMs": EXPIRES_AT_MS_V2,
        "maxOpens": MAX_OPENS_V2,
    },
    "aad_encoded_hex": aad_v2.hex(),
    "plaintext_utf8": PLAINTEXT_V2.decode("utf-8"),
    "ciphertext_blob_hex": blob_v2.hex(),
}

out_path_v2 = Path(__file__).parent / "vector-v2.json"
out_path_v2.write_text(json.dumps(vector_v2, indent=2) + "\n")
print(f"Wrote {out_path_v2}")
