import type { CiphertextStore } from "../interfaces";
import type { LinkId } from "../types";

export class MemoryCiphertextStore implements CiphertextStore {
  private readonly rows = new Map<LinkId, Uint8Array>();

  async put(id: LinkId, blob: Uint8Array): Promise<void> {
    this.rows.set(id, new Uint8Array(blob));
  }

  async get(id: LinkId): Promise<Uint8Array | null> {
    const row = this.rows.get(id);
    return row ? new Uint8Array(row) : null;
  }

  async delete(id: LinkId): Promise<void> {
    this.rows.delete(id);
  }

  async totalBytes(): Promise<number> {
    // AGGREGATE only (PG-18 / R25): sum the byte length of every blob. Iterates the in-memory map
    // (cheap) and returns a single number — no blob contents leave the store. This is the memory
    // analogue of the Pg `SELECT sum(size) FROM link_ciphertexts`.
    let total = 0;
    for (const blob of this.rows.values()) total += blob.byteLength;
    return total;
  }
}
