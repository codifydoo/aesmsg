import { exportPublicKey, generateIdentity, type PublicKeyString } from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetContactsForTests,
  addContact,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
import { __deleteDbForTests } from "@/src/identity/db";
import { ContactsListScreen } from "@/src/screens/ContactsListScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

async function key(): Promise<PublicKeyString> {
  return exportPublicKey(await generateIdentity());
}

describe("<ContactsListScreen />", () => {
  beforeEach(async () => {
    push.mockClear();
    await __deleteDbForTests();
    await __resetContactsForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the empty state when there are no contacts", async () => {
    render(<ContactsListScreen />);
    expect(await screen.findByText(/no contacts yet/i)).toBeVisible();
    expect(screen.getByText(/add one to start sending securely/i)).toBeVisible();
  });

  it("renders verified/unverified/changed contacts with the right chip token + mono fingerprint", async () => {
    const verified = await addContact({ label: "Verified Val", publicKey: await key() });
    await setContactVerified(verified.id, true);
    await addContact({ label: "Unverified Uma", publicKey: await key() });
    const changed = await addContact({ label: "Changed Cho", publicKey: await key() });
    await updateContactKey(changed.id, await key()); // pushes history → derived "changed"

    render(<ContactsListScreen />);

    const verifiedChip = await screen.findByLabelText("Verified");
    expect(verifiedChip.className).toContain("text-success");
    expect(verifiedChip.className).not.toContain("text-error");

    const unverifiedChip = screen.getByLabelText("Unverified");
    expect(unverifiedChip.className).toContain("text-warning");

    const changedChip = screen.getByLabelText(/key changed/i);
    expect(changedChip.className).toContain("text-warning");
    expect(changedChip.className).not.toContain("text-error");

    // Each row shows a short mono fingerprint.
    const monoFps = document.querySelectorAll("span.font-mono");
    expect(monoFps.length).toBe(3);
  });

  it("routes to the contact detail on row click", async () => {
    const c = await addContact({ label: "Alice", publicKey: await key() });
    render(<ContactsListScreen />);
    fireEvent.click(await screen.findByText("Alice"));
    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(`/contacts/detail?id=${encodeURIComponent(c.id)}`),
    );
  });

  it("routes to add-contact from the header action", async () => {
    render(<ContactsListScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /add contact/i }));
    expect(push).toHaveBeenCalledWith("/contacts/new");
  });
});
