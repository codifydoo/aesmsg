import { render, screen } from "@testing-library/react";
import type { AnchorHTMLAttributes } from "react";
import { describe, expect, it, vi } from "vitest";

// next/link and next/navigation need the App Router runtime context, which does not exist
// in a component render test. Mock both to their observable output: a plain anchor, and a
// fixed pathname so the active-route highlight is deterministic.
vi.mock("next/navigation", () => ({
  usePathname: () => "/identity",
}));

vi.mock("next/link", () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...rest
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { AppShell } from "@/src/app-shell/AppShell";

describe("<AppShell />", () => {
  it("renders all six primary nav labels and the routed child", () => {
    render(
      <AppShell>
        <p>child content</p>
      </AppShell>,
    );

    for (const label of ["Dashboard", "New Message", "Links", "Contacts", "Keys", "Settings"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("marks exactly the active destination with aria-current", () => {
    render(
      <AppShell>
        <p>child</p>
      </AppShell>,
    );

    const current = screen
      .getAllByRole("link")
      .filter((link) => link.getAttribute("aria-current") === "page");

    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent(/keys/i);
    expect(current[0]).toHaveAttribute("href", "/identity");
  });
});
