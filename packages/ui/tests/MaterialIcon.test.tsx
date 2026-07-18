import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MaterialIcon } from "../src/MaterialIcon.js";

describe("MaterialIcon", () => {
  it("renders the icon name as text inside material-symbols-outlined span", () => {
    const { container } = render(<MaterialIcon name="vpn_key" />);
    const span = container.firstChild as HTMLElement;
    expect(span.tagName).toBe("SPAN");
    expect(span.className).toContain("material-symbols-outlined");
    expect(span.textContent).toBe("vpn_key");
  });

  it("uses unfilled font-variation-settings by default", () => {
    const { container } = render(<MaterialIcon name="vpn_key" />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.fontVariationSettings).toMatch(/["']FILL["'] 0/);
  });

  it("uses filled font-variation-settings when filled=true", () => {
    const { container } = render(<MaterialIcon name="vpn_key" filled />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.fontVariationSettings).toMatch(/["']FILL["'] 1/);
  });

  it("appends the optional className", () => {
    const { container } = render(<MaterialIcon name="vpn_key" className="text-primary" />);
    const span = container.firstChild as HTMLElement;
    expect(span.className).toContain("text-primary");
  });

  it("defaults to weight 400, grade 0, optical size 24 and no explicit font-size", () => {
    const { container } = render(<MaterialIcon name="vpn_key" />);
    const span = container.firstChild as HTMLElement;
    const fvs = span.style.fontVariationSettings;
    expect(fvs).toMatch(/["']wght["'] 400/);
    expect(fvs).toMatch(/["']GRAD["'] 0/);
    expect(fvs).toMatch(/["']opsz["'] 24/);
    expect(span.style.fontSize).toBe("");
  });

  it("threads custom weight and grade into the variation settings", () => {
    const { container } = render(<MaterialIcon name="vpn_key" weight={250} grade={-25} />);
    const span = container.firstChild as HTMLElement;
    expect(span.style.fontVariationSettings).toMatch(/["']wght["'] 250/);
    expect(span.style.fontVariationSettings).toMatch(/["']GRAD["'] -25/);
  });

  it("drives font-size and opsz from size, and merges extra style", () => {
    const { container } = render(
      <MaterialIcon name="vpn_key" size={18} style={{ color: "rgb(1, 2, 3)" }} />,
    );
    const span = container.firstChild as HTMLElement;
    expect(span.style.fontSize).toBe("18px");
    expect(span.style.fontVariationSettings).toMatch(/["']opsz["'] 18/);
    expect(span.style.color).toBe("rgb(1, 2, 3)");
  });
});
