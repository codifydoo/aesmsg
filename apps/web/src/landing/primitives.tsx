"use client";

import { Logo } from "@aesmsg/ui";
import type { AnchorHTMLAttributes, CSSProperties, ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/src/components/Icon";

/** Centered content column shared by every landing section. */
export const SHELL = "mx-auto w-full max-w-[1200px] px-6 sm:px-8 lg:px-12";

/**
 * Brand lockup — the violet aesmsg mark (from the shared Logo) beside the
 * Geist wordmark in on-surface ink. Two-tone, matching the design's Wordmark.
 */
export function Wordmark({
  markSize = 26,
  text = 22,
  color = "var(--on)",
}: {
  markSize?: number;
  text?: number;
  color?: string;
}) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.42em" }}>
      <Logo variant="mark" tone="violet" size={markSize} />
      <span
        className="font-display"
        style={{ fontWeight: 500, letterSpacing: "-0.035em", fontSize: text, color, lineHeight: 1 }}
      >
        aesmsg
      </span>
    </span>
  );
}

type PillTone = "violet" | "emerald" | "amber";

const PILL_TONES: Record<PillTone, { c: string; bg: string; b: string }> = {
  violet: { c: "var(--primary)", bg: "rgba(207,188,255,.08)", b: "rgba(207,188,255,.26)" },
  emerald: { c: "var(--emerald)", bg: "rgba(111,210,154,.10)", b: "rgba(111,210,154,.30)" },
  amber: { c: "var(--tertiary)", bg: "rgba(231,195,101,.10)", b: "rgba(231,195,101,.30)" },
};

/** Eyebrow / status pill with an optional glowing dot. */
export function Pill({
  children,
  tone = "violet",
  dot = true,
}: {
  children: ReactNode;
  tone?: PillTone;
  dot?: boolean;
}) {
  const t = PILL_TONES[tone];
  return (
    <span
      className="t-eyebrow"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        padding: "7px 14px",
        borderRadius: 9999,
        lineHeight: 1,
        color: t.c,
        background: t.bg,
        border: `1px solid ${t.b}`,
        letterSpacing: "0.10em",
        fontSize: 11.5,
      }}
    >
      {dot && (
        <span
          style={{
            width: 6,
            height: 6,
            borderRadius: 99,
            background: t.c,
            boxShadow: `0 0 8px ${t.c}`,
          }}
        />
      )}
      {children}
    </span>
  );
}

type ChipTone = "emerald" | "amber" | "violet";

const CHIP_TONES: Record<ChipTone, { c: string; bg: string; b: string }> = {
  emerald: { c: "var(--emerald)", bg: "rgba(111,210,154,.10)", b: "rgba(111,210,154,.30)" },
  amber: { c: "var(--tertiary)", bg: "rgba(231,195,101,.10)", b: "rgba(231,195,101,.30)" },
  violet: { c: "var(--primary)", bg: "rgba(207,188,255,.10)", b: "rgba(207,188,255,.26)" },
};

/** Square-ish status chip with an optional leading icon. */
export function StatusChip({
  tone = "emerald",
  icon,
  children,
}: {
  tone?: ChipTone;
  icon?: string;
  children: ReactNode;
}) {
  const t = CHIP_TONES[tone];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 11px",
        borderRadius: 9999,
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: ".04em",
        textTransform: "uppercase",
        lineHeight: 1,
        color: t.c,
        background: t.bg,
        border: `1px solid ${t.b}`,
      }}
    >
      {icon && <Icon name={icon} size={14} weight={300} filled style={{ color: t.c }} />}
      {children}
    </span>
  );
}

type BtnKind = "primary" | "glass";

/**
 * Landing CTA — always an anchor (every CTA drives to the native app or docs).
 * `href` defaults to the closing "#get" section.
 */
export function Btn({
  kind = "primary",
  icon,
  iconTrail,
  children,
  href = "#get",
  large = false,
  className = "",
  ...rest
}: {
  kind?: BtnKind;
  icon?: string;
  iconTrail?: string;
  children: ReactNode;
  href?: string;
  large?: boolean;
  className?: string;
} & Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "color" | "href">) {
  const pad = large ? "15px 26px" : "11px 20px";
  const fs = large ? 16 : 14.5;
  const iconColor = kind === "primary" ? "var(--on-primary)" : undefined;
  return (
    <a
      href={href}
      className={`btn-${kind} ${className}`.trim()}
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 9,
        padding: pad,
        borderRadius: "0.5rem",
        fontSize: fs,
        fontWeight: 600,
        fontFamily: "var(--font-display)",
        letterSpacing: "-0.01em",
        textDecoration: "none",
        cursor: "pointer",
        whiteSpace: "nowrap",
      }}
      {...rest}
    >
      {icon && (
        <Icon
          name={icon}
          size={large ? 20 : 18}
          weight={400}
          filled={kind === "primary"}
          {...(iconColor ? { style: { color: iconColor } } : {})}
        />
      )}
      {children}
      {iconTrail && (
        <Icon
          name={iconTrail}
          size={large ? 19 : 17}
          weight={400}
          {...(iconColor ? { style: { color: iconColor } } : {})}
        />
      )}
    </a>
  );
}

/** Reveal-on-scroll wrapper (IntersectionObserver, with a no-observer fallback). */
export function Reveal({
  children,
  delay = 0,
  className = "",
  style,
}: {
  children: ReactNode;
  delay?: number;
  className?: string;
  style?: CSSProperties;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") {
      setShown(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            setShown(true);
            io.disconnect();
            break;
          }
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      className={`reveal ${shown ? "in" : ""} ${className}`.trim()}
      style={{ transitionDelay: `${delay}ms`, ...style }}
    >
      {children}
    </div>
  );
}

/** Soft radial violet glow. Decorative; absolutely positioned by the caller. */
export function Glow({
  size = 620,
  color = "rgba(103,80,164,0.38)",
  edge = "rgba(103,80,164,0)",
  style,
}: {
  size?: number;
  color?: string;
  edge?: string;
  style?: CSSProperties;
}) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: "absolute",
        width: size,
        height: size,
        borderRadius: "50%",
        background: `radial-gradient(circle at 50% 50%, ${color} 0%, ${edge} 70%)`,
        filter: "blur(20px)",
        pointerEvents: "none",
        ...style,
      }}
    />
  );
}

/** Section eyebrow + heading (+ optional subhead), each revealed in sequence. */
export function SectionHead({
  eyebrow,
  title,
  sub,
  align = "left",
}: {
  eyebrow: string;
  title: string;
  sub?: string;
  align?: "left" | "center";
}) {
  return (
    <div
      style={{
        textAlign: align,
        maxWidth: align === "center" ? 640 : 560,
        marginInline: align === "center" ? "auto" : 0,
      }}
    >
      <Reveal>
        <span className="t-eyebrow" style={{ color: "var(--primary)", letterSpacing: "0.16em" }}>
          {eyebrow}
        </span>
      </Reveal>
      <Reveal delay={60}>
        <h2
          className="font-display"
          style={{
            margin: "14px 0 0",
            fontSize: "clamp(26px,3.4vw,34px)",
            fontWeight: 600,
            letterSpacing: "-0.025em",
            lineHeight: 1.15,
            color: "var(--on)",
          }}
        >
          {title}
        </h2>
      </Reveal>
      {sub && (
        <Reveal delay={120}>
          <p
            style={{
              margin: "16px 0 0",
              fontSize: 16.5,
              lineHeight: 1.6,
              color: "var(--on-var)",
              textWrap: "pretty",
            }}
          >
            {sub}
          </p>
        </Reveal>
      )}
    </div>
  );
}
