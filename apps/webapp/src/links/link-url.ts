// FALLBACK ONLY. The authoritative shareable link is the server-returned `url` stored on each
// sent-link record (SentLinkRecord.url) at create time — the links list/details copy affordances
// prefer that. This reconstruction exists solely for LEGACY records written before the `url` field
// existed (they carry no stored url), where we rebuild the canonical `aesmsg.com/l/<id>` shape.
//
// INVARIANT: SECURE_LINK_ORIGIN MUST match the API's AESMSG_PUBLIC_LINK_ORIGIN default
// ("https://aesmsg.com", the STATIC bouncer host — never app.aesmsg.com). If an operator overrides
// AESMSG_PUBLIC_LINK_ORIGIN on the server, this constant can no longer reproduce that origin — which
// is exactly why fresh records persist the server-returned url and only fall back here. SP2
// introduces no new webapp env.
export const SECURE_LINK_ORIGIN = "https://aesmsg.com";

export function secureLinkUrl(id: string): string {
  return `${SECURE_LINK_ORIGIN}/l/${id}`;
}
