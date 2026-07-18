import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { BouncerScreen } from "@/src/bouncer/BouncerScreen";

describe("<BouncerScreen />", () => {
  it("renders an 'Open in app' anchor with the aesmsg:// deep link for a valid id", () => {
    const id = "abcdefghijkl0123";
    render(<BouncerScreen id={id} />);

    const openLink = screen.getByRole("link", { name: /open in app/i });
    expect(openLink).toHaveAttribute("href", `aesmsg://l/${id}`);
  });

  it("renders no 'Open in app' anchor for an invalid id but still shows store links + heading", () => {
    render(<BouncerScreen id="nope" />);

    expect(screen.queryByRole("link", { name: /open in app/i })).toBeNull();
    expect(screen.getByRole("link", { name: /download for ios/i })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /download for android/i })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: /open this secure link in aesmsg/i }),
    ).toBeInTheDocument();
  });
});
