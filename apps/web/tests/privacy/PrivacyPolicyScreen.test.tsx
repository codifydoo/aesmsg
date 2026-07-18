import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PrivacyPolicyScreen } from "@/src/privacy/PrivacyPolicyScreen";

describe("PrivacyPolicyScreen (presentational privacy policy)", () => {
  it("renders the page title and last-updated date", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    expect(screen.getByRole("heading", { level: 1, name: /privacy policy/i })).toBeInTheDocument();
    expect(container.textContent).toMatch(/last updated: june 1, 2026/i);
  });

  it("renders every policy section heading", () => {
    render(<PrivacyPolicyScreen />);
    for (const name of [
      /^overview$/i,
      /what we process/i,
      /what we never have access to/i,
      /connection and abuse-prevention data/i,
      /legal bases for processing/i,
      /data retention and deletion/i,
      /data that stays on your device/i,
      /no tracking, analytics, or accounts/i,
      /service providers and international transfers/i,
      /international users and your rights/i,
      /how we protect your data/i,
      /^children$/i,
      /changes to this policy/i,
      /^contact$/i,
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("states the zero-knowledge data facts", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/only the resulting ciphertext/i);
    expect(text).toMatch(/maximum number of opens/i);
    expect(text).toMatch(/plaintext messages/i);
    expect(text).toMatch(/private keys/i);
    expect(text).toMatch(/message previews/i);
    expect(text).toMatch(/unencrypted attachments/i);
    expect(text).toMatch(/revoking a link purges its ciphertext/i);
  });

  it('notes the "Data Not Collected" label alongside the security-only connection data', () => {
    const { container } = render(<PrivacyPolicyScreen />);
    expect(container.textContent).toMatch(/data not collected/i);
    expect(container.textContent).toMatch(/non-reversible hash of your IP address/i);
  });

  it("discloses GDPR legal bases, rights, and the supervisory authority", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/legitimate interest/i);
    expect(text).toMatch(/Article 6\(1\)\(b\)/);
    expect(text).toMatch(/lodge a complaint/i);
    expect(text).toMatch(/AZOP/);
  });

  it("names the operator and a privacy-contact mailto", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    expect(container.textContent).toMatch(/CODIFY d\.o\.o\./);
    const mail = screen.getByRole("link", { name: /info@codify\.hr/i });
    expect(mail).toHaveAttribute("href", "mailto:info@codify.hr");
  });

  it("avoids the banned marketing copy", () => {
    const { container } = render(<PrivacyPolicyScreen />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/military-grade/i);
    expect(text).not.toMatch(/unbreakable/i);
    expect(text).not.toMatch(/impossible to hack/i);
    expect(text).not.toMatch(/quantum/i);
  });

  it("renders a footer with the aesmsg brand", () => {
    render(<PrivacyPolicyScreen />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("aesmsg")).toBeInTheDocument();
  });
});
