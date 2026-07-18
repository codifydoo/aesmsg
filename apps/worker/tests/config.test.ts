import { describe, expect, it } from "vitest";
import { loadWorkerConfig } from "../src/config";

describe("loadWorkerConfig", () => {
  it("uses defaults when env is empty", () => {
    const cfg = loadWorkerConfig({});
    expect(cfg.expirySweepIntervalMs).toBe(900_000);
    expect(cfg.sweepRunOnStart).toBe(true);
  });

  it("honors a numeric interval override", () => {
    const cfg = loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "60000" });
    expect(cfg.expirySweepIntervalMs).toBe(60_000);
  });

  it("treats 0 as a valid (disabled) interval", () => {
    const cfg = loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "0" });
    expect(cfg.expirySweepIntervalMs).toBe(0);
  });

  it("falls back to the default for non-numeric or negative intervals", () => {
    expect(loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "abc" }).expirySweepIntervalMs).toBe(
      900_000,
    );
    expect(loadWorkerConfig({ AESMSG_EXPIRY_SWEEP_INTERVAL_MS: "-5" }).expirySweepIntervalMs).toBe(
      900_000,
    );
  });

  it("parses AESMSG_SWEEP_RUN_ON_START=false as false, everything else true", () => {
    expect(loadWorkerConfig({ AESMSG_SWEEP_RUN_ON_START: "false" }).sweepRunOnStart).toBe(false);
    expect(loadWorkerConfig({ AESMSG_SWEEP_RUN_ON_START: "true" }).sweepRunOnStart).toBe(true);
    expect(loadWorkerConfig({ AESMSG_SWEEP_RUN_ON_START: "anything" }).sweepRunOnStart).toBe(true);
  });
});
