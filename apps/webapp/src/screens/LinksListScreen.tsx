"use client";

import { truncateFingerprint } from "@aesmsg/crypto";
import { MaterialIcon } from "@aesmsg/ui";
import Link from "next/link";
import { useMemo, useState } from "react";
import { StatusChip } from "@/src/components/StatusChip";
import {
  type DisplayLink,
  type DisplayStatus,
  expiresInLabel,
  opensLabel,
} from "@/src/links/link-status";
import { secureLinkUrl } from "@/src/links/link-url";
import { useSentLinks } from "@/src/links/use-sent-links";

type Filter = "all" | "active" | "expired" | "revoked";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "expired", label: "Expired" },
  { value: "revoked", label: "Revoked" },
];

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "Jul 18, 2026" — UTC-based so it is deterministic. */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
}

function matchesFilter(status: DisplayStatus, filter: Filter): boolean {
  if (filter === "all") return true;
  if (filter === "active") return status === "active" || status === "expiring";
  if (filter === "expired") return status === "expired" || status === "opened_out";
  return status === "revoked";
}

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  async function handleCopy() {
    try {
      await navigator.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard unavailable — no-op */
    }
  }
  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label="Copy link"
      className="text-on-surface-variant transition-colors hover:text-primary"
    >
      <MaterialIcon name={copied ? "check" : "content_copy"} size={20} />
    </button>
  );
}

function StatCard({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="rounded-xl border border-outline-variant bg-surface-container-low p-4">
      <p className="text-label-sm uppercase tracking-widest text-on-surface-variant">{label}</p>
      <p className={`mt-2 font-display text-h2 ${tone}`}>{value}</p>
    </div>
  );
}

function LinkRow({ link, now }: { link: DisplayLink; now: number }) {
  const { record, status, opensCount, maxOpens, expiresAt } = link;
  return (
    <tr className="border-outline-variant/60 border-t transition-colors hover:bg-surface-container-high/40">
      <td className="px-4 py-4 align-top">
        <StatusChip status={status} />
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex flex-col gap-1">
          <span className="text-body-md text-on-surface">
            {record.label ?? <span className="font-mono text-mono-code">{record.id}</span>}
          </span>
          <span className="font-mono text-label-sm text-on-surface-variant">
            {truncateFingerprint(record.recipientFingerprint, 3)}
          </span>
        </div>
      </td>
      <td className="px-4 py-4 align-top text-body-md text-on-surface-variant">
        {formatDate(record.createdAt)}
      </td>
      <td className="px-4 py-4 align-top text-body-md text-on-surface-variant">
        {expiresInLabel(expiresAt, now)}
      </td>
      <td className="px-4 py-4 align-top text-body-md text-on-surface-variant">
        {opensLabel(opensCount, maxOpens)}
      </td>
      <td className="px-4 py-4 align-top">
        <div className="flex items-center justify-end gap-4">
          {/* Prefer the server-returned url; fall back to the constant only for legacy records. */}
          <CopyLinkButton url={record.url ?? secureLinkUrl(record.id)} />
          <Link
            href={`/links/details?id=${encodeURIComponent(record.id)}`}
            aria-label="Open link details"
            className="text-on-surface-variant transition-colors hover:text-primary"
          >
            <MaterialIcon name="chevron_right" size={20} />
          </Link>
        </div>
      </td>
    </tr>
  );
}

export function LinksListScreen() {
  const { links, loading, error, refresh } = useSentLinks();
  const [filter, setFilter] = useState<Filter>("all");
  const now = Date.now();

  const stats = useMemo(() => {
    let active = 0;
    let expiring = 0;
    let revoked = 0;
    let inert = 0;
    for (const l of links) {
      if (l.status === "active") active++;
      else if (l.status === "expiring") expiring++;
      else if (l.status === "revoked") revoked++;
      else inert++;
    }
    return { active: active + expiring, expiring, revoked, inert };
  }, [links]);

  const visible = links.filter((l) => matchesFilter(l.status, filter));

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="space-y-1">
          <h1 className="font-display text-h1 text-on-surface">Secure Links</h1>
          <p className="text-body-md text-on-surface-variant">
            Track and manage the encrypted links you've created.
          </p>
        </div>
        <Link
          href="/new"
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-5 py-3 text-label-sm uppercase tracking-widest text-on-primary transition-opacity hover:opacity-90"
        >
          <MaterialIcon name="add" size={18} />
          New message
        </Link>
      </header>

      <section className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Active" value={stats.active} tone="text-on-surface" />
        <StatCard label="Expiring soon" value={stats.expiring} tone="text-warning" />
        <StatCard label="Inactive" value={stats.inert} tone="text-on-surface-variant" />
        <StatCard label="Revoked" value={stats.revoked} tone="text-error" />
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => setFilter(f.value)}
            aria-pressed={filter === f.value}
            className={`rounded-full border px-4 py-1.5 text-label-sm uppercase tracking-widest transition-colors ${
              filter === f.value
                ? "border-primary bg-primary-container/15 text-primary"
                : "border-outline-variant text-on-surface-variant hover:bg-surface-container-high"
            }`}
          >
            {f.label}
          </button>
        ))}
        <button
          type="button"
          onClick={() => void refresh()}
          aria-label="Refresh"
          className="ml-auto inline-flex items-center gap-1 rounded-full border border-outline-variant px-4 py-1.5 text-label-sm uppercase tracking-widest text-on-surface-variant transition-colors hover:bg-surface-container-high"
        >
          <MaterialIcon name="refresh" size={16} />
          Refresh
        </button>
      </div>

      {loading ? (
        <p className="py-16 text-center text-body-md text-on-surface-variant">
          Loading your secure links…
        </p>
      ) : error ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container p-8 text-center">
          <p className="text-body-md text-on-surface-variant">
            Couldn't load your links from this device. Try again.
          </p>
        </div>
      ) : links.length === 0 ? (
        <div className="rounded-xl border border-outline-variant bg-surface-container p-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
            <MaterialIcon name="link" />
          </div>
          <h2 className="font-display text-h2 text-on-surface">No secure links yet</h2>
          <p className="mt-2 text-body-md text-on-surface-variant">
            Create one from New Message and it'll show up here.
          </p>
        </div>
      ) : (
        <section className="overflow-hidden rounded-xl border border-outline-variant bg-surface-container">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="bg-surface-container-high/50">
                  <th className="px-4 py-3 text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Status
                  </th>
                  <th className="px-4 py-3 text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Recipient
                  </th>
                  <th className="px-4 py-3 text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Created
                  </th>
                  <th className="px-4 py-3 text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Expiry
                  </th>
                  <th className="px-4 py-3 text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Usage
                  </th>
                  <th className="px-4 py-3 text-right text-label-sm uppercase tracking-widest text-on-surface-variant">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {visible.map((link) => (
                  <LinkRow key={link.record.id} link={link} now={now} />
                ))}
              </tbody>
            </table>
          </div>
          {visible.length === 0 ? (
            <p className="px-4 py-8 text-center text-body-md text-on-surface-variant">
              No links match this filter.
            </p>
          ) : null}
        </section>
      )}
    </div>
  );
}
