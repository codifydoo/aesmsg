"use client";

import { MaterialIcon } from "@aesmsg/ui";
import type { ReactNode } from "react";

export interface PrimaryButtonProps {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  /** Leading Material Symbol ligature name. */
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
}

/**
 * Full-width gradient primary action, translated from the set-passphrase mockup to design-token
 * colors and numeric spacing. Depth comes from the token gradient + a 1px-free luminance step, not
 * a hardcoded drop shadow (per the design rules). While `loading`, it shows a spinner and is
 * non-interactive.
 */
export function PrimaryButton({
  children,
  onClick,
  type = "button",
  icon,
  loading = false,
  disabled = false,
}: PrimaryButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <button
      type={type === "submit" ? "submit" : "button"}
      onClick={onClick}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      className="flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-primary to-primary-container font-display font-semibold text-on-primary-container transition-all active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50"
    >
      {loading ? (
        <MaterialIcon name="progress_activity" size={20} className="animate-spin" />
      ) : icon ? (
        <MaterialIcon name={icon} size={20} />
      ) : null}
      <span>{children}</span>
    </button>
  );
}
