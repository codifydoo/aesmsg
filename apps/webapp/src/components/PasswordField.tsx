"use client";

import type { ChangeEvent } from "react";
import { useId } from "react";

export interface PasswordFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Inline error message; when set, the field is styled as invalid. */
  error?: string | undefined;
  /** Native autocomplete hint (e.g. "new-password" | "current-password"). */
  autoComplete?: string;
  onBlur?: () => void;
}

/**
 * Label + masked password input with an error slot. Presentational only; built from
 * design-token utilities (no hardcoded colors/spacing). Not general-purpose text — the mono
 * font is never used here.
 */
export function PasswordField({
  label,
  value,
  onChange,
  placeholder,
  error,
  autoComplete = "new-password",
  onBlur,
}: PasswordFieldProps) {
  const id = useId();
  const errorId = `${id}-error`;
  return (
    <label htmlFor={id} className="block space-y-2">
      <span className="block text-label-sm uppercase tracking-widest text-on-surface-variant">
        {label}
      </span>
      <input
        id={id}
        type="password"
        value={value}
        autoComplete={autoComplete}
        placeholder={placeholder}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
        onBlur={onBlur}
        className={`w-full rounded-lg border bg-surface-container-low px-4 py-3 text-body-md text-on-surface transition-colors placeholder:text-on-surface-variant focus:outline-none ${
          error ? "border-error focus:border-error" : "border-outline-variant focus:border-primary"
        }`}
      />
      {error ? (
        <span id={errorId} className="block text-label-sm text-error">
          {error}
        </span>
      ) : null}
    </label>
  );
}
