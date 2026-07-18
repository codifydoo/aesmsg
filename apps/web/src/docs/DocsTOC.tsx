"use client";

import { type MouseEvent, useCallback } from "react";
import { DOC_SECTIONS } from "@/src/docs/sections";
import { useActiveHeading } from "@/src/docs/use-active-heading";

// Stable module-level list of section ids so the `useActiveHeading` dependency never changes
// identity across renders (the hook re-subscribes its IntersectionObserver whenever `ids` does).
const SECTION_IDS = DOC_SECTIONS.map((section) => section.id);

// Right-rail "On this page" table of contents. Mirrors the <aside class="...w-56..."> in
// all_design_screens/docs_aesmsg/code.html: a sticky list of section links, with the section the
// reader is currently viewing highlighted via the scroll-spy hook. Hidden below the xl breakpoint.
export function DocsTOC() {
  const activeId = useActiveHeading(SECTION_IDS);

  const handleClick = useCallback((event: MouseEvent<HTMLAnchorElement>, id: string) => {
    const target = document.getElementById(id);
    if (!target) {
      return;
    }
    event.preventDefault();
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  return (
    <aside className="hidden xl:block w-56 shrink-0">
      <div className="sticky top-16 py-8 pl-4">
        <div className="text-[11px] font-semibold uppercase tracking-wider text-on-surface-variant mb-3">
          On this page
        </div>
        <nav aria-label="On this page" className="space-y-2 text-[13px]">
          {DOC_SECTIONS.map((section) => {
            const isActive = section.id === activeId;
            return (
              <a
                key={section.id}
                href={`#${section.id}`}
                aria-current={isActive ? "location" : undefined}
                onClick={(event) => handleClick(event, section.id)}
                className={`block transition-colors ${
                  isActive ? "text-primary" : "text-on-surface-variant hover:text-on-surface"
                }`}
              >
                {section.tocLabel}
              </a>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
