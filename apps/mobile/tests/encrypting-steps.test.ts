import { describe, expect, it } from "vitest";
import {
  ENCRYPTING_PHASES,
  encryptingHeading,
  encryptingSteps,
} from "@/src/create/encrypting-steps";

describe("encryptingSteps", () => {
  it("orders the pipeline phases as the real observed boundaries", () => {
    // HONEST phases only: prepare → encrypt → upload. There is no separate "creating link" step,
    // because the upload POST mints the link server-side in the same round-trip — a step that could
    // never go active would be theatrical.
    expect(ENCRYPTING_PHASES).toEqual(["prepare", "encrypt", "upload"]);
  });

  it("marks phases before active done, active active, the rest pending", () => {
    const steps = encryptingSteps("upload");
    expect(steps.map((s) => s.status)).toEqual(["done", "done", "active"]);
  });

  it("first phase: nothing done yet", () => {
    expect(encryptingSteps("prepare").map((s) => s.status)).toEqual([
      "active",
      "pending",
      "pending",
    ]);
  });

  it("middle phase: only the first is done", () => {
    expect(encryptingSteps("encrypt").map((s) => s.status)).toEqual(["done", "active", "pending"]);
  });

  it("upload is never shown active before the upload phase (honesty guard)", () => {
    // During prepare/encrypt the upload step must read pending — never active — so the UI never
    // claims to be uploading before the upload actually starts.
    for (const phase of ["prepare", "encrypt"] as const) {
      const upload = encryptingSteps(phase).find((s) => s.phase === "upload");
      expect(upload?.status).toBe("pending");
    }
  });

  it("always returns exactly one active step", () => {
    for (const phase of ENCRYPTING_PHASES) {
      const active = encryptingSteps(phase).filter((s) => s.status === "active");
      expect(active).toHaveLength(1);
    }
  });

  it("heading is the active phase's label", () => {
    expect(encryptingHeading("prepare")).toBe("Preparing message");
    expect(encryptingHeading("encrypt")).toBe("Encrypting locally");
    expect(encryptingHeading("upload")).toBe("Uploading ciphertext");
  });
});
