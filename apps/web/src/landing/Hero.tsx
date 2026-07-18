"use client";

import { useState } from "react";
import { Icon } from "@/src/components/Icon";
import { Btn, Glow, Pill, Reveal, SHELL, StatusChip } from "./primitives";
import { useStoreUrl } from "./use-store-url";

/**
 * The opaque secure-link artifact under the hero. This is an illustrative example —
 * a link of the real `aesmsg.com/l/<id>` shape, but not a live message — so the
 * eyebrow labels it "example link". The copy control genuinely writes that sample
 * link to the clipboard (it is not a no-op) to demonstrate the "copy & paste
 * anywhere" flow.
 */
function LinkArtifact() {
  const [copied, setCopied] = useState(false);
  const link = "https://aesmsg.com/l/x7Kp9wQ2mB4nR8tv";
  return (
    <div
      className="glass"
      style={{ borderRadius: "1rem", padding: 18, width: "100%", maxWidth: 560, textAlign: "left" }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 14,
        }}
      >
        <StatusChip tone="emerald" icon="lock">
          Encrypted · ready to share
        </StatusChip>
        <span className="t-eyebrow" style={{ color: "var(--outline)", fontSize: 10.5 }}>
          example link
        </span>
      </div>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          background: "var(--sc-lowest)",
          border: "1px solid var(--outline-v)",
          borderRadius: 10,
          padding: "13px 14px",
        }}
      >
        <Icon name="link" size={18} weight={300} style={{ color: "var(--primary)" }} />
        <code
          className="font-mono"
          style={{
            flex: 1,
            fontSize: 14,
            color: "var(--on-var)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {link}
        </code>
        <button
          type="button"
          onClick={() => {
            // Genuinely copy the example link (not a no-op). Guarded because a
            // headless / permission-restricted context can reject the write.
            void navigator.clipboard?.writeText(link).catch(() => {});
            setCopied(true);
            setTimeout(() => setCopied(false), 1400);
          }}
          aria-label="Copy example secure link"
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            background: "var(--sc-high)",
            border: "1px solid var(--outline-v)",
            color: copied ? "var(--emerald)" : "var(--on)",
            borderRadius: 7,
            padding: "7px 11px",
            fontSize: 12.5,
            fontWeight: 500,
            cursor: "pointer",
            fontFamily: "inherit",
            transition: "color .2s",
          }}
        >
          <Icon name={copied ? "check" : "content_copy"} size={15} weight={300} />
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p
        style={{
          margin: "13px 2px 0",
          fontSize: 12.5,
          color: "var(--outline)",
          display: "flex",
          alignItems: "center",
          gap: 7,
        }}
      >
        <Icon name="schedule" size={15} weight={300} style={{ color: "var(--tertiary)" }} />
        Paste it into Slack, WhatsApp or email — the channel only ever sees this link.
      </p>
    </div>
  );
}

const TRUST_ITEMS = [
  { icon: "lock", label: "AES-256-GCM" },
  { icon: "vpn_key", label: "Keys never leave your device" },
  { icon: "code", label: "Open source · Apache 2.0" },
];

export function Hero() {
  const storeUrl = useStoreUrl();
  return (
    <section id="top" style={{ position: "relative", overflow: "hidden" }}>
      {/* radial violet glow behind */}
      <Glow
        size={900}
        color="rgba(103,80,164,0.34)"
        style={{ top: -340, left: "50%", transform: "translateX(-50%)", filter: "blur(30px)" }}
      />
      <Glow
        size={420}
        color="rgba(207,188,255,0.16)"
        style={{ top: 40, left: "50%", transform: "translateX(-50%)", filter: "blur(50px)" }}
      />
      {/* hairline grid floor */}
      <div
        aria-hidden="true"
        style={{
          position: "absolute",
          inset: 0,
          background: "radial-gradient(circle at 50% 0%, rgba(207,188,255,0.05), transparent 55%)",
          pointerEvents: "none",
        }}
      />
      <div
        className={SHELL}
        style={{ position: "relative", paddingTop: 92, paddingBottom: 96, textAlign: "center" }}
      >
        <Reveal style={{ display: "flex", justifyContent: "center" }}>
          <Pill tone="violet">End-to-end encrypted · zero-knowledge backend</Pill>
        </Reveal>
        <Reveal delay={80}>
          <h1
            className="font-display"
            style={{
              margin: "26px auto 0",
              maxWidth: 880,
              fontWeight: 600,
              fontSize: "clamp(40px, 6.6vw, 72px)",
              lineHeight: 1.04,
              letterSpacing: "-0.04em",
              color: "var(--on)",
              textWrap: "balance",
            }}
          >
            Encrypted links for
            <br className="hidden sm:block" /> private messages and files.
          </h1>
        </Reveal>
        <Reveal delay={150}>
          <p
            style={{
              margin: "24px auto 0",
              maxWidth: 620,
              fontSize: 19,
              lineHeight: 1.6,
              color: "var(--on-var)",
              textWrap: "pretty",
            }}
          >
            Encrypt before you send. Share through any app. Only the intended recipient can open it.
          </p>
        </Reveal>
        <Reveal
          delay={220}
          style={{
            display: "flex",
            gap: 14,
            justifyContent: "center",
            flexWrap: "wrap",
            marginTop: 40,
          }}
        >
          <Btn kind="primary" icon="ios_share" href={storeUrl} large>
            Get the app
          </Btn>
          <Btn kind="glass" iconTrail="arrow_forward" href="#how" large>
            See how it works
          </Btn>
        </Reveal>
        <Reveal
          delay={300}
          style={{
            marginTop: 30,
            display: "flex",
            gap: 22,
            justifyContent: "center",
            flexWrap: "wrap",
            color: "var(--outline)",
          }}
        >
          {TRUST_ITEMS.map((item) => (
            <span
              key={item.label}
              style={{ display: "inline-flex", alignItems: "center", gap: 7, fontSize: 13 }}
            >
              <Icon name={item.icon} size={16} weight={300} style={{ color: "var(--primary)" }} />
              {item.label}
            </span>
          ))}
        </Reveal>

        {/* hero artifact: encrypted link card */}
        <Reveal delay={360} style={{ marginTop: 64, display: "flex", justifyContent: "center" }}>
          <LinkArtifact />
        </Reveal>
      </div>
    </section>
  );
}
