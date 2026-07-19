"use client";

import { MaterialIcon } from "@aesmsg/ui";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { ConfirmRevokeDialog } from "@/src/components/ConfirmRevokeDialog";
import { SecureLinkBlock } from "@/src/components/SecureLinkBlock";
import { StatusChip } from "@/src/components/StatusChip";
import { expiresInLabel, opensLabel } from "@/src/links/link-status";
import { secureLinkUrl } from "@/src/links/link-url";
import { useSentLinks } from "@/src/links/use-sent-links";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}, ${hh}:${mm} UTC`;
}

function MetaRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 border-outline-variant/60 border-b py-3 last:border-b-0 sm:flex-row sm:items-center sm:justify-between">
      <span className="text-label-sm uppercase tracking-widest text-on-surface-variant">
        {label}
      </span>
      <span className="text-body-md text-on-surface">{children}</span>
    </div>
  );
}

export function LinkDetailsScreen() {
  const searchParams = useSearchParams();
  const id = searchParams.get("id") ?? "";
  const { links, loading, revoke } = useSentLinks();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [revoking, setRevoking] = useState(false);
  const [revokeError, setRevokeError] = useState(false);

  const link = links.find((l) => l.record.id === id);

  if (loading) {
    return (
      <p className="py-16 text-center text-body-md text-on-surface-variant">
        Loading link details…
      </p>
    );
  }

  if (!link) {
    return (
      <div className="mx-auto max-w-xl rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <MaterialIcon name="link_off" />
        </div>
        <h1 className="font-display text-h2 text-on-surface">Link not tracked here</h1>
        <p className="mt-2 text-body-md text-on-surface-variant">
          This link isn't tracked on this device.
        </p>
        <Link
          href="/links"
          className="mt-6 inline-flex items-center gap-1 text-label-sm uppercase tracking-widest text-primary"
        >
          <MaterialIcon name="arrow_back" size={16} />
          Back to links
        </Link>
      </div>
    );
  }

  const { record, status, opensCount, maxOpens, expiresAt } = link;
  const now = Date.now();
  const isRevoked = status === "revoked";

  async function handleConfirm() {
    setRevoking(true);
    setRevokeError(false);
    const result = await revoke(id);
    setRevoking(false);
    setConfirmOpen(false);
    if (result === "error") setRevokeError(true);
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <Link
        href="/links"
        className="inline-flex items-center gap-1 text-label-sm uppercase tracking-widest text-on-surface-variant transition-colors hover:text-primary"
      >
        <MaterialIcon name="arrow_back" size={16} />
        Back to links
      </Link>

      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="font-display text-h1 text-on-surface">{record.label ?? "Secure link"}</h1>
        <StatusChip status={status} />
      </header>

      {/* Prefer the server-returned url; fall back to the constant only for legacy records. */}
      <SecureLinkBlock url={record.url ?? secureLinkUrl(id)} />

      <section className="rounded-xl border border-outline-variant bg-surface-container px-6 py-2">
        <MetaRow label="Recipient fingerprint">
          <span className="break-all font-mono text-mono-code">{record.recipientFingerprint}</span>
        </MetaRow>
        <MetaRow label="Created">{formatDateTime(record.createdAt)}</MetaRow>
        <MetaRow label="Expires">
          {formatDateTime(expiresAt)} · {expiresInLabel(expiresAt, now)}
        </MetaRow>
        <MetaRow label="Views">{opensLabel(opensCount, maxOpens)}</MetaRow>
      </section>

      {revokeError ? (
        <div className="flex items-start gap-2 rounded-lg border border-error/30 bg-error/10 p-3">
          <MaterialIcon name="error" size={18} className="text-error" />
          <p className="text-label-sm text-error">
            Couldn't revoke the link just now. Check your connection and try again.
          </p>
        </div>
      ) : null}

      <section className="rounded-xl border border-error/30 bg-surface-container p-6">
        <h2 className="font-display text-h2 text-error">Revoke</h2>
        <p className="mt-2 text-body-md text-on-surface-variant">
          Revoking purges the ciphertext from the server. Anyone with the link will then see “This
          secure link is no longer available.”
        </p>
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={isRevoked}
          className="mt-4 inline-flex h-11 items-center justify-center gap-2 rounded-lg border border-error px-5 font-medium text-error transition-colors hover:bg-error/10 disabled:pointer-events-none disabled:opacity-50"
        >
          <MaterialIcon name="delete_forever" size={20} />
          {isRevoked ? "Revoked" : "Revoke link"}
        </button>
      </section>

      <ConfirmRevokeDialog
        open={confirmOpen}
        busy={revoking}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleConfirm}
      />
    </div>
  );
}
