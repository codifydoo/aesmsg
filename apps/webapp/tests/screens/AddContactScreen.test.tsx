import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { __resetContactsForTests, addContact } from "@/src/contacts/contacts-store";
import { __deleteDbForTests } from "@/src/identity/db";
import { AddContactScreen } from "@/src/screens/AddContactScreen";

const push = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
}));

async function key(): Promise<PublicKeyString> {
  return exportPublicKey(await generateIdentity());
}

describe("<AddContactScreen />", () => {
  beforeEach(async () => {
    push.mockClear();
    await __deleteDbForTests();
    await __resetContactsForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the derived AM- fingerprint for a pasted key and keeps submit disabled without a name", async () => {
    const pk = await key();
    const fp = await fingerprint(pk);
    render(<AddContactScreen />);

    fireEvent.change(screen.getByLabelText(/public key/i), { target: { value: pk } });
    expect(await screen.findByText(fp)).toBeVisible();
    expect(screen.getByText(/valid key/i)).toBeVisible();
    // No name yet → still disabled.
    expect(screen.getByRole("button", { name: /add contact/i })).toBeDisabled();
  });

  it("marks garbage as invalid and disables submit", async () => {
    render(<AddContactScreen />);
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Bob" } });
    fireEvent.change(screen.getByLabelText(/public key/i), { target: { value: "not-a-key" } });
    await waitFor(() =>
      expect(screen.getByText(/doesn't look like an aesmsg public key/i)).toBeVisible(),
    );
    expect(screen.getByRole("button", { name: /add contact/i })).toBeDisabled();
  });

  it("adds a contact and routes to its detail (zero network requests)", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const pk = await key();
    render(<AddContactScreen />);

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Alice" } });
    fireEvent.change(screen.getByLabelText(/public key/i), { target: { value: pk } });
    await waitFor(() => expect(screen.getByRole("button", { name: /add contact/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));

    await waitFor(() =>
      expect(push).toHaveBeenCalledWith(expect.stringMatching(/^\/contacts\/detail\?id=/)),
    );
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("shows the duplicate-key error copy without crashing", async () => {
    const pk = await key();
    await addContact({ label: "Existing Ed", publicKey: pk });
    render(<AddContactScreen />);

    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Dupe" } });
    fireEvent.change(screen.getByLabelText(/public key/i), { target: { value: pk } });
    await waitFor(() => expect(screen.getByRole("button", { name: /add contact/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));

    expect(await screen.findByText(/already saved as "Existing Ed"/i)).toBeVisible();
    expect(push).not.toHaveBeenCalled();
  });

  it("falls back to paste when the camera is unavailable; the paste tab still adds a contact", async () => {
    // Ensure mediaDevices exists, then remove getUserMedia so the hook reports "unavailable".
    if (!navigator.mediaDevices) {
      Object.defineProperty(navigator, "mediaDevices", { value: {}, configurable: true });
    }
    const original = (navigator.mediaDevices as { getUserMedia?: unknown }).getUserMedia;
    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: undefined,
      configurable: true,
      writable: true,
    });

    const pk = await key();
    render(<AddContactScreen />);
    fireEvent.click(screen.getByRole("tab", { name: /scan qr/i }));
    expect(await screen.findByText(/camera access needed/i)).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: /paste instead/i }));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: "Cam Cara" } });
    fireEvent.change(screen.getByLabelText(/public key/i), { target: { value: pk } });
    await waitFor(() => expect(screen.getByRole("button", { name: /add contact/i })).toBeEnabled());
    fireEvent.click(screen.getByRole("button", { name: /add contact/i }));
    await waitFor(() => expect(push).toHaveBeenCalled());

    Object.defineProperty(navigator.mediaDevices, "getUserMedia", {
      value: original,
      configurable: true,
      writable: true,
    });
  });
});
