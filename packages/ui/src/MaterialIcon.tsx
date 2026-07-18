import type { CSSProperties } from "react";

export interface MaterialIconProps {
  name: string;
  /** FILL axis: false → outlined (0), true → filled (1). */
  filled?: boolean;
  /** wght axis (100–700). Defaults to 400. */
  weight?: number;
  /** GRAD axis (-50–200). Defaults to 0. */
  grade?: number;
  /** Optical size in px. When set, also drives font-size. Defaults to 24 (opsz only). */
  size?: number;
  className?: string;
  /** Extra inline styles (e.g. `color`). Merged last, after the variation settings. */
  style?: CSSProperties;
}

export function MaterialIcon({
  name,
  filled = false,
  weight = 400,
  grade = 0,
  size,
  className = "",
  style,
}: MaterialIconProps) {
  const opticalSize = size ?? 24;
  const computedStyle: CSSProperties = {
    fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' ${weight}, 'GRAD' ${grade}, 'opsz' ${opticalSize}`,
    ...(size != null ? { fontSize: size } : {}),
    ...style,
  };
  return (
    <span className={`material-symbols-outlined ${className}`.trim()} style={computedStyle}>
      {name}
    </span>
  );
}
