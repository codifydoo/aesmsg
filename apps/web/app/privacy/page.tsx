import type { Metadata } from "next";
import { PrivacyPolicyScreen } from "@/src/privacy/PrivacyPolicyScreen";

export const metadata: Metadata = {
  title: "Privacy Policy — aesmsg",
  description:
    "How aesmsg handles data: a zero-knowledge backend that stores only ciphertext and minimal metadata. Plaintext, private keys, and attachments never reach our servers.",
};

export default function PrivacyPage() {
  return <PrivacyPolicyScreen />;
}
