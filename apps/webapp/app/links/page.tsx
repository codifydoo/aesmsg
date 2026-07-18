import { AppShell } from "@/src/app-shell/AppShell";
import { Placeholder } from "@/src/app-shell/Placeholder";

export default function LinksPage() {
  return (
    <AppShell>
      <Placeholder
        icon="link"
        title="Secure links"
        body="Managing and revoking the links you've created lands in a later release. For the full flow today, use the aesmsg app."
      />
    </AppShell>
  );
}
