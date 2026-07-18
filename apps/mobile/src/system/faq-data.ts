// Help / FAQ content + pure filtering, extracted (node-env testable) so the .tsx screen stays thin
// & presentational, per the apps/mobile test convention.
//
// The answers reinforce the product's security model in calm support copy — never the forbidden
// "unbreakable / military-grade / impossible to hack" phrasing, and never implying server-side
// trust. The "lost key" answer states the no-recovery reality plainly: forgetting the passphrase or
// wiping the device key is irreversible, by design. No false reassurance.
//
// FOLLOW-UP (tracked): content is hand-authored sample copy seeded from the design's S_Help rows;
// real help content + a "Contact support" route arrive with the support slice.

export interface FaqItem {
  id: string;
  /** Section the item belongs to (drives the grouped, labelled list). */
  section: string;
  question: string;
  answer: string;
}

// First two seeded from the design's S_Help samples verbatim; the rest expand the same calm,
// security-reinforcing voice. Grouped under section labels the screen renders in declared order.
export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "what-is-a-secure-link",
    section: "Getting started",
    question: "What is a secure link?",
    answer:
      "A link is just a pointer. Without the recipient's private key it can't be opened, so it's " +
      "safe to paste into Slack, email, or any chat app — the channel only ever carries ciphertext.",
  },
  {
    id: "where-are-keys-stored",
    section: "Getting started",
    question: "Where are my private keys stored?",
    answer:
      "Your private keys stay on this device, in the secure enclave. They never leave it and are " +
      "never uploaded — not even in an encrypted backup, unless you explicitly export one.",
  },
  {
    id: "can-aesmsg-read-messages",
    section: "Privacy",
    question: "Can aesmsg read my messages?",
    answer:
      "No. Everything is end-to-end encrypted on your device before it's sent. The zero-knowledge " +
      "backend only ever holds ciphertext — it can't read your messages, and neither can we.",
  },
  {
    id: "what-the-server-stores",
    section: "Privacy",
    question: "What does the server actually store?",
    answer:
      "Only what's needed to deliver a pointer: a message id, the ciphertext, when it was created, " +
      "its expiry, and how many opens are left. No plaintext, no private keys, no previews.",
  },
  {
    id: "lost-key",
    section: "Keys & recovery",
    question: "What happens if I lose my key?",
    answer:
      "If you forget your passphrase or wipe this device's key, messages encrypted to it can't be " +
      "recovered — by anyone, including us. There's no backdoor. This is the trade-off that keeps " +
      "your messages private, so keep a backup if you need one.",
  },
  {
    id: "verify-a-contact",
    section: "Keys & recovery",
    question: "How do I verify a contact?",
    answer:
      "Compare their fingerprint out of band — read it aloud or scan their QR code. Matching " +
      "fingerprints confirm you're encrypting to the right key, which defeats an impostor in the " +
      "middle. If a contact's key later changes, verify the new fingerprint before sending again.",
  },
];

// ── Filtering ────────────────────────────────────────────────────────────────

/**
 * Case- and whitespace-insensitive filter over question + answer text. An empty / whitespace-only
 * query returns every item unchanged (so the list shows everything by default). Matching is a simple
 * substring contains on the lower-cased query, which is all the presentational search needs.
 */
export function filterFaq(items: FaqItem[], query: string): FaqItem[] {
  const q = query.trim().toLowerCase();
  if (q === "") return items;
  return items.filter(
    (i) => i.question.toLowerCase().includes(q) || i.answer.toLowerCase().includes(q),
  );
}

/**
 * Group items into ordered sections for the labelled list. Section order follows first appearance in
 * `items` (matching the curated order above); items keep their relative order within a section.
 */
export interface FaqSection {
  section: string;
  items: FaqItem[];
}

export function groupFaq(items: FaqItem[]): FaqSection[] {
  const order: string[] = [];
  const bySection = new Map<string, FaqItem[]>();
  for (const item of items) {
    if (!bySection.has(item.section)) {
      bySection.set(item.section, []);
      order.push(item.section);
    }
    bySection.get(item.section)?.push(item);
  }
  return order.map((section) => ({ section, items: bySection.get(section) ?? [] }));
}
