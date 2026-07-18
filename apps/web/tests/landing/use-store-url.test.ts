import { describe, expect, it } from "vitest";
import { APP_STORE_URL, PLAY_STORE_URL } from "@/src/landing/app-store-links";
import { storeUrlForUserAgent } from "@/src/landing/use-store-url";

describe("storeUrlForUserAgent", () => {
  it("sends Android devices to the Play Store", () => {
    const ua =
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Mobile Safari/537.36";
    expect(storeUrlForUserAgent(ua)).toBe(PLAY_STORE_URL);
  });

  it("sends iPhone to the App Store", () => {
    const ua =
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    expect(storeUrlForUserAgent(ua)).toBe(APP_STORE_URL);
  });

  it("sends iPad to the App Store", () => {
    const ua =
      "Mozilla/5.0 (iPad; CPU OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1";
    expect(storeUrlForUserAgent(ua)).toBe(APP_STORE_URL);
  });

  it("defaults desktop / unknown agents to the App Store", () => {
    const desktop =
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
    expect(storeUrlForUserAgent(desktop)).toBe(APP_STORE_URL);
    expect(storeUrlForUserAgent("")).toBe(APP_STORE_URL);
  });
});
