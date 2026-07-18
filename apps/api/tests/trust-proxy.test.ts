import { describe, expect, it } from "vitest";
import { resolveTrustProxy } from "../src/lib/trust-proxy";

describe("resolveTrustProxy", () => {
  it("defaults to false when unset (use the socket address; ignore X-Forwarded-For)", () => {
    expect(resolveTrustProxy(undefined)).toBe(false);
    expect(resolveTrustProxy("")).toBe(false);
    expect(resolveTrustProxy("   ")).toBe(false);
  });

  it('treats "false" (any case) as false', () => {
    expect(resolveTrustProxy("false")).toBe(false);
    expect(resolveTrustProxy("False")).toBe(false);
    expect(resolveTrustProxy(" FALSE ")).toBe(false);
  });

  it('treats "true" (any case) as true', () => {
    expect(resolveTrustProxy("true")).toBe(true);
    expect(resolveTrustProxy(" True ")).toBe(true);
  });

  it("parses a positive integer as a hop count (1 = one nginx hop in prod)", () => {
    expect(resolveTrustProxy("1")).toBe(1);
    expect(resolveTrustProxy(" 2 ")).toBe(2);
    expect(resolveTrustProxy("0")).toBe(0);
  });

  it("passes an IP / CIDR trust list through verbatim to proxy-addr", () => {
    expect(resolveTrustProxy("127.0.0.1")).toBe("127.0.0.1");
    expect(resolveTrustProxy("10.0.0.0/8,127.0.0.1")).toBe("10.0.0.0/8,127.0.0.1");
  });
});
