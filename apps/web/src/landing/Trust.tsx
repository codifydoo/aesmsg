"use client";

import { Icon } from "@/src/components/Icon";
import { Reveal, SectionHead, SHELL } from "./primitives";

const CARDS = [
  {
    icon: "shield_lock",
    title: "Ciphertext only",
    body: "The server stores ciphertext + minimal metadata. Never plaintext, previews, attachments, or your keys.",
  },
  {
    icon: "devices",
    title: "Keys stay on your device",
    body: "Keypairs are generated and held on your device and never leave it, unless you export an encrypted backup.",
  },
  {
    icon: "code_blocks",
    title: "Open source",
    body: "Our cryptography is open source (Apache 2.0) and independently auditable.",
  },
  {
    icon: "timer_off",
    title: "Self-destruct & revoke",
    body: "Set expiry and max opens up front, and purge the ciphertext from the server at any time with one tap.",
  },
] as const;

export function Trust() {
  return (
    <section id="security" style={{ position: "relative" }}>
      <div className={SHELL} style={{ paddingTop: 56, paddingBottom: 80 }}>
        <SectionHead
          eyebrow="Security principles"
          title="Trust built into the architecture."
          sub="Not policy promises — properties of the system. Here's what the server can and can't ever see."
        />
        <div
          style={{
            display: "grid",
            gap: 18,
            gridTemplateColumns: "repeat(auto-fit, minmax(248px, 1fr))",
            marginTop: 48,
          }}
        >
          {CARDS.map((c, i) => (
            <Reveal key={c.title} delay={i * 70}>
              <article
                className="trust-card matte"
                style={{ borderRadius: "1rem", padding: 24, height: "100%" }}
              >
                <span
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: 11,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "var(--sc)",
                    border: "1px solid var(--outline-v)",
                  }}
                >
                  <Icon name={c.icon} size={23} weight={250} style={{ color: "var(--primary)" }} />
                </span>
                <h3
                  className="font-display"
                  style={{
                    margin: "18px 0 0",
                    fontSize: 17.5,
                    fontWeight: 600,
                    letterSpacing: "-0.015em",
                    color: "var(--on)",
                  }}
                >
                  {c.title}
                </h3>
                <p
                  style={{
                    margin: "10px 0 0",
                    fontSize: 14.5,
                    lineHeight: 1.58,
                    color: "var(--on-var)",
                    textWrap: "pretty",
                  }}
                >
                  {c.body}
                </p>
              </article>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
