// create-outcome imports the API client for its ApiError / TimeoutError classes; the client reads
// build-time extra via expo-constants, so mock it to keep this node-env test off native modules.
import { describe, expect, it, vi } from "vitest";

vi.mock("expo-constants", () => ({
  default: {
    expoConfig: {
      extra: { aesmsgApiBaseUrl: "https://send.test", aesmsgLinkOrigin: "https://links.test" },
    },
  },
}));

import { ApiError, TimeoutError } from "@/src/api/client";
import { classifyCreateFailure, createFailureMessage } from "@/src/create/create-outcome";

describe("classifyCreateFailure", () => {
  it("classifies an aborted-by-timeout upload as 'timeout'", () => {
    expect(classifyCreateFailure(new TimeoutError())).toBe("timeout");
  });

  it("classifies a non-2xx server answer (ApiError) as 'error'", () => {
    expect(classifyCreateFailure(new ApiError(500))).toBe("error");
    expect(classifyCreateFailure(new ApiError(429))).toBe("error");
  });

  it("classifies a transport failure (fetch TypeError / anything else) as 'network'", () => {
    expect(classifyCreateFailure(new TypeError("Network request failed"))).toBe("network");
    expect(classifyCreateFailure(new Error("boom"))).toBe("network");
    expect(classifyCreateFailure(undefined)).toBe("network");
  });
});

describe("createFailureMessage", () => {
  it("always states the message was NOT sent so the sender knows to retry", () => {
    for (const err of [new TimeoutError(), new ApiError(500), new TypeError("x")]) {
      expect(createFailureMessage(err).toLowerCase()).toContain("try again");
    }
  });

  it("uses a timeout-specific message when the upload stalled", () => {
    expect(createFailureMessage(new TimeoutError())).toMatch(/timed out/i);
  });

  it("uses a connectivity message on a transport failure", () => {
    expect(createFailureMessage(new TypeError("Network request failed"))).toMatch(
      /couldn't reach/i,
    );
  });
});
