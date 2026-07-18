import { Footer } from "@/src/landing/Footer";
import { TermsContent } from "@/src/terms/TermsContent";
import { TermsHeader } from "@/src/terms/TermsHeader";

// Top-level composition of the Terms of Use page. SERVER component: it only composes children
// and imports no @aesmsg/ui barrel or client hooks (importing the barrel into a server component
// pulls client hooks into the RSC graph and breaks the build). The slim header, the long-form
// content, and the reused marketing footer are all client leaves. The whole page is wrapped in
// `.landing-root` so the landing Footer resolves its short token aliases (var(--on-var), etc.).
export function TermsOfUseScreen() {
  return (
    <div className="landing-root min-h-dvh">
      <TermsHeader />
      <TermsContent />
      <Footer />
    </div>
  );
}
