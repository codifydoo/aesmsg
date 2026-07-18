import { AppShell } from "@/src/app-shell/AppShell";
import { Placeholder } from "@/src/app-shell/Placeholder";

export default function NewMessagePage() {
  return (
    <AppShell>
      <Placeholder
        icon="add_box"
        title="New message"
        body="Composing and sealing a message from the browser lands in a later release. For the full sender flow today, use the aesmsg app."
      />
    </AppShell>
  );
}
