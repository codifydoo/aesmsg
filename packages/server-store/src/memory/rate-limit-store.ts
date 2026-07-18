import type { RateLimitStore } from "../interfaces";

export class MemoryRateLimitStore implements RateLimitStore {
  private readonly windows = new Map<string, number>();

  async incrementAndGet(key: string, windowSeconds: number): Promise<number> {
    const windowFloor = Math.floor(Date.now() / 1000 / windowSeconds) * windowSeconds;
    const windowKey = `${key}:${windowFloor}`;
    const next = (this.windows.get(windowKey) ?? 0) + 1;
    this.windows.set(windowKey, next);
    return next;
  }
}
