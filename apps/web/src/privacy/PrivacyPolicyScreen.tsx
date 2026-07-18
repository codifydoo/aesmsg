import { Footer } from "@/src/landing/Footer";
import { PrivacyContent } from "@/src/privacy/PrivacyContent";
import { PrivacyHeader } from "@/src/privacy/PrivacyHeader";

// Top-level composition of the Privacy Policy page. SERVER component: it only composes children
// and imports no @aesmsg/ui barrel or client hooks (importing the barrel into a server component
// pulls client hooks into the RSC graph and breaks the build). The slim header, the long-form
// content, and the reused marketing footer are all client leaves. The whole page is wrapped in
// `.landing-root` so the landing Footer resolves its short token aliases (var(--on-var), etc.).
export function PrivacyPolicyScreen() {
  return (
    <div className="landing-root min-h-dvh">
      <PrivacyHeader />
      <PrivacyContent />
      <Footer />
    </div>
  );
}
