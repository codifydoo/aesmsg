"use client";

import type { ReactNode } from "react";
import { Icon } from "@/src/components/Icon";
import { Glow, Reveal, SHELL, StatusChip } from "./primitives";

export function Bento() {
  return (
    <section style={{ position: "relative" }}>
      <div className={SHELL} style={{ paddingTop: 56, paddingBottom: 56 }}>
        <div
          style={{ display: "grid", gap: 20, gridTemplateColumns: "1.55fr 1fr" }}
          className="bento-grid"
        >
          {/* large card: zero-knowledge backend */}
          <Reveal>
            <article
              className="matte"
              style={{
                borderRadius: "1.5rem",
                padding: 28,
                height: "100%",
                position: "relative",
                overflow: "hidden",
              }}
            >
              <Glow
                size={360}
                color="rgba(103,80,164,0.20)"
                style={{ bottom: -160, right: -120, filter: "blur(40px)" }}
              />
              <div style={{ position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <h3
                    className="font-display"
                    style={{
                      margin: 0,
                      fontSize: 23,
                      fontWeight: 600,
                      letterSpacing: "-0.02em",
                      color: "var(--on)",
                    }}
                  >
                    Zero-knowledge backend
                  </h3>
                  <StatusChip tone="emerald" icon="verified_user">
                    Protected
                  </StatusChip>
                </div>
                <p
                  style={{
                    margin: "14px 0 0",
                    fontSize: 15.5,
                    lineHeight: 1.6,
                    color: "var(--on-var)",
                    maxWidth: 520,
                    textWrap: "pretty",
                  }}
                >
                  We don't hold the keys. We never see your messages. We can't decrypt your files
                  even if we wanted to.
                </p>
                <CiphertextBlock />
              </div>
            </article>
          </Reveal>

          {/* stacked side cards */}
          <div style={{ display: "grid", gap: 20, gridTemplateRows: "1fr 1fr" }}>
            <Reveal delay={90}>
              <SideCard
                icon="timer"
                title="Self-destruct"
                body="Links expire on a timer — 10m / 1h / 24h / 7d — or after a set number of opens, and can be revoked instantly."
                foot={
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 14 }}>
                    {["10m", "1h", "24h", "7d"].map((t, i) => (
                      <span
                        key={t}
                        className="font-mono"
                        style={{
                          fontSize: 12,
                          padding: "5px 10px",
                          borderRadius: 7,
                          color: i === 2 ? "var(--tertiary)" : "var(--on-var)",
                          background: i === 2 ? "rgba(231,195,101,.10)" : "var(--sc)",
                          border: `1px solid ${i === 2 ? "rgba(231,195,101,.30)" : "var(--outline-v)"}`,
                        }}
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                }
              />
            </Reveal>
            <Reveal delay={160}>
              <SideCard
                icon="fingerprint"
                title="Biometric unlock"
                body="Require Face ID or Touch ID before decryption on mobile."
                foot={
                  <div
                    style={{
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 9,
                      marginTop: 14,
                      padding: "9px 13px",
                      borderRadius: 10,
                      background: "var(--sc)",
                      border: "1px solid var(--outline-v)",
                    }}
                  >
                    <Icon name="face" size={20} weight={250} style={{ color: "var(--primary)" }} />
                    <span style={{ fontSize: 13.5, color: "var(--on-var)" }}>
                      Face ID required to open
                    </span>
                  </div>
                }
              />
            </Reveal>
          </div>
        </div>
      </div>
    </section>
  );
}

function SideCard({
  icon,
  title,
  body,
  foot,
}: {
  icon: string;
  title: string;
  body: string;
  foot: ReactNode;
}) {
  return (
    <article
      className="matte"
      style={{
        borderRadius: "1rem",
        padding: 22,
        height: "100%",
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
        <span
          style={{
            width: 38,
            height: 38,
            borderRadius: 10,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "var(--sc)",
            border: "1px solid var(--outline-v)",
          }}
        >
          <Icon name={icon} size={20} weight={250} style={{ color: "var(--primary)" }} />
        </span>
        <h3
          className="font-display"
          style={{
            margin: 0,
            fontSize: 18,
            fontWeight: 600,
            letterSpacing: "-0.015em",
            color: "var(--on)",
          }}
        >
          {title}
        </h3>
      </div>
      <p
        style={{
          margin: "13px 0 0",
          fontSize: 14.5,
          lineHeight: 1.58,
          color: "var(--on-var)",
          textWrap: "pretty",
        }}
      >
        {body}
      </p>
      {foot}
    </article>
  );
}

/* fake ciphertext terminal block */
function CiphertextBlock() {
  const dots = [
    { id: "a", c: "#494551" },
    { id: "b", c: "#494551" },
    { id: "c", c: "#6750a4" },
  ];
  const payload = [
    "eyJ2IjoyLCJhbGciOiJBMjU2R0NNIn0.",
    "q7Xt9Pn2KdVa0sR4mLwZ1cYf6hBgUe3oNjQ8tD5xWpA",
    "iv:5f3c1a9e7b2d804662e0  tag:9c41fb7a0e8d",
    "kx:x25519:3Qm…7Yz  •  hkdf-sha256",
  ];
  return (
    <div
      style={{
        marginTop: 22,
        borderRadius: 12,
        overflow: "hidden",
        background: "var(--sc-lowest)",
        border: "1px solid var(--outline-v)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "11px 14px",
          borderBottom: "1px solid var(--outline-v)",
        }}
      >
        <span style={{ display: "flex", gap: 6 }}>
          {dots.map((d) => (
            <span key={d.id} style={{ width: 9, height: 9, borderRadius: 99, background: d.c }} />
          ))}
        </span>
        <span
          className="font-mono"
          style={{ fontSize: 11.5, color: "var(--outline)", marginLeft: 4 }}
        >
          ciphertext.bin · 4.2 KB
        </span>
        <span style={{ marginLeft: "auto" }}>
          <StatusChip tone="emerald" icon="lock">
            AES-256-GCM
          </StatusChip>
        </span>
      </div>
      <pre
        className="font-mono"
        style={{
          margin: 0,
          padding: "16px 16px",
          fontSize: 12.5,
          lineHeight: 1.85,
          color: "var(--on-var)",
          overflowX: "auto",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
        }}
      >
        {payload.map((l, i) => (
          <span
            key={l}
            style={{
              display: "block",
              color: i === 2 || i === 3 ? "var(--outline)" : "var(--secondary)",
            }}
          >
            {l}
          </span>
        ))}
      </pre>
    </div>
  );
}
