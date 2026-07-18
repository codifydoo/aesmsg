"use client";

import { useContext } from "react";
import { IdentityContext, type IdentityContextValue } from "./identity-context";

/** Access the identity state machine. Throws if used outside <IdentityProvider>. */
export function useIdentity(): IdentityContextValue {
  const ctx = useContext(IdentityContext);
  if (ctx === null) {
    throw new Error("useIdentity must be used within an <IdentityProvider>");
  }
  return ctx;
}
