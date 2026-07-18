import { AppShell } from "@/src/app-shell/AppShell";
import { Placeholder } from "@/src/app-shell/Placeholder";

export default function ReaderPage() {
  return (
    <AppShell>
      <Placeholder
        icon="lock"
        title="Secure reader"
        body="Opening a secure link and decrypting it in the browser lands in a later release. Ciphertext is only ever fetched on an explicit action — never by a link preview."
      />
    </AppShell>
  );
}
