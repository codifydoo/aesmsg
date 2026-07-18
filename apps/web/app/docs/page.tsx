import type { Metadata } from "next";
import { DocsScreen } from "@/src/docs/DocsScreen";

export const metadata: Metadata = {
  title: "Documentation — aesmsg",
  description:
    "Learn how aesmsg encrypts locally, shares an opaque link through any channel, and lets only the intended recipient decrypt — with a zero-knowledge backend.",
};

export default function DocsPage() {
  return <DocsScreen />;
}
