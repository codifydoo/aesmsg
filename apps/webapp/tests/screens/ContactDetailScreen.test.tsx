import {
  exportPublicKey,
  fingerprint,
  generateIdentity,
  type PublicKeyString,
} from "@aesmsg/crypto";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { shortFingerprint } from "@/src/contacts/contacts-display";
import {
  __resetContactsForTests,
  addContact,
  getContact,
  setContactVerified,
  updateContactKey,
} from "@/src/contacts/contacts-store";
import { __deleteDbForTests } from "@/src/identity/db";
import { ContactDetailScreen } from "@/src/screens/ContactDetailScreen";

const push = vi.fn();
let searchId = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn() }),
  useSearchParams: () => ({ get: (k: string) => (k === "id" ? searchId : null) }),
}));

async function key(): Promise<PublicKeyString> {
  return exportPublicKey(await generateIdentity());
}

describe("<ContactDetailScreen />", () => {
  beforeEach(async () => {
    push.mockClear();
    searchId = "";
    await __deleteDbForTests();
    await __resetContactsForTests();
  });
  afterEach(() => vi.restoreAllMocks());

  it("shows the calm empty copy for a missing id", async () => {
    searchId = "does-not-exist";
    render(<ContactDetailScreen />);
    expect(await screen.findByText(/isn't saved on this device/i)).toBeVisible();
  });

  it("renders name, mono fingerprint, mono public key, and created date", async () => {
    const pk = await key();
    const fp = await fingerprint(pk);
    const c = await addContact({ label: "Elena Rodriguez", publicKey: pk });
    searchId = c.id;
    render(<ContactDetailScreen />);

    expect(await screen.findByText("Elena Rodriguez")).toBeVisible();
    const fpEl = screen.getByText(fp);
    expect(fpEl).toHaveClass("font-mono");
    const pkEl = screen.getByText(pk);
    expect(pkEl).toHaveClass("font-mono");
    expect(screen.getByText(/contact created/i)).toBeVisible();
  });

  it("shows the amber chip and a previous-keys section for a changed contact", async () => {
    const c = await addContact({ label: "Cho", publicKey: await key() });
    const oldFp = c.fingerprint;
    await updateContactKey(c.id, await key());
    searchId = c.id;
    render(<ContactDetailScreen />);

    const chip = await screen.findByLabelText(/key changed/i);
    expect(chip.className).toContain("text-warning");
    expect(screen.getByText(/previously used keys/i)).toBeVisible();
    expect(screen.getByText(shortFingerprint(oldFp))).toBeVisible();
  });

  it("renames a contact and persists it", async () => {
    const c = await addContact({ label: "Old Name", publicKey: await key() });
    searchId = c.id;
    render(<ContactDetailScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /rename/i }));
    fireEvent.change(screen.getByLabelText(/contact name/i), { target: { value: "New Name" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    await waitFor(() => expect(screen.getByText("New Name")).toBeVisible());
    expect((await getContact(c.id))?.label).toBe("New Name");
  });

  it("deletes a contact through the red confirm dialog", async () => {
    const c = await addContact({ label: "Delete Me", publicKey: await key() });
    searchId = c.id;
    render(<ContactDetailScreen />);
    fireEvent.click(await screen.findByRole("button", { name: /delete contact/i }));
    const dialog = screen.getByRole("dialog");
    const confirm = within(dialog).getByRole("button", { name: /delete contact/i });
    expect(confirm.className).toContain("bg-error");
    fireEvent.click(confirm);
    await waitFor(() => expect(push).toHaveBeenCalledWith("/contacts"));
    expect(await getContact(c.id)).toBeNull();
  });

  it("re-key with a different key opens the amber alert with the real prev/new fingerprints", async () => {
    const c = await addContact({ label: "Rk", publicKey: await key() });
    const newKey = await key();
    const newFp = await fingerprint(newKey);
    searchId = c.id;
    render(<ContactDetailScreen />);

    fireEvent.click(await screen.findByRole("button", { name: /update key/i }));
    fireEvent.change(screen.getByLabelText(/new public key/i), { target: { value: newKey } });
    fireEvent.click(screen.getByRole("button", { name: /check new key/i }));

    const alert = await screen.findByRole("dialog");
    expect(within(alert).getByText(/public key changed/i)).toBeVisible();
    expect(within(alert).getByText(shortFingerprint(c.fingerprint))).toBeVisible();
    expect(within(alert).getByText(shortFingerprint(newFp))).toBeVisible();
    // Amber, not ambient red.
    expect(alert.className).not.toContain("bg-error");
  });

  it("'Update to new key' commits the candidate: new fingerprint, verified reset, old fingerprint pushed", async () => {
    const c = await addContact({ label: "Rk", publicKey: await key() });
    await setContactVerified(c.id, true);
    const oldFp = c.fingerprint;
    const newKey = await key();
    const newFp = await fingerprint(newKey);
    searchId = c.id;
    render(<ContactDetailScreen />);

    fireEvent.click(await screen.findByRole("button", { name: /update key/i }));
    fireEvent.change(screen.getByLabelText(/new public key/i), { target: { value: newKey } });
    fireEvent.click(screen.getByRole("button", { name: /check new key/i }));

    const alert = await screen.findByRole("dialog");
    // Mobile parity: the contact-side alert has no in-alert "Verify fingerprint" adopt path.
    expect(within(alert).queryByRole("button", { name: /verify fingerprint/i })).toBeNull();
    fireEvent.click(within(alert).getByRole("button", { name: /update to new key/i }));

    await waitFor(async () => expect((await getContact(c.id))?.fingerprint).toBe(newFp));
    const updated = await getContact(c.id);
    if (!updated) throw new Error("contact missing");
    expect(updated.verified).toBe(false);
    expect(updated.previousFingerprints).toContain(oldFp);
    expect(updated.publicKey).toBe(newKey);
  });

  it("'Keep current key' discards the candidate and leaves the stored record byte-identical", async () => {
    const c = await addContact({ label: "Keep", publicKey: await key() });
    await setContactVerified(c.id, true);
    const before = await getContact(c.id);
    const newKey = await key();
    searchId = c.id;
    render(<ContactDetailScreen />);

    fireEvent.click(await screen.findByRole("button", { name: /update key/i }));
    fireEvent.change(screen.getByLabelText(/new public key/i), { target: { value: newKey } });
    fireEvent.click(screen.getByRole("button", { name: /check new key/i }));

    const alert = await screen.findByRole("dialog");
    fireEvent.click(within(alert).getByRole("button", { name: /keep current key/i }));

    await waitFor(() => expect(screen.queryByText(/public key changed/i)).not.toBeInTheDocument());
    // The stored record is untouched — no key adopted, nothing pushed to history.
    expect(await getContact(c.id)).toEqual(before);
  });

  it("re-key with the current key shows an inline error and no alert", async () => {
    const pk = await key();
    const c = await addContact({ label: "Same", publicKey: pk });
    searchId = c.id;
    render(<ContactDetailScreen />);

    fireEvent.click(await screen.findByRole("button", { name: /update key/i }));
    fireEvent.change(screen.getByLabelText(/new public key/i), { target: { value: pk } });
    fireEvent.click(screen.getByRole("button", { name: /check new key/i }));

    expect(await screen.findByText(/already this contact's current key/i)).toBeVisible();
    expect(screen.queryByText(/public key changed/i)).not.toBeInTheDocument();
  });
});
