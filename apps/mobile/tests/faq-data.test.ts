import { describe, expect, it } from "vitest";
import { FAQ_ITEMS, type FaqItem, filterFaq, groupFaq } from "@/src/system/faq-data";

// Pure FAQ filtering + grouping for the Help screen (node-env, no renderer). The content itself also
// carries product invariants worth pinning (no forbidden copy, the no-recovery answer is plain).

const ITEMS: FaqItem[] = [
  { id: "a", section: "Getting started", question: "What is a secure link?", answer: "A pointer." },
  {
    id: "b",
    section: "Getting started",
    question: "Where are my keys?",
    answer: "On this device.",
  },
  {
    id: "c",
    section: "Privacy",
    question: "Can you read messages?",
    answer: "No, zero-knowledge.",
  },
];

describe("filterFaq", () => {
  it("returns every item for an empty or whitespace query", () => {
    expect(filterFaq(ITEMS, "")).toHaveLength(3);
    expect(filterFaq(ITEMS, "   ")).toHaveLength(3);
  });

  it("matches case-insensitively against the question", () => {
    expect(filterFaq(ITEMS, "SECURE LINK").map((i) => i.id)).toEqual(["a"]);
  });

  it("matches against the answer text too", () => {
    expect(filterFaq(ITEMS, "zero-knowledge").map((i) => i.id)).toEqual(["c"]);
  });

  it("trims surrounding whitespace from the query", () => {
    expect(filterFaq(ITEMS, "  keys  ").map((i) => i.id)).toEqual(["b"]);
  });

  it("returns an empty list when nothing matches (never throws)", () => {
    expect(filterFaq(ITEMS, "nonexistent")).toEqual([]);
  });
});

describe("groupFaq", () => {
  it("groups by section in first-appearance order, preserving item order", () => {
    const groups = groupFaq(ITEMS);
    expect(groups.map((g) => g.section)).toEqual(["Getting started", "Privacy"]);
    expect(groups[0].items.map((i) => i.id)).toEqual(["a", "b"]);
    expect(groups[1].items.map((i) => i.id)).toEqual(["c"]);
  });

  it("returns no groups for an empty list", () => {
    expect(groupFaq([])).toEqual([]);
  });
});

describe("FAQ_ITEMS content invariants", () => {
  it("has unique ids", () => {
    const ids = FAQ_ITEMS.map((i) => i.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never uses forbidden marketing copy", () => {
    const blob = FAQ_ITEMS.map((i) => `${i.question} ${i.answer}`)
      .join(" ")
      .toLowerCase();
    for (const banned of ["unbreakable", "military-grade", "impossible to hack"]) {
      expect(blob).not.toContain(banned);
    }
  });

  it("states the no-recovery reality plainly in the lost-key answer", () => {
    const lost = FAQ_ITEMS.find((i) => i.id === "lost-key");
    expect(lost).toBeDefined();
    expect(lost?.answer.toLowerCase()).toContain("can't be");
    expect(lost?.answer.toLowerCase()).toContain("no backdoor");
  });

  it("reinforces zero-knowledge / on-device wording somewhere in the content", () => {
    const blob = FAQ_ITEMS.map((i) => i.answer).join(" ");
    expect(blob).toMatch(/zero-knowledge/i);
    expect(blob).toMatch(/on this device/i);
  });
});
