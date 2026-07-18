// Pure logic: classify a failed create/seal attempt into an honest, user-actionable outcome and its
// message. Keeps CreateFlow's catch branch thin and unit-testable, and guarantees the copy stays
// calm and truthful — every failure states that the message was NOT sent (so the sender knows to
// retry, and never wrongly believes a link is live).
//
// User-initiated CANCEL is handled by CreateFlow itself (it knows it aborted) and never reaches this
// classifier — a cancel returns to the preserved draft with no error at all.

import { ApiError, TimeoutError } from "@/src/api/client";

export type CreateFailure = "timeout" | "network" | "error";

/**
 * Map a thrown error to a failure kind:
 *   - TimeoutError → the upload stalled and we aborted it;
 *   - ApiError → the server answered non-2xx (bad request, rate limit, server error);
 *   - anything else (fetch TypeError, an AbortError we didn't classify, …) → treated as a transient
 *     network/connectivity failure from the user's point of view.
 */
export function classifyCreateFailure(err: unknown): CreateFailure {
  if (err instanceof TimeoutError) return "timeout";
  if (err instanceof ApiError) return "error";
  return "network";
}

const MESSAGES: Record<CreateFailure, string> = {
  timeout: "Upload timed out. Your message wasn't sent — check your connection and try again.",
  network:
    "Couldn't reach the server. Your message wasn't sent — check your connection and try again.",
  error: "Could not create the secure link. Your message wasn't sent — please try again.",
};

/** The inline, opaque failure notice for a failed create attempt (shown back on the compose draft). */
export function createFailureMessage(err: unknown): string {
  return MESSAGES[classifyCreateFailure(err)];
}
