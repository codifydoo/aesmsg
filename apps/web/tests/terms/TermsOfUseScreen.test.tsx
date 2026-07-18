import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TermsOfUseScreen } from "@/src/terms/TermsOfUseScreen";

describe("TermsOfUseScreen (presentational terms of use / EULA)", () => {
  it("renders the page title and last-updated date", () => {
    const { container } = render(<TermsOfUseScreen />);
    expect(screen.getByRole("heading", { level: 1, name: /terms of use/i })).toBeInTheDocument();
    expect(container.textContent).toMatch(/last updated: june 4, 2026/i);
  });

  it("renders every terms section heading", () => {
    render(<TermsOfUseScreen />);
    for (const name of [
      /agreement to these terms/i,
      /what aesmsg is/i,
      /^eligibility$/i,
      /your identity, keys, and responsibility/i,
      /acceptable use/i,
      /aesmsg pro subscriptions/i,
      /app store terms/i,
      /^disclaimers$/i,
      /limitation of liability/i,
      /changes to the service/i,
      /^termination$/i,
      /governing law/i,
      /changes to these terms/i,
      /^contact$/i,
    ]) {
      expect(screen.getByRole("heading", { name })).toBeInTheDocument();
    }
  });

  it("states the auto-renewal subscription terms", () => {
    const { container } = render(<TermsOfUseScreen />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/automatically renews/i);
    expect(text).toMatch(/at least 24 hours before the end of the current period/i);
  });

  it("includes the Apple third-party-beneficiary clause", () => {
    const { container } = render(<TermsOfUseScreen />);
    expect(container.textContent).toMatch(/third-party beneficiaries/i);
  });

  it("states the no-recovery, no-backdoor key fact", () => {
    const { container } = render(<TermsOfUseScreen />);
    const text = container.textContent ?? "";
    expect(text).toMatch(/cannot be recovered/i);
    expect(text).toMatch(/no password reset, recovery, or backdoor/i);
  });

  it("names the governing law as Croatia", () => {
    const { container } = render(<TermsOfUseScreen />);
    expect(container.textContent).toMatch(/laws of the Republic of Croatia/i);
  });

  it("names the operator and a contact mailto", () => {
    const { container } = render(<TermsOfUseScreen />);
    expect(container.textContent).toMatch(/CODIFY d\.o\.o\./);
    const mail = screen.getByRole("link", { name: /info@codify\.hr/i });
    expect(mail).toHaveAttribute("href", "mailto:info@codify.hr");
  });

  it("avoids the banned marketing copy", () => {
    const { container } = render(<TermsOfUseScreen />);
    const text = container.textContent ?? "";
    expect(text).not.toMatch(/military-grade/i);
    expect(text).not.toMatch(/unbreakable/i);
    expect(text).not.toMatch(/impossible to hack/i);
    expect(text).not.toMatch(/quantum/i);
  });

  it("renders a footer with the aesmsg brand", () => {
    render(<TermsOfUseScreen />);
    const footer = screen.getByRole("contentinfo");
    expect(within(footer).getByText("aesmsg")).toBeInTheDocument();
  });
});
