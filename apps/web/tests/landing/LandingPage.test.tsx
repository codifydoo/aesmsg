import { fireEvent, render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { APP_STORE_URL } from "@/src/landing/app-store-links";
import { LandingPage } from "@/src/landing/LandingPage";

describe("LandingPage (presentational marketing)", () => {
  it("renders the hero headline", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", {
        level: 1,
        name: /encrypted links for private messages and files/i,
      }),
    ).toBeInTheDocument();
  });

  it("renders the three process step labels", () => {
    render(<LandingPage />);
    expect(screen.getByText(/encrypt locally/i)).toBeInTheDocument();
    expect(screen.getByText(/share anywhere/i)).toBeInTheDocument();
    expect(screen.getByText(/recipient decrypts/i)).toBeInTheDocument();
  });

  it("renders the zero-knowledge backend bento heading", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /zero-knowledge backend/i })).toBeInTheDocument();
  });

  it("renders the biometric unlock and self-destruct & revoke feature headings", () => {
    render(<LandingPage />);
    expect(screen.getByRole("heading", { name: /biometric unlock/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /self-destruct & revoke/i })).toBeInTheDocument();
  });

  it("renders the trust section heading and its cards", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", { name: /trust built into the architecture/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /ciphertext only/i })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: /keys stay on your device/i })).toBeInTheDocument();
  });

  it("renders the closing CTA heading", () => {
    render(<LandingPage />);
    expect(
      screen.getByRole("heading", { name: /ready to encrypt your next message/i }),
    ).toBeInTheDocument();
  });

  it("renders a header banner with the aesmsg brand and a Get the app link to the App Store", () => {
    render(<LandingPage />);
    const banner = screen.getByRole("banner");
    expect(within(banner).getByText("aesmsg")).toBeInTheDocument();
    const cta = within(banner).getByRole("link", { name: /get the app/i });
    expect(cta).toHaveAttribute("href", APP_STORE_URL);
  });

  it("renders a footer with the aesmsg brand, tagline and copyright", () => {
    render(<LandingPage />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("aesmsg")).toBeInTheDocument();
    expect(footer).toHaveTextContent(/institutional trust\. precision privacy/i);
    expect(footer).toHaveTextContent(/© 2026 aesmsg/i);
  });

  it("is presentational — every primary CTA drives to the native app, no in-browser routing", () => {
    const { container } = render(<LandingPage />);
    expect(container.querySelector('a[href="/keys"]')).toBeNull();
    expect(container.querySelector('a[href="/create"]')).toBeNull();
    expect(screen.queryByText(/set up your identity/i)).not.toBeInTheDocument();
    const getTheApp = screen.getAllByRole("link", { name: /get the app/i });
    expect(getTheApp.length).toBeGreaterThan(0);
    for (const link of getTheApp) {
      expect(link).toHaveAttribute("href", APP_STORE_URL);
    }
  });

  it("avoids the banned marketing copy", () => {
    render(<LandingPage />);
    expect(screen.queryByText(/military-grade/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/unbreakable/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/quantum/i)).not.toBeInTheDocument();
  });

  it("copies the hero secure link on click", () => {
    render(<LandingPage />);
    const copyButton = screen.getByRole("button", { name: /copy/i });
    fireEvent.click(copyButton);
    expect(screen.getByText(/copied/i)).toBeInTheDocument();
  });
});
