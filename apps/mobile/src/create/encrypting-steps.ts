// Pure logic: the step list for the Encrypting Progress screen (16 · grp-create.jsx · S_Encrypting).
//
// HONEST PHASES ONLY. The seal pipeline has three phases create-and-seal.ts can actually observe and
// emit (via its onPhase callback), in execution order: prepare the payload → encrypt locally →
// upload the ciphertext. The upload POST both uploads the ciphertext AND mints the link server-side
// in one round-trip, so there is no separately-observable "creating link" phase — showing one would
// be theatrical (a step that never goes active). create-and-seal fires onPhase("upload") only once
// the upload actually starts, so "Uploading ciphertext" is never shown before the upload is running.
// Extracting the derivation keeps the .tsx presentational and lets it be unit-tested. No
// crypto/network here — just labelling.

export type StepStatus = "done" | "active" | "pending";

/** The pipeline phases shown to the user, in execution order. Each is a real, observed boundary. */
export const ENCRYPTING_PHASES = ["prepare", "encrypt", "upload"] as const;
export type EncryptingPhase = (typeof ENCRYPTING_PHASES)[number];

export interface EncryptingStep {
  phase: EncryptingPhase;
  label: string;
  status: StepStatus;
}

const LABELS: Record<EncryptingPhase, string> = {
  prepare: "Preparing message",
  encrypt: "Encrypting locally",
  upload: "Uploading ciphertext",
};

/**
 * Derive the step list for a given active phase: every phase before `active` is "done", `active`
 * itself is "active", and everything after is "pending". Total over EncryptingPhase.
 */
export function encryptingSteps(active: EncryptingPhase): EncryptingStep[] {
  const activeIndex = ENCRYPTING_PHASES.indexOf(active);
  return ENCRYPTING_PHASES.map((phase, i) => ({
    phase,
    label: LABELS[phase],
    status: i < activeIndex ? "done" : i === activeIndex ? "active" : "pending",
  }));
}

/** The heading shown above the step list — the active step's label. */
export function encryptingHeading(active: EncryptingPhase): string {
  return LABELS[active];
}
