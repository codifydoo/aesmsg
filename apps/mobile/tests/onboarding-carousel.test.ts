import { describe, expect, it } from "vitest";
import {
  clampSlideIndex,
  isLastSlide,
  nextSlide,
  prevSlide,
  WELCOME_CHANNELS,
  WELCOME_SLIDES,
} from "@/src/onboarding/carousel";

describe("clampSlideIndex", () => {
  it("returns the index unchanged when in range", () => {
    expect(clampSlideIndex(0, 3)).toBe(0);
    expect(clampSlideIndex(1, 3)).toBe(1);
    expect(clampSlideIndex(2, 3)).toBe(2);
  });

  it("clamps below 0 to 0", () => {
    expect(clampSlideIndex(-1, 3)).toBe(0);
    expect(clampSlideIndex(-100, 3)).toBe(0);
  });

  it("clamps above the last index to the last index", () => {
    expect(clampSlideIndex(3, 3)).toBe(2);
    expect(clampSlideIndex(99, 3)).toBe(2);
  });

  it("returns 0 for non-positive counts", () => {
    expect(clampSlideIndex(2, 0)).toBe(0);
    expect(clampSlideIndex(2, -1)).toBe(0);
  });

  it("rounds fractional indices from animated scroll offsets", () => {
    expect(clampSlideIndex(1.4, 3)).toBe(1);
    expect(clampSlideIndex(1.6, 3)).toBe(2);
  });
});

describe("nextSlide / prevSlide", () => {
  it("advances one slide, stopping at the last", () => {
    expect(nextSlide(0, 3)).toBe(1);
    expect(nextSlide(1, 3)).toBe(2);
    expect(nextSlide(2, 3)).toBe(2);
  });

  it("goes back one slide, stopping at the first", () => {
    expect(prevSlide(2, 3)).toBe(1);
    expect(prevSlide(1, 3)).toBe(0);
    expect(prevSlide(0, 3)).toBe(0);
  });
});

describe("isLastSlide", () => {
  it("is true only on the final slide", () => {
    expect(isLastSlide(0, 3)).toBe(false);
    expect(isLastSlide(1, 3)).toBe(false);
    expect(isLastSlide(2, 3)).toBe(true);
  });

  it("clamps before checking", () => {
    expect(isLastSlide(99, 3)).toBe(true);
    expect(isLastSlide(-1, 3)).toBe(false);
  });

  it("is false for an empty carousel", () => {
    expect(isLastSlide(0, 0)).toBe(false);
  });
});

describe("carousel content", () => {
  it("ships exactly three intro slides", () => {
    expect(WELCOME_SLIDES).toHaveLength(3);
  });

  it("keeps the design's ciphertext-only headline + body verbatim on the middle slide", () => {
    const middle = WELCOME_SLIDES[1];
    expect(middle?.title).toBe("Share through any app");
    expect(middle?.body).toContain("ciphertext");
  });

  it("every slide has an icon, title and body", () => {
    for (const slide of WELCOME_SLIDES) {
      expect(slide.icon.length).toBeGreaterThan(0);
      expect(slide.title.length).toBeGreaterThan(0);
      expect(slide.body.length).toBeGreaterThan(0);
    }
  });

  it("lists the design's five channel chips in order", () => {
    expect(WELCOME_CHANNELS).toEqual(["Slack", "WhatsApp", "iMessage", "Email", "SMS"]);
  });

  it("never makes forbidden security claims", () => {
    const forbidden = ["unbreakable", "military-grade", "impossible to hack"];
    const corpus = WELCOME_SLIDES.map((s) => `${s.title} ${s.body}`)
      .join(" ")
      .toLowerCase();
    for (const phrase of forbidden) {
      expect(corpus).not.toContain(phrase);
    }
  });
});
