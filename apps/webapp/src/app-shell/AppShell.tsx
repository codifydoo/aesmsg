"use client";

import { Logo, MaterialIcon } from "@aesmsg/ui";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { isActive, NAV_ITEMS } from "./nav-items";

function NavLinks({ pathname, onNavigate }: { pathname: string; onNavigate?: () => void }) {
  return (
    <nav aria-label="Primary" className="flex flex-col gap-1">
      {NAV_ITEMS.map((item) => {
        const active = isActive(item.href, pathname);
        return (
          <Link
            key={item.href}
            href={item.href}
            {...(onNavigate ? { onClick: onNavigate } : {})}
            aria-current={active ? "page" : undefined}
            className={`flex items-center gap-3 px-4 py-3 rounded-md text-label-sm uppercase tracking-widest transition-colors ${
              active
                ? "text-primary bg-primary-container/15 border-r-2 border-primary"
                : "text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface"
            }`}
          >
            <MaterialIcon name={item.icon} filled={active} />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="min-h-dvh">
      {/* Desktop side nav */}
      <aside className="hidden md:flex flex-col fixed left-0 top-0 h-dvh w-64 bg-surface-container-low border-r border-outline-variant py-8 z-40">
        <div className="px-6 mb-10">
          <Logo variant="lockup" tone="ink" size={22} />
          <p className="mt-2 text-label-sm uppercase tracking-widest text-primary">
            Encrypted workspace
          </p>
        </div>
        <div className="flex-1 px-2 overflow-y-auto">
          <NavLinks pathname={pathname} />
        </div>
        <div className="px-4 pt-4 mt-auto border-t border-outline-variant">
          <Link
            href="/new"
            className="flex items-center justify-center gap-2 w-full py-3 rounded-md bg-primary text-on-primary text-label-sm uppercase tracking-widest transition-opacity hover:opacity-90"
          >
            <MaterialIcon name="add_box" size={20} />
            <span>New message</span>
          </Link>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="md:hidden fixed top-0 inset-x-0 flex items-center justify-between px-4 py-3 bg-surface/90 border-b border-outline-variant backdrop-blur-xl z-50">
        <Logo variant="lockup" tone="ink" size={20} />
        <button
          type="button"
          aria-label={mobileOpen ? "Close navigation" : "Open navigation"}
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen((open) => !open)}
          className="flex items-center justify-center w-10 h-10 rounded-md text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high transition-colors"
        >
          <MaterialIcon name={mobileOpen ? "close" : "menu"} />
        </button>
      </header>

      {/* Mobile nav sheet */}
      {mobileOpen ? (
        <div className="md:hidden fixed top-16 inset-x-0 bottom-0 bg-surface-container-low border-b border-outline-variant px-2 py-4 overflow-y-auto z-40">
          <NavLinks pathname={pathname} onNavigate={() => setMobileOpen(false)} />
        </div>
      ) : null}

      {/* Routed content */}
      <main className="md:ml-64 pt-20 md:pt-8 px-4 md:px-8 pb-16">
        <div className="max-w-5xl mx-auto">{children}</div>
      </main>
    </div>
  );
}
