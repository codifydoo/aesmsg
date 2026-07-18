import { InvalidFormatError } from "./errors";
import { targetPaddedLen } from "./pad";

// A aesmsg message payload bundles the text body and any file attachments into a
// single plaintext envelope that is sealed with one seal() call. Filenames and mimetypes
// live INSIDE this envelope, so they are encrypted alongside the bytes and never leak to
// the server. The whole envelope is covered by the same AEAD tag + MessageBindingContext
// AAD, so attachments inherit the existing tamper-resistance for free.
//
// Wire layout (all integers big-endian):
//   u8  PAYLOAD_VERSION (0x02; 0x01 = legacy, no pad trailer)
//   u32 textLen
//   ..  text bytes        (UTF-8 message body; may be zero-length)
//   u16 attachmentCount
//   repeated attachmentCount times:
//     u16 nameLen
//     ..  name bytes       (UTF-8 filename, basename only)
//     u16 mimeLen
//     ..  mime bytes       (UTF-8 mimetype, e.g. "application/octet-stream")
//     u32 contentLen
//     ..  content bytes    (raw file bytes)
//   --- v0x02 only: length-hiding pad trailer ---
//   u32 padLen
//   ..  padLen zero bytes
//
// The pad trailer lives INSIDE the AEAD-sealed plaintext, so it is encrypted and invisible to
// the server; it rounds the whole envelope up to a fixed bucket (see pad.ts) so the stored
// ciphertext length no longer reveals the plaintext length. v0x01 envelopes (pre-attachment-
// padding) carry no trailer and are still decoded for backward compatibility.
export const PAYLOAD_VERSION = 0x02;
const PAYLOAD_VERSION_V1 = 0x01;

const U16_MAX = 0xffff;
const U32_MAX = 0xffffffff;
const PAD_LEN_FIELD_BYTES = 4;

export interface PayloadAttachment {
  readonly filename: string;
  readonly mimetype: string;
  readonly bytes: Uint8Array;
}

export interface Payload {
  readonly text: string;
  readonly attachments: PayloadAttachment[];
}

function writeU8(view: DataView, offset: number, value: number): number {
  view.setUint8(offset, value);
  return offset + 1;
}

function writeU16BE(view: DataView, offset: number, value: number): number {
  view.setUint16(offset, value, false);
  return offset + 2;
}

function writeU32BE(view: DataView, offset: number, value: number): number {
  view.setUint32(offset, value, false);
  return offset + 4;
}

function writeBytes(out: Uint8Array, offset: number, bytes: Uint8Array): number {
  out.set(bytes, offset);
  return offset + bytes.length;
}

interface EncodedField {
  readonly nameBytes: Uint8Array;
  readonly mimeBytes: Uint8Array;
  readonly content: Uint8Array;
}

export function encodePayload(payload: Payload): Uint8Array {
  const enc = new TextEncoder();
  const textBytes = enc.encode(payload.text);
  if (textBytes.length > U32_MAX) {
    throw new InvalidFormatError("encodePayload: text exceeds u32 length");
  }
  if (payload.attachments.length > U16_MAX) {
    throw new InvalidFormatError("encodePayload: too many attachments");
  }

  const fields: EncodedField[] = payload.attachments.map((att) => {
    const nameBytes = enc.encode(att.filename);
    const mimeBytes = enc.encode(att.mimetype);
    if (nameBytes.length > U16_MAX) {
      throw new InvalidFormatError("encodePayload: filename exceeds u16 length");
    }
    if (mimeBytes.length > U16_MAX) {
      throw new InvalidFormatError("encodePayload: mimetype exceeds u16 length");
    }
    if (att.bytes.length > U32_MAX) {
      throw new InvalidFormatError("encodePayload: attachment exceeds u32 length");
    }
    return { nameBytes, mimeBytes, content: att.bytes };
  });

  let bodyLen = 1 + 4 + textBytes.length + 2;
  for (const f of fields) {
    bodyLen += 2 + f.nameBytes.length + 2 + f.mimeBytes.length + 4 + f.content.length;
  }

  // Bucket on the trailer-INCLUSIVE minimum length so padLen is always >= 0: the smallest
  // frame we can emit is `bodyLen + the 4-byte padLen field`, so we pick the bucket for that
  // and the difference becomes the zero-pad count. (Bucketing on bodyLen alone would underflow
  // to a negative padLen for any body within 4 bytes at/below a bucket edge.)
  const minLen = bodyLen + PAD_LEN_FIELD_BYTES;
  const total = targetPaddedLen(minLen);
  const padLen = total - minLen;
  if (padLen < 0 || padLen > U32_MAX) {
    throw new Error("encodePayload: internal pad length out of range");
  }

  const out = new Uint8Array(total);
  const view = new DataView(out.buffer);
  let off = 0;
  off = writeU8(view, off, PAYLOAD_VERSION);
  off = writeU32BE(view, off, textBytes.length);
  off = writeBytes(out, off, textBytes);
  off = writeU16BE(view, off, fields.length);
  for (const f of fields) {
    off = writeU16BE(view, off, f.nameBytes.length);
    off = writeBytes(out, off, f.nameBytes);
    off = writeU16BE(view, off, f.mimeBytes.length);
    off = writeBytes(out, off, f.mimeBytes);
    off = writeU32BE(view, off, f.content.length);
    off = writeBytes(out, off, f.content);
  }
  // Pad trailer: u32 padLen + padLen zero bytes (the Uint8Array is already zero-filled).
  off = writeU32BE(view, off, padLen);
  off += padLen;

  if (off !== total) {
    throw new Error("encodePayload: internal offset mismatch");
  }
  return out;
}

// Strictly parse an envelope. Throws InvalidFormatError on a wrong version byte, any
// out-of-bounds length, or trailing bytes. decodePayload() uses this and falls back to
// legacy-text on failure.
function decodeStrict(bytes: Uint8Array): Payload {
  const version = bytes.length >= 1 ? bytes[0] : undefined;
  if (version !== PAYLOAD_VERSION && version !== PAYLOAD_VERSION_V1) {
    throw new InvalidFormatError("decodePayload: unknown payload version");
  }
  const hasPadTrailer = version === PAYLOAD_VERSION;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const dec = new TextDecoder();
  let off = 1;

  const need = (n: number): void => {
    if (off + n > bytes.length) {
      throw new InvalidFormatError("decodePayload: truncated payload");
    }
  };

  need(4);
  const textLen = view.getUint32(off, false);
  off += 4;
  need(textLen);
  const text = dec.decode(bytes.subarray(off, off + textLen));
  off += textLen;

  need(2);
  const attCount = view.getUint16(off, false);
  off += 2;

  const attachments: PayloadAttachment[] = [];
  for (let i = 0; i < attCount; i++) {
    need(2);
    const nameLen = view.getUint16(off, false);
    off += 2;
    need(nameLen);
    const filename = dec.decode(bytes.subarray(off, off + nameLen));
    off += nameLen;

    need(2);
    const mimeLen = view.getUint16(off, false);
    off += 2;
    need(mimeLen);
    const mimetype = dec.decode(bytes.subarray(off, off + mimeLen));
    off += mimeLen;

    need(4);
    const contentLen = view.getUint32(off, false);
    off += 4;
    need(contentLen);
    const content = bytes.slice(off, off + contentLen);
    off += contentLen;

    attachments.push({ filename, mimetype, bytes: content });
  }

  if (hasPadTrailer) {
    // v0x02: u32 padLen followed by padLen pad bytes. Bounds-checked like every other field so
    // a malformed trailer raises InvalidFormatError (caught by decodePayload's legacy fallback)
    // rather than an out-of-range read. Pad bytes are not required to be zero on read — the
    // whole envelope is already AEAD-authenticated — but they must be present.
    need(4);
    const padLen = view.getUint32(off, false);
    off += 4;
    need(padLen);
    off += padLen;
  }

  if (off !== bytes.length) {
    throw new InvalidFormatError("decodePayload: trailing bytes after payload");
  }
  return { text, attachments };
}

export function decodePayload(bytes: Uint8Array): Payload {
  try {
    return decodeStrict(bytes);
  } catch {
    // Legacy fallback: Phase 1 messages were raw UTF-8 with no envelope. Because seal/open
    // authenticate the plaintext, decodePayload only ever sees an authentic blob here —
    // either a real envelope (parsed above) or legacy text (version byte != 0x01) — so the
    // fallback keeps pre-attachment links readable without weakening any security property.
    return { text: new TextDecoder().decode(bytes), attachments: [] };
  }
}
