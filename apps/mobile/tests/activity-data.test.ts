import { describe, expect, it } from "vitest";
import {
  type ActivityEvent,
  activityVisual,
  bucketFor,
  groupActivity,
  relativeTime,
  unreadCount,
} from "@/src/system/activity-data";

// Pure grouping + relative-time logic for the Activity inbox (node-env, no renderer). A fixed
// reference instant is injected everywhere so the labels/buckets are deterministic.

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const NOW = new Date("2026-05-30T14:00:00Z").getTime();

function ev(partial: Partial<ActivityEvent> & { id: string; timestamp: number }): ActivityEvent {
  return {
    kind: "opened",
    title: "Link opened",
    context: "metadata only",
    unread: false,
    ...partial,
  };
}

describe("relativeTime", () => {
  it("renders sub-minute as Now", () => {
    expect(relativeTime(NOW - 30_000, NOW)).toBe("Now");
    expect(relativeTime(NOW, NOW)).toBe("Now");
  });

  it("renders minutes and hours compactly", () => {
    expect(relativeTime(NOW - 12 * MIN, NOW)).toBe("12m");
    expect(relativeTime(NOW - 2 * HOUR, NOW)).toBe("2h");
    expect(relativeTime(NOW - 23 * HOUR, NOW)).toBe("23h");
  });

  it("renders yesterday and day/week counts", () => {
    expect(relativeTime(NOW - 1 * DAY, NOW)).toBe("Yesterday");
    expect(relativeTime(NOW - 3 * DAY, NOW)).toBe("3d");
    expect(relativeTime(NOW - 9 * DAY, NOW)).toBe("1w");
  });

  it("clamps future timestamps (clock skew) to Now", () => {
    expect(relativeTime(NOW + 5 * MIN, NOW)).toBe("Now");
  });
});

describe("bucketFor", () => {
  it("buckets by local calendar day, not a rolling 24h window", () => {
    // 14:00 reference: 2h ago is still Today; 20h ago crosses midnight into Yesterday.
    expect(bucketFor(NOW - 2 * HOUR, NOW)).toBe("Today");
    expect(bucketFor(NOW - 20 * HOUR, NOW)).toBe("Yesterday");
    expect(bucketFor(NOW - 3 * DAY, NOW)).toBe("Earlier");
  });
});

describe("groupActivity", () => {
  it("orders sections Today → Yesterday → Earlier and drops empty ones", () => {
    const events = [
      ev({ id: "a", timestamp: NOW - 2 * HOUR }),
      ev({ id: "b", timestamp: NOW - 3 * DAY }),
    ];
    const groups = groupActivity(events, NOW);
    expect(groups.map((g) => g.bucket)).toEqual(["Today", "Earlier"]);
  });

  it("sorts newest-first within each section", () => {
    const events = [
      ev({ id: "old", timestamp: NOW - 5 * HOUR }),
      ev({ id: "new", timestamp: NOW - 1 * HOUR }),
      ev({ id: "mid", timestamp: NOW - 3 * HOUR }),
    ];
    const today = groupActivity(events, NOW)[0];
    expect(today.events.map((e) => e.id)).toEqual(["new", "mid", "old"]);
  });

  it("returns no groups for an empty feed", () => {
    expect(groupActivity([], NOW)).toEqual([]);
  });
});

describe("activityVisual", () => {
  it("maps caution kinds to amber and informational kinds to violet (never red ambient)", () => {
    expect(activityVisual("expiring").tone).toBe("amber");
    expect(activityVisual("key-changed").tone).toBe("amber");
    expect(activityVisual("opened").tone).toBe("violet");
    expect(activityVisual("revoked").tone).toBe("violet");
  });

  it("never uses the destructive error tone for an ambient event", () => {
    for (const kind of ["opened", "expiring", "key-changed", "revoked"] as const) {
      expect(activityVisual(kind).tone).not.toBe("error");
    }
  });
});

describe("unreadCount", () => {
  it("counts only unread events", () => {
    const events = [
      ev({ id: "a", timestamp: NOW, unread: true }),
      ev({ id: "b", timestamp: NOW, unread: false }),
      ev({ id: "c", timestamp: NOW, unread: true }),
    ];
    expect(unreadCount(events)).toBe(2);
  });

  it("is 0 for the empty feed the screen renders by default", () => {
    // The Activity screen ships with NO fabricated sample events — an empty feed has nothing unread,
    // so the "Mark all read" affordance stays hidden and the designed empty state shows.
    expect(unreadCount([])).toBe(0);
    expect(groupActivity([], NOW)).toEqual([]);
  });
});
