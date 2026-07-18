"use client";

import { useEffect, useState } from "react";

// Scroll-spy for the docs page. Observes each section heading element (looked up by id) and returns
// the id of the topmost one currently intersecting the viewport, so the sidebar / TOC can highlight
// the section the reader is on. SSR-safe: defaults to the first id and only touches the DOM after
// mount, guarding environments without window / IntersectionObserver.
export function useActiveHeading(ids: readonly string[]): string {
  const [activeId, setActiveId] = useState(ids[0] ?? "");

  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof IntersectionObserver === "undefined" ||
      ids.length === 0
    ) {
      return;
    }

    // Track which ids are currently intersecting; the active heading is the first such id in
    // document order (which matches the order of `ids`).
    const intersecting = new Set<string>();

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            intersecting.add(entry.target.id);
          } else {
            intersecting.delete(entry.target.id);
          }
        }

        const topmost = ids.find((id) => intersecting.has(id));
        if (topmost) {
          setActiveId(topmost);
        }
      },
      // Pull the top boundary down so a heading activates slightly before it reaches the very top,
      // and cut off the bottom so only the upper portion of the viewport counts.
      { rootMargin: "-80px 0px -70% 0px", threshold: 0 },
    );

    const observed: Element[] = [];
    for (const id of ids) {
      const element = document.getElementById(id);
      if (element) {
        observer.observe(element);
        observed.push(element);
      }
    }

    return () => {
      observer.disconnect();
      observed.length = 0;
    };
  }, [ids]);

  return activeId;
}
