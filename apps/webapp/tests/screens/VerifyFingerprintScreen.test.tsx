import { exportPublicKey, generateIdentity, type PublicKeyString } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { KeyChangedAlert } from "@/src/components/KeyChangedAlert";
import { contactRecordToContact, deriveTrustStatus } from "@/src/contacts/contacts-display";
import { __resetContactsForTests, addContact, getContact } from "@/src/contacts/contacts-store";
import { __deleteDbForTests } from "@/src/identity/db";
import { VerifyFingerprintScreen } from "@/src/screens/VerifyFingerprintScreen";

async function key(): Promise<PublicKeyString> {
  return exportPublicKey(await generateIdentity());
}

describe("<VerifyFingerprintScreen />", () => {
  beforeEach(async () => {
    await __deleteDbForTests();
    await __resetContactsForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("marks the contact verified (status → green) on 'Mark as verified'", async () => {
    const c = await addContact({ label: "Alice", publicKey: await key() });
    expect(deriveTrustStatus(c)).toBe("unverified");
    const onDone = vi.fn();
    render(
      <VerifyFingerprintScreen
        contact={contactRecordToContact(c)}
        onDone={onDone}
        onCancel={vi.fn()}
      />,
    );

    // The fingerprint is shown in mono.
    expect(screen.getByTestId("contact-fingerprint")).toHaveClass("font-mono");

    fireEvent.click(screen.getByRole("button", { name: /mark as verified/i }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    const updated = await getContact(c.id);
    if (updated === null) throw new Error("contact missing");
    expect(updated.verified).toBe(true);
    expect(deriveTrustStatus(updated)).toBe("verified");
  });

  it("leaves the contact unverified on 'Not now'", async () => {
    const c = await addContact({ label: "Bob", publicKey: await key() });
    const onCancel = vi.fn();
    render(
      <VerifyFingerprintScreen
        contact={contactRecordToContact(c)}
        onDone={vi.fn()}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /not now/i }));
    expect(onCancel).toHaveBeenCalled();
    expect((await getContact(c.id))?.verified).toBe(false);
  });
});

describe("<KeyChangedAlert />", () => {
  it("renders the REAL previous + new fingerprints in mono with amber (never ambient red) tokens", () => {
    const onUpdateKey = vi.fn();
    const onKeepCurrent = vi.fn();
    const { getByText, getByRole, queryByRole } = render(
      <KeyChangedAlert
        contactName="Elena"
        previousFingerprint="A1B2 C3D4"
        newFingerprint="9F8E 7D6C"
        onUpdateKey={onUpdateKey}
        onKeepCurrent={onKeepCurrent}
      />,
    );

    const prev = getByText("A1B2 C3D4");
    const next = getByText("9F8E 7D6C");
    expect(prev).toHaveClass("font-mono");
    expect(next).toHaveClass("font-mono");
    // Previous is neutral; New is amber (warning), not red.
    expect(prev.className).toContain("text-on-surface-variant");
    expect(next.className).toContain("text-warning");
    expect(next.className).not.toContain("text-error");

    // The alert container is amber, never an ambient red fill.
    const dialog = getByRole("dialog");
    expect(dialog.innerHTML).not.toContain("bg-error");

    // Mobile parity: exactly TWO actions — the trust-destroying "Verify fingerprint" adopt path is
    // gone from the contact-side alert.
    expect(queryByRole("button", { name: /verify fingerprint/i })).toBeNull();

    fireEvent.click(getByRole("button", { name: /update to new key/i }));
    expect(onUpdateKey).toHaveBeenCalled();
    fireEvent.click(getByRole("button", { name: /keep current key/i }));
    expect(onKeepCurrent).toHaveBeenCalled();
  });
});
