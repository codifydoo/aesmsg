import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Logo } from "../src/Logo";

describe("Logo", () => {
  it("renders the mark as an svg labelled aesmsg containing the ring", () => {
    const { container } = render(<Logo variant="mark" />);
    const svg = screen.getByRole("img", { name: "aesmsg" });
    expect(svg).toBeInTheDocument();
    expect(svg.tagName.toLowerCase()).toBe("svg");
    expect(container.querySelector("circle")).toBeInTheDocument();
    expect(container.querySelector("line")).toBeInTheDocument();
  });

  it("renders the lockup with the visible aesmsg wordmark", () => {
    render(<Logo variant="lockup" />);
    expect(screen.getByText("aesmsg")).toBeInTheDocument();
  });

  it("honours a custom title", () => {
    render(<Logo variant="mark" title="aesmsg home" />);
    expect(screen.getByRole("img", { name: "aesmsg home" })).toBeInTheDocument();
  });
});
