"use client";

import { Icon } from "@/src/components/Icon";
import { useStoreUrl } from "@/src/landing/use-store-url";

export function DocsTopNav() {
  const storeUrl = useStoreUrl();
  return (
    <header className="fixed top-0 inset-x-0 z-50 h-16 border-b border-outline-variant bg-surface/80 backdrop-blur-xl">
      <div className="mx-auto max-w-[1400px] h-full px-4 sm:px-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <a
            href="/"
            aria-label="aesmsg home"
            className="flex items-center gap-2.5 shrink-0 no-underline text-on-surface"
          >
            <div className="grid place-items-center size-9 rounded-xl bg-primary-container">
              <Icon name="lock" className="text-on-primary-container text-[20px]" />
            </div>
            <div className="leading-tight">
              <div className="font-display font-semibold text-[15px] tracking-tight">aesmsg</div>
              <div className="text-[11px] text-on-surface-variant -mt-0.5">Documentation</div>
            </div>
          </a>
          <div className="hidden md:flex items-center gap-1 ml-4 text-[13px] text-on-surface-variant">
            <Icon name="chevron_right" className="text-[16px]" />
            <span>Guides</span>
            <Icon name="chevron_right" className="text-[16px]" />
            <span className="text-on-surface">Getting Started</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/*
            Presentational search affordance mirroring the static mockup. It is
            not yet wired to any search, so it's hidden from assistive tech and
            carries no interactive semantics — it never claims to be a control
            that can't be reached or used.
          */}
          <div
            aria-hidden="true"
            className="hidden sm:flex items-center gap-2 h-9 px-3 rounded-xl bg-surface-container border border-outline-variant text-on-surface-variant text-[13px] w-64"
          >
            <Icon name="search" className="text-[18px]" />
            <span className="flex-1">Search docs...</span>
            <kbd className="text-[11px] px-1.5 py-0.5 rounded bg-surface-container-highest border border-outline-variant">
              ⌘K
            </kbd>
          </div>
          <a
            href={storeUrl}
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-primary text-on-primary text-[13px] font-semibold hover:opacity-90 transition-opacity no-underline focus-visible:outline-2 focus-visible:outline focus-visible:outline-primary focus-visible:outline-offset-2"
          >
            <Icon name="ios_share" filled className="text-[16px]" />
            Get the app
          </a>
        </div>
      </div>
    </header>
  );
}
