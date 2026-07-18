import type { Metadata } from "next";
import { TermsOfUseScreen } from "@/src/terms/TermsOfUseScreen";

export const metadata: Metadata = {
  title: "Terms of Use — aesmsg",
  description:
    "The Terms of Use and End User License Agreement (EULA) for aesmsg, including aesmsg Pro auto-renewable subscriptions and App Store terms.",
};

export default function TermsPage() {
  return <TermsOfUseScreen />;
}
