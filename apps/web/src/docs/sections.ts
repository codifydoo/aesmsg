// Single source of truth for the in-page docs sections. Server-safe: no DOM, no client hooks.
// Mirrors the section order/copy in all_design_screens/docs_aesmsg/code.html. The sidebar groups
// these by `group`; the table of contents (and IntersectionObserver scroll-spy) keys on `id`.

export const DOC_GROUPS = ["Getting Started", "Core Concepts", "Security"] as const;

export type DocGroup = (typeof DOC_GROUPS)[number];

export type DocSection = {
  id: string;
  sidebarLabel: string;
  tocLabel: string;
  group: DocGroup;
};

export const DOC_SECTIONS: readonly DocSection[] = [
  {
    id: "introduction",
    sidebarLabel: "Introduction",
    tocLabel: "What is aesmsg?",
    group: "Getting Started",
  },
  {
    id: "how-it-works",
    sidebarLabel: "How it Works",
    tocLabel: "How it Works",
    group: "Getting Started",
  },
  {
    id: "quickstart",
    sidebarLabel: "Quickstart",
    tocLabel: "Quickstart",
    group: "Getting Started",
  },
  {
    id: "encryption",
    sidebarLabel: "Encryption Model",
    tocLabel: "Encryption Model",
    group: "Core Concepts",
  },
  {
    id: "keys",
    sidebarLabel: "Keys & Identity",
    tocLabel: "Keys & Identity",
    group: "Core Concepts",
  },
  {
    id: "links",
    sidebarLabel: "Secure Links",
    tocLabel: "Secure Links",
    group: "Core Concepts",
  },
  {
    id: "expiry",
    sidebarLabel: "Expiry & Revocation",
    tocLabel: "Expiry & Revocation",
    group: "Core Concepts",
  },
  {
    id: "threat-model",
    sidebarLabel: "Threat Model",
    tocLabel: "Threat Model",
    group: "Security",
  },
  {
    id: "zero-knowledge",
    sidebarLabel: "Zero-Knowledge",
    tocLabel: "Zero-Knowledge",
    group: "Security",
  },
] as const;
