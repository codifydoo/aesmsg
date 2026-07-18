// Whether to show the soft permission-priming sheet. Only when the OS permission is still
// undetermined (so we have not yet shown the system dialog) AND we have not already primed once.
// A denied or granted status both mean "don't ask again here".

export type PermissionStatus = "granted" | "denied" | "undetermined";

export function shouldPrimeNotifications(input: {
  permission: PermissionStatus;
  alreadyPrimed: boolean;
}): boolean {
  return input.permission === "undetermined" && !input.alreadyPrimed;
}
