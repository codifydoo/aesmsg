# aesmsg data-subject / erasure runbook

A concise **operator + user** guide for handling data-subject requests (DSRs) — access,
erasure ("right to be forgotten"), and similar — for aesmsg's account-less, zero-knowledge
service.

This is the operator + user runbook behind the `info@codify.hr` contact named in the
[privacy policy](../apps/web/src/privacy/PrivacyContent.tsx). It reconciles the *mechanics*
of erasure with what the policy already says; it **changes no policy and no code**. The
guiding principle: the policy does not overpromise, so this is a short runbook reconciling
the mechanics.

> **Copy discipline (same as [security-model.md](./security-model.md)).** Never claim
> "unbreakable", "impossible to hack", or "military-grade". Describe bounded, honest
> guarantees. Where a detail is uncertain, describe it conservatively and cite the source.

---

## 1. What personal data aesmsg actually holds

**Essentially none that identifies a natural person.** aesmsg has **no user accounts**, no
analytics, and no profiles. The backend (`apps/api` over
[`@aesmsg/server-store`](../packages/server-store)) stores only ciphertext plus minimal,
non-identifying operational metadata.

Per-link metadata columns (the `links` table — see
[`packages/server-store/migrations/0001_init.sql`](../packages/server-store/migrations/0001_init.sql)
and the reads in
[`packages/server-store/src/pg/link-metadata-store.ts`](../packages/server-store/src/pg/link-metadata-store.ts)):

| Stored | Column | Not identifying because |
|---|---|---|
| Link id | `id` | A random 16-char opaque token; not derived from any user attribute. |
| Status | `status` | `active` / `revoked` / `expired`. |
| Expiry | `expires_at` | The self-destruct time the sender chose. |
| Max opens | `max_opens` | The open cap the sender chose (`-1` = unlimited). |
| Opens count | `opens_count` | How many opens have been served. |
| Terminal timestamp | `terminal_at` | When the row went terminal (drives the retention prune). |
| Ciphertext | `link_ciphertexts.blob` (+ `size`) | Opaque, sealed to the recipient's key; unreadable to the server. |

What is **deliberately not there**:

- **No plaintext, no private keys, no message previews, no filenames/mimetypes** — those live
  *inside* the AEAD-sealed envelope and never reach the server
  ([security-model.md §1.4](./security-model.md)).
- **No `recipient_fp`.** The recipient-fingerprint column was **dropped** precisely so a
  leaked DB could not `GROUP BY` it to rebuild a recipient social graph — see
  [`0002_drop_recipient_fp_and_nullable_createdat.sql`](../packages/server-store/migrations/0002_drop_recipient_fp_and_nullable_createdat.sql).
- **No creation timestamp for current (v2) links.** `created_at` was made nullable and its
  default dropped; new links store `NULL` (same migration 0002).
- **No raw IP addresses.** IPs are **HMAC-hashed with a server salt for rate-limiting only**
  and are never stored in a reversible form — see the "Connection and abuse-prevention data"
  section of the [privacy policy](../apps/web/src/privacy/PrivacyContent.tsx). (The hosting
  provider may keep standard server logs for a limited period, as the policy states.)

### GDPR Article 11 posture (state this honestly)

Because there are no accounts and the stored metadata is non-identifying, the operator
**cannot identify a natural person from what it stores** and therefore **cannot map a
"give me / erase all data about person X" request to specific rows.** Under **GDPR Article 11**,
a controller that does not need to identify data subjects is **not obliged to acquire
additional identifying information** solely to service such a request. aesmsg deliberately
avoids collecting that identifying data — being forced to acquire it would defeat the
zero-knowledge design. The privacy policy already takes exactly this (defensible) position;
this runbook does not extend or soften it.

---

## 2. Self-service erasure — the primary path

For an account-less product, **most "erasure" is user-driven and immediate.** A user does not
need to email anyone; they act directly from the app and their device:

- **Revoke a link → ciphertext purged transactionally.** Revoking in-app removes the
  ciphertext blob and marks the row terminal in one transaction (`revoke()` in
  [`pg/link-metadata-store.ts`](../packages/server-store/src/pg/link-metadata-store.ts)).
  This is the fastest, most complete erasure of a specific piece of content.
- **Wipe device identity → local keys and on-device data removed.** Wiping the identity
  removes the private keys, contacts, link list, and settings that never left the device
  (the "Data that stays on your device" section of the
  [privacy policy](../apps/web/src/privacy/PrivacyContent.tsx)).
- **Auto-purge on expiry / last open.** Ciphertext is also purged automatically when a link
  reaches its expiry or its final allowed open (see §6). The user chose those limits at
  creation time, so this is erasure they scheduled up front.

> **Known nuance (not solved by this doc).** A local-only identity wipe removes the link ids
> from the device, so afterwards the user can no longer *revoke* links that are still live
> server-side. That copy-vs-mechanics gap is tracked separately as **PG-14 / roadmap 1.10**
> and is out of scope for this runbook. If a user wants server-side content gone, they should
> **revoke first, then wipe.**

---

## 3. Operator-assisted erasure — for a specific reported link id

When erasure is legally mandated or a link is reported (abuse / CSAM / legal order) and names
a **specific link id**, the operator purges exactly that id with the documented CLI (full
procedure in the [ops runbook §3](./ops-runbook.md#3-purge-a-reported-link-id-abuse--csam--legal)):

```bash
DATABASE_URL=postgres://…  pnpm --filter @aesmsg/server-store purge <link-id>
```

- The 16-char `<id>` is the part after `/l/` in `https://aesmsg.com/l/<id>`.
- It **purges the ciphertext and marks the row terminal** (`status = revoked`, `terminal_at`
  stamped) in one transaction — the operator override that does **not** require the user's
  revocation token (`purgeLink` →
  [`admin/purge.ts`](../packages/server-store/src/admin/purge.ts), CLI in
  [`admin/purge-cli.ts`](../packages/server-store/src/admin/purge-cli.ts)).
- It is **idempotent** and **fails closed** without `DATABASE_URL` (it will not touch a
  phantom in-memory store).

**Without a specific id, the operator cannot locate a user's data.** By design there is no
"search by person", no "list this user's links", and no recipient index to pivot on. A DSR
that does not supply a link id the requester controls cannot be resolved into rows — this is
the Article 11 posture from §1, in practice.

---

## 4. What the operator CANNOT erase, and why

Be honest with requesters about these boundaries — they follow directly from the architecture,
not from unwillingness:

- **Plaintext already decrypted on a recipient's device.** Once opened, the content lives on
  the recipient's device and is the user's responsibility. The client mitigates leakage
  (clipboard auto-clear, background blur, screenshot blocking where the platform allows,
  biometric-gated opens) but the server never held that plaintext and cannot reach it
  ([security-model.md §3](./security-model.md)).
- **Copies the user shared through their transport channel.** The link (and any content the
  recipient re-shared) may live in Slack / WhatsApp / email / SMS threads. aesmsg never
  controlled those channels; erasure there is a request to *that* provider.
- **The recipient's own device and their retained key material.** The operator has no access
  to endpoint devices.
- **Ciphertext an adversary already captured while a link was live.** aesmsg does **not**
  provide forward secrecy; purging the server copy cannot un-capture bytes an attacker already
  holds ([security-model.md §2](./security-model.md)). This is a security boundary, not an
  erasure a DSR can force.

---

## 5. Responding to a DSR email (`info@codify.hr`) — operator checklist

1. **Acknowledge** the request promptly and record the date received.
2. **Explain the posture honestly:** aesmsg is account-less and zero-knowledge; the backend
   holds no personal data that identifies a natural person — only opaque ciphertext and the
   minimal non-identifying metadata in §1. Cite **GDPR Article 11**: without additional
   identifying information (which aesmsg deliberately does not collect) a "all data about me"
   request cannot be mapped to specific rows.
3. **Point to self-service (the fastest route):** the user can **revoke** the specific link(s)
   to purge ciphertext immediately, and **wipe device identity** to remove local keys/data —
   advising **revoke before wipe** (§2).
4. **Offer id-specific purge:** if the request concerns a **specific link the requester
   controls or has legitimate grounds to report**, ask them to provide the **link id** (the
   `/l/<id>` value). With that id the operator can run the purge in §3.
5. **State the boundaries** from §4 plainly: already-decrypted plaintext, copies in the
   transport channel, and the recipient's device are outside what the operator can erase.
6. **Reference the [privacy policy](../apps/web/src/privacy/PrivacyContent.tsx)** for the
   user's statutory rights and the supervisory-authority contact (Croatia: AZOP), and close
   the loop within the applicable statutory timeframe.

> Do **not** ask a requester to supply identifying data the service otherwise avoids just to
> "verify" them for a request the architecture cannot service anyway. Article 11 exists to
> prevent exactly that. Verification is appropriate only where the requester is asserting
> control over a **specific link id** and an id-scoped purge would act on it.

---

## 6. Retention summary

**Ciphertext** is purged the moment a link goes terminal, on any of three triggers:

| Trigger | Mechanism | Source |
|---|---|---|
| **Revoke** (user or operator) | Transactional: blob deleted + row marked terminal | `revoke()` / `adminPurge` in [`pg/link-metadata-store.ts`](../packages/server-store/src/pg/link-metadata-store.ts) |
| **Last allowed open** | Atomic open-consume-and-purge (bounded links flip to `expired` on the final open) | `open()` CTE in [`pg/link-metadata-store.ts`](../packages/server-store/src/pg/link-metadata-store.ts) |
| **Expiry** | Background sweep marks past-due rows terminal and deletes their blobs | `expirePastDue()` in [`pg/link-metadata-store.ts`](../packages/server-store/src/pg/link-metadata-store.ts), driven by [`apps/worker`](../apps/worker/src/jobs/expiry-sweep.ts) |

The expiry sweep is run on a schedule by `apps/worker` (default every **15 minutes**,
`AESMSG_EXPIRY_SWEEP_INTERVAL_MS` — [`apps/worker/src/config.ts`](../apps/worker/src/config.ts)),
so expired ciphertext is purged shortly after expiry rather than at the exact instant.

**Active-link retention is itself bounded by a global ceiling.** Every link has a self-destruct
expiry chosen by the sender, but the API also **rejects** (opaque `400`) any create whose lifetime
exceeds a global ceiling — **default 365 days**, configurable via **`AESMSG_MAX_RETENTION_MS`**
(plus a small clock-skew grace). No link — free or Pro — can therefore live on the server longer
than that ceiling before it expires and its ciphertext is purged. (The server rejects rather than
clamps, because the expiry is bound into the message's HPKE AAD; see
[security-model.md §2.1](./security-model.md#21-mitigations-that-bound-the-exposure-but-are-not-forward-secrecy).)

**Terminal metadata rows** (the empty `revoked` / `expired` records kept only so a just-closed
link answers "gone" rather than "never existed") are pruned once older than a retention window:

- **Default ~30 days**, configurable via **`AESMSG_TERMINAL_ROW_RETENTION_MS`** — see
  [`packages/server-store/src/retention.ts`](../packages/server-store/src/retention.ts)
  (`DEFAULT_TERMINAL_ROW_RETENTION_MS = 30 * 24 * 60 * 60 * 1000`; a non-numeric or negative
  value falls back to the default).
- The prune is folded into the same worker sweep (`pruneTerminal()` in the pg store), so no
  separate job or call is needed. After the prune, a purged id reports "no row found" from the
  purge CLI.

---

## Related

- [Privacy policy](../apps/web/src/privacy/PrivacyContent.tsx) — the public-facing statement
  and the `info@codify.hr` contact this runbook backs.
- [ops-runbook.md](./ops-runbook.md) — the operator abuse/legal purge procedure (§3) and the
  metrics surface.
- [security-model.md](./security-model.md) — what data exists, where, and the honest
  boundaries (no forward secrecy, endpoint compromise, transport channel).
