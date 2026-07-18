"use client";

import { DOC_GROUPS, DOC_SECTIONS } from "@/src/docs/sections";
import { useActiveHeading } from "@/src/docs/use-active-heading";

// Left sticky sidebar nav for the docs page. Mirrors the <aside class="...w-64...">
// in all_design_screens/docs_aesmsg/code.html: three grouped sets of text-only links
// (no per-link icons). The active link matches the mockup's `.sidebar-link.active`
// treatment (primary text, faint primary-tinted background, left accent border) and is
// driven by the scroll-spy hook so it tracks the section the reader is on.

const SECTION_IDS = DOC_SECTIONS.map((section) => section.id);

export function DocsSidebar() {
  const activeId = useActiveHeading(SECTION_IDS);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault();
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <aside className="hidden lg:block w-64 shrink-0">
      <nav
        aria-label="Documentation sections"
        className="sticky top-16 max-h-[calc(100vh-4rem)] overflow-y-auto py-8 pr-4"
      >
        {DOC_GROUPS.map((group) => (
          <div key={group} className="mb-6">
            <div className="px-3 mb-2 text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant">
              {group}
            </div>
            <div className="space-y-0.5">
              {DOC_SECTIONS.filter((section) => section.group === group).map((section) => {
                const isActive = section.id === activeId;
                return (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    onClick={(event) => handleClick(event, section.id)}
                    aria-current={isActive ? "location" : undefined}
                    className={`flex items-center gap-2.5 px-3 py-2 rounded-lg border-l-2 text-[13px] transition-colors ${
                      isActive
                        ? "border-primary bg-primary/[0.08] text-primary font-medium"
                        : "border-transparent text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                    }`}
                  >
                    {section.sidebarLabel}
                  </a>
                );
              })}
            </div>
          </div>
        ))}
      </nav>
    </aside>
  );
}
