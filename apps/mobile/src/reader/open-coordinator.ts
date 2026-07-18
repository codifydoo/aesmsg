import type { OpenMessageResponse } from "@/src/api/client";

// The reader "open session" coordinator (FE-2 / R7).
//
// PROBLEM: POST /api/messages/:id/open CONSUMES one of a link's limited opens (a view-once link is
// DESTROYED after a single open). The recipient flow used to re-issue that POST on three benign
// paths a legitimate recipient never meant to spend an open on:
//   1. a double-tap on "Open message"   → two POSTs → two opens (view-once lost),
//   2. a wrong-key "Try again"          → another POST every tap (no wrong key ever becomes right),
//   3. a remount after the OS backgrounded the app mid-open (biometric prompt, phone call, app
//      switcher) → the reader unmounted, then re-mounted → landing → the user taps Open → a SECOND
//      open (on a view-once link the second POST 410s and the message is permanently gone).
//
// This coordinator makes the open EXACTLY ONCE per intended read. It is deliberately module-level
// (a singleton, below), so it OUTLIVES ReaderFlow's unmount — the whole point: an app-background /
// auto-lock that tears down the reader must not drop the already-fetched open. On resume the flow
// reads the HELD response and decrypts it locally without a second POST.
//
// SECURITY: it holds only the OPAQUE ciphertext + non-secret open metadata (OpenMessageResponse) —
// NEVER decrypted plaintext, NEVER the private key. Ciphertext is inert without the recipient's
// private key, so retaining it across a background lock leaks nothing; the plaintext is re-derived
// locally on resume and is dropped again the instant the identity locks.

export type OpenPhase = "idle" | "in-flight" | "held";

// A non-consuming snapshot of the current session.
export interface OpenSnapshot {
  phase: OpenPhase;
  /** Present iff phase === "held": the fetched ciphertext + open metadata to decrypt locally. */
  response?: OpenMessageResponse;
  /** Present iff phase === "in-flight": the shared POST promise a remount can join (no second POST). */
  promise?: Promise<OpenMessageResponse>;
}

// What begin() tells the caller to do. Crucially there is NO variant that lets a caller issue a
// second POST for an id that is already opening or already held.
export type BeginResult =
  // A new /open POST was just issued; THIS call owns it. Await `promise`.
  | { kind: "started"; promise: Promise<OpenMessageResponse> }
  // An /open POST for this id is already in flight (double-tap, or a remount landing on it); this
  // call JOINED it — no second POST. Await the same `promise`.
  | { kind: "joined"; promise: Promise<OpenMessageResponse> }
  // The open already completed; reuse the held ciphertext — no POST at all.
  | { kind: "held"; response: OpenMessageResponse };

export interface OpenCoordinator {
  /** Non-consuming snapshot of the session for `id`, or null if there is none. */
  peek(id: string): OpenSnapshot | null;
  /**
   * Ensure AT MOST ONE /open POST is issued for `id`. `run` is the POST thunk; it is invoked ONLY on
   * the idle→in-flight transition. A double-tap or a remount-while-in-flight JOINS the existing
   * promise; a completed session returns the HELD response. Opening a different id supersedes the
   * prior session first.
   */
  begin(id: string, run: () => Promise<OpenMessageResponse>): BeginResult;
  /** Forget the session for `id` (call when the reader is dismissed). No-op if `id` isn't current. */
  clear(id: string): void;
}

interface Session {
  id: string;
  phase: OpenPhase;
  response?: OpenMessageResponse;
  promise?: Promise<OpenMessageResponse>;
}

// Factory so tests get a fresh, isolated instance (DI convention); production uses the singleton.
export function createOpenCoordinator(): OpenCoordinator {
  // At most one active session — the reader opens one deep-linked id at a time.
  let current: Session | null = null;

  const peek: OpenCoordinator["peek"] = (id) => {
    if (!current || current.id !== id) return null;
    const snap: OpenSnapshot = { phase: current.phase };
    if (current.response !== undefined) snap.response = current.response;
    if (current.promise !== undefined) snap.promise = current.promise;
    return snap;
  };

  const begin: OpenCoordinator["begin"] = (id, run) => {
    // A different link supersedes any prior session (its held ciphertext is no longer relevant).
    if (current && current.id !== id) current = null;

    if (current) {
      if (current.phase === "held" && current.response) {
        return { kind: "held", response: current.response };
      }
      if (current.phase === "in-flight" && current.promise) {
        // Double-tap or a remount joining the same POST — DO NOT run() again.
        return { kind: "joined", promise: current.promise };
      }
    }

    // idle → in-flight: issue EXACTLY ONE POST and wire its settlement into the session, so the
    // result is HELD even if the caller (a soon-to-unmount ReaderFlow) never awaits it.
    const session: Session = { id, phase: "in-flight" };
    current = session;
    const promise = run().then(
      (response) => {
        // Record only if this session is still the active one (not superseded / cleared meanwhile).
        if (current === session) {
          session.phase = "held";
          session.response = response;
        }
        return response;
      },
      (err) => {
        // The POST failed (transport / 4xx / 5xx): nothing is held. Reset to idle so a legitimate
        // retry (e.g. from the Network-error terminal) can re-attempt a fresh open.
        if (current === session) current = null;
        throw err;
      },
    );
    session.promise = promise;
    return { kind: "started", promise };
  };

  const clear: OpenCoordinator["clear"] = (id) => {
    if (current && current.id === id) current = null;
  };

  return { peek, begin, clear };
}

// Production singleton — module-level so it survives ReaderFlow unmount (an app-background / lock
// unmounts the reader; this keeps the fetched open alive so resume costs no second open).
export const openCoordinator = createOpenCoordinator();
