"use client";

import { Icon } from "@/src/components/Icon";
import { Reveal, SectionHead, SHELL } from "./primitives";

const STEPS = [
  {
    n: "01",
    label: "ENCRYPT LOCALLY",
    icon: "enhanced_encryption",
    body: "Your message and files are encrypted on your device with AES-256-GCM before anything is uploaded. Plaintext never leaves you.",
    extra: null,
  },
  {
    n: "02",
    label: "SHARE ANYWHERE",
    icon: "send",
    body: "Paste the link into Slack, WhatsApp, iMessage, or email. The channel only ever sees an opaque link.",
    extra: "channels",
  },
  {
    n: "03",
    label: "RECIPIENT DECRYPTS",
    icon: "key",
    body: "Only the recipient's private key — which never leaves their device — can open it. Wrong key, no decryption.",
    extra: null,
  },
] as const;

const CHANNELS = [
  { icon: "forum", name: "Slack" },
  { icon: "chat", name: "WhatsApp" },
  { icon: "alternate_email", name: "Email" },
] as const;

export function Process() {
  return (
    <section id="how" style={{ position: "relative" }}>
      <div className={SHELL} style={{ paddingTop: 96, paddingBottom: 56 }}>
        <SectionHead
          eyebrow="How it works"
          title="Three steps, end to end."
          sub="A privacy layer over the channels you already use — not another chat app to move your contacts into."
        />
        <div style={{ position: "relative", marginTop: 56 }}>
          {/* connector line across the top of the icon row (desktop) */}
          <div
            aria-hidden="true"
            className="connector hidden md:block"
            style={{ position: "absolute", top: 27, left: "16.66%", right: "16.66%", height: 1 }}
          />
          <div
            style={{
              display: "grid",
              gap: 28,
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {STEPS.map((s, i) => (
              <Reveal key={s.n} delay={i * 90}>
                <div style={{ position: "relative" }}>
                  <div
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: 14,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--sc-low)",
                      border: "1px solid var(--outline-v)",
                      position: "relative",
                      zIndex: 1,
                    }}
                  >
                    <Icon
                      name={s.icon}
                      size={26}
                      weight={250}
                      style={{ color: "var(--primary)" }}
                    />
                  </div>
                  <div
                    className="font-mono"
                    style={{
                      marginTop: 22,
                      fontSize: 12.5,
                      letterSpacing: "0.1em",
                      color: "var(--outline)",
                    }}
                  >
                    <span style={{ color: "var(--primary)" }}>{s.n}</span>&nbsp;·&nbsp;{s.label}
                  </div>
                  <p
                    style={{
                      margin: "12px 0 0",
                      fontSize: 15.5,
                      lineHeight: 1.62,
                      color: "var(--on-var)",
                      maxWidth: 320,
                      textWrap: "pretty",
                    }}
                  >
                    {s.body}
                  </p>
                  {s.extra === "channels" && (
                    <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
                      {CHANNELS.map((ch) => (
                        <span
                          key={ch.name}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            fontSize: 12.5,
                            color: "var(--on-var)",
                            background: "var(--sc)",
                            border: "1px solid var(--outline-v)",
                            borderRadius: 8,
                            padding: "6px 10px",
                          }}
                        >
                          <Icon
                            name={ch.icon}
                            size={15}
                            weight={300}
                            style={{ color: "var(--secondary)" }}
                          />
                          {ch.name}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
