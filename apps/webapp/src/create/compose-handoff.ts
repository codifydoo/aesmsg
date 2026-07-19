import type { PickedRecipient } from "@/src/create/compose-contact";

// In-memory, one-shot hand-off for seeding the compose screen with a pre-selected recipient (e.g.
// "Send secure message" off a contact's detail). Module-level memory only — NOTHING is persisted and
// nothing reaches the server; a static-export route change can't pass a rich object through the URL,
// and the contact id must never appear in the address bar as if it were a server pointer. Consumed
// once on ComposeScreen mount, then cleared so a later plain visit to /new starts blank.

let pending: PickedRecipient | null = null;

export function setPendingRecipient(recipient: PickedRecipient): void {
  pending = recipient;
}

/** Return and clear the pending recipient (one-shot). Returns null when nothing was staged. */
export function consumePendingRecipient(): PickedRecipient | null {
  const value = pending;
  pending = null;
  return value;
}

/** Test-only: clear any staged recipient. */
export function __resetPendingRecipientForTests(): void {
  pending = null;
}
