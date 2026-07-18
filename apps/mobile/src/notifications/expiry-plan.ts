// Pure scheduling decision for the local "expiring soon" reminder: fire one hour before expiry,
// and only if that moment is still in the future. Kept side-effect-free so it is unit-tested in
// Node; the actual scheduling (expo-notifications) lives in the integration layer.

const LEAD_MS = 60 * 60 * 1000; // one hour before expiry

export interface ExpiryReminderPlan {
  fireAtMs: number;
}

export function planExpiryReminder(input: {
  expiresAtMs: number;
  nowMs: number;
}): ExpiryReminderPlan | null {
  const fireAtMs = input.expiresAtMs - LEAD_MS;
  if (fireAtMs <= input.nowMs) return null;
  return { fireAtMs };
}
