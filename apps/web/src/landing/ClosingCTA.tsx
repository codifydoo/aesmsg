"use client";

import { Logo } from "@aesmsg/ui";
import { Btn, Glow, Reveal, SHELL } from "./primitives";
import { useStoreUrl } from "./use-store-url";

export function ClosingCTA() {
  const storeUrl = useStoreUrl();
  return (
    <section id="get" style={{ position: "relative" }}>
      <div className={SHELL} style={{ paddingTop: 24, paddingBottom: 96 }}>
        <Reveal>
          <div
            className="glass"
            style={{
              borderRadius: "1.5rem",
              padding: "clamp(36px, 6vw, 72px)",
              position: "relative",
              overflow: "hidden",
              textAlign: "center",
            }}
          >
            <Glow
              size={520}
              color="rgba(103,80,164,0.34)"
              style={{ top: -220, left: -120, filter: "blur(34px)" }}
            />
            <Glow
              size={520}
              color="rgba(207,188,255,0.16)"
              style={{ bottom: -260, right: -120, filter: "blur(40px)" }}
            />
            <div style={{ position: "relative" }}>
              <div style={{ display: "flex", justifyContent: "center" }}>
                <Logo variant="mark" tone="violet" size={40} />
              </div>
              <h2
                className="font-display"
                style={{
                  margin: "24px auto 0",
                  maxWidth: 640,
                  fontSize: "clamp(28px,4vw,42px)",
                  fontWeight: 600,
                  letterSpacing: "-0.03em",
                  lineHeight: 1.1,
                  color: "var(--on)",
                  textWrap: "balance",
                }}
              >
                Ready to encrypt your next message?
              </h2>
              <p
                style={{
                  margin: "18px auto 0",
                  maxWidth: 520,
                  fontSize: 17,
                  lineHeight: 1.6,
                  color: "var(--on-var)",
                  textWrap: "pretty",
                }}
              >
                Join the privacy-conscious professionals protecting their data with aesmsg.
              </p>
              <div
                style={{
                  display: "flex",
                  gap: 14,
                  justifyContent: "center",
                  flexWrap: "wrap",
                  marginTop: 32,
                }}
              >
                <Btn kind="primary" icon="ios_share" href={storeUrl} large>
                  Get the app
                </Btn>
                <Btn kind="glass" iconTrail="arrow_forward" href="/docs" large>
                  Read the docs
                </Btn>
              </div>
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
