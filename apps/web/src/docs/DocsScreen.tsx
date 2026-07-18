import { DocsContent } from "@/src/docs/DocsContent";
import { DocsSidebar } from "@/src/docs/DocsSidebar";
import { DocsTOC } from "@/src/docs/DocsTOC";
import { DocsTopNav } from "@/src/docs/DocsTopNav";

// Top-level composition of the documentation page. Mirrors the outer layout in
// all_design_screens/docs_aesmsg/code.html: a fixed top nav, then a centered max-w-[1400px]
// container offset by the nav height (pt-16), holding a three-column flex row
// [left sidebar | main content | right table of contents] with gap-8. The sidebar is hidden
// below lg and the TOC below xl (handled inside those components). This is a SERVER component:
// it only composes children and imports no @aesmsg/ui or client hooks — the interactivity lives
// inside the four child client components.
export function DocsScreen() {
  return (
    <div className="min-h-screen bg-surface text-on-surface antialiased">
      <DocsTopNav />
      <div className="mx-auto max-w-[1400px] px-4 sm:px-6 pt-16">
        <div className="flex gap-8">
          <DocsSidebar />
          <DocsContent />
          <DocsTOC />
        </div>
      </div>
    </div>
  );
}
