import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

// Guard (replaces the old keys-rotate-disabled guard): real key rotation is now SHIPPED (roadmap 2.4
// / PG-1). These source-level assertions fail loudly if the wiring regresses to the old placebo /
// disabled state — the rotate confirm+success screens must exist, KeysFlow must run the real rotate()
// action, and the My-Public-Key entry must be a live, tappable control rather than inert "not
// available yet" copy.
//
// Source-level because the rotate entry is inline screen JSX and the mobile test convention forbids a
// React renderer. The rotation LOGIC itself (multi-key model, retention, crash-safety, legacy-link
// decrypt) is exercised behaviorally in identity-rotation.test.ts / identity-bundle.test.ts.

const keysDir = resolve(import.meta.dirname, "../src/keys");
const read = (file: string) => readFileSync(resolve(keysDir, file), "utf8");

describe("key rotation is wired (real, not a placebo)", () => {
  it("the Rotate-Key confirm + success screens exist", () => {
    expect(existsSync(resolve(keysDir, "RotateKeyScreen.tsx"))).toBe(true);
    expect(existsSync(resolve(keysDir, "RotateSuccessScreen.tsx"))).toBe(true);
  });

  it("KeysFlow runs the real rotate() action and routes to the success screen", () => {
    const src = read("KeysFlow.tsx");
    expect(src).toMatch(/actions\.rotate\(\)/);
    expect(src).toMatch(/RotateKeyScreen/);
    expect(src).toMatch(/RotateSuccessScreen/);
    expect(src).toMatch(/rotateSuccess/);
  });

  it("the My-Public-Key rotate entry is a live, tappable control — no 'not available yet' copy", () => {
    const src = read("MyPublicKeyScreen.tsx");
    // A rotate handler is wired to the entry (it can be tapped through to the flow).
    expect(src).toMatch(/onRotateKey/);
    // The old inert / disabled copy is gone.
    expect(src).not.toMatch(/Not available yet/);
  });

  it("the confirm screen is honest about what rotation does NOT do (re-verification, retained old key)", () => {
    const src = read("RotateKeyScreen.tsx");
    expect(src).toMatch(/re-verify/i);
    // Old key retained — received messages still open (not destructive).
    expect(src).toMatch(/still be opened/i);
  });

  it("the keys barrel exports the rotate screens", () => {
    const barrel = read("index.ts");
    expect(barrel).toMatch(/RotateKeyScreen/);
    expect(barrel).toMatch(/RotateSuccessScreen/);
  });
});
