export type LogoVariant = "mark" | "lockup";
export type LogoTone = "violet" | "ink" | "dark" | "currentColor";

export interface LogoProps {
  /** "mark" renders just the ring + bar; "lockup" adds the aesmsg wordmark. */
  variant?: LogoVariant;
  /** Brand color. "currentColor" inherits CSS color, so callers can use text-* utilities. */
  tone?: LogoTone;
  /** Height of the mark in px. The wordmark scales relative to this. Defaults to 24. */
  size?: number;
  /** Optional additional class names for the root element. */
  className?: string;
  /** Accessible label. Defaults to "aesmsg". */
  title?: string;
}

/**
 * The aesmsg brand mark (a stroked ring + vertical bar — a geometric "a"/aperture)
 * and its lockup with the aesmsg wordmark.
 *
 * Geometry mirrors all_design_screens/brand_assets/exports/aesmsg-mark-currentcolor.svg.
 * The wordmark uses Inter 500 with -0.035em tracking, matching aesmsg-lockup-*.svg.
 */
const toneColor: Record<LogoTone, string> = {
  violet: "#cfbcff",
  ink: "#e9e6f0",
  dark: "#2a2533",
  currentColor: "currentColor",
};

export function Logo({
  variant = "lockup",
  tone = "currentColor",
  size = 24,
  className,
  title,
}: LogoProps) {
  const color = toneColor[tone];
  const label = title ?? "aesmsg";

  const mark = (
    <svg
      viewBox="12 16 68 68"
      height={size}
      width={size}
      role="img"
      aria-label={label}
      style={{ display: "block" }}
    >
      <g fill="none" stroke={color} strokeWidth="8" strokeLinecap="butt">
        <circle cx="46" cy="50" r="26" />
        <line x1="72" y1="24" x2="72" y2="76" />
      </g>
    </svg>
  );

  if (variant === "mark") {
    return className ? <span className={className}>{mark}</span> : mark;
  }

  // Lockup: mark + wordmark. The mark box is 68 units tall; the wordmark in the
  // authoritative lockup is ~0.71x the mark height, so derive its font-size from `size`.
  const wordSize = Math.round(size * 0.71);
  const rootClass = ["inline-flex items-center", className].filter(Boolean).join(" ");

  return (
    <span className={rootClass} aria-label={label} role="img">
      <span aria-hidden="true" style={{ display: "inline-flex" }}>
        {mark}
      </span>
      <span
        className="font-sans"
        style={{
          fontWeight: 500,
          letterSpacing: "-0.035em",
          fontSize: wordSize,
          lineHeight: 1,
          color,
          marginLeft: Math.round(size * 0.18),
        }}
      >
        aesmsg
      </span>
    </span>
  );
}
