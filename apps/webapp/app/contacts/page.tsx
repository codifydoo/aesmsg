import { AppShell } from "@/src/app-shell/AppShell";
import { Placeholder } from "@/src/app-shell/Placeholder";

export default function ContactsPage() {
  return (
    <AppShell>
      <Placeholder
        icon="group"
        title="Contacts"
        body="A verified contact directory with fingerprint verification lands in a later release. For the full flow today, use the aesmsg app."
      />
    </AppShell>
  );
}
