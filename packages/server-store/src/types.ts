export type LinkId = string & { readonly __linkIdBrand: unique symbol };

export type LinkStatus = "active" | "revoked" | "expired";

export interface LinkMetadata {
  readonly id: LinkId;
  readonly status: LinkStatus;
  /**
   * Creation timestamp. NULL for v2 links (the server no longer persists it — see migration
   * 0002 / the metadata-leakage audit). Legacy v1 rows retain their value because the v1 HPKE
   * AAD binds createdAt and must be reconstructable until the link expires.
   */
  readonly createdAt: Date | null;
  readonly expiresAt: Date;
  /** -1 means unlimited until expiry. Otherwise a positive integer. */
  readonly maxOpens: number;
  readonly opensCount: number;
}
