import { describe, expect, it } from "vitest";
import { CHRISTMAS_REWARDS, christmasStatus, christmasClaimError } from "./christmas-catalog";

describe("Christmas calendar timing and progression", () => {
  it("opens at exactly December 1 midnight GMT", () => {
    expect(christmasStatus(new Date("2026-11-30T23:59:59.999Z")).phase).toBe("upcoming");
    expect(christmasStatus(new Date("2026-12-01T00:00:00Z"))).toEqual({ phase: "active", unlockedDay: 1 });
    expect(christmasClaimError(1, new Date("2026-11-30T23:59:59Z"))).toBeTruthy();
    expect(christmasClaimError(1, new Date("2026-12-01T00:00:00Z"))).toBeNull();
  });
  it("uses GMT midnight rather than the player's local date", () => {
    expect(christmasClaimError(2, new Date("2026-12-02T00:30:00+01:00"))).toBeTruthy();
    expect(christmasClaimError(2, new Date("2026-12-02T00:00:00Z"))).toBeNull();
  });
  it("allows catch-up through December 31 and closes at January 1", () => {
    expect(christmasClaimError(1, new Date("2026-12-31T23:59:59Z"))).toBeNull();
    expect(christmasClaimError(25, new Date("2026-12-24T23:59:59Z"))).toBeTruthy();
    expect(christmasClaimError(25, new Date("2026-12-25T00:00:00Z"))).toBeNull();
    expect(christmasClaimError(25, new Date("2027-01-01T00:00:00Z"))).toBeTruthy();
  });
  it("rejects invalid door numbers", () => {
    for (const day of [0, -1, 26, 1.5, NaN, Infinity]) expect(christmasClaimError(day, new Date("2026-12-25T00:00:00Z"))).toBeTruthy();
  });
  it("increases coins every day, never reduces packs, and reserves the final card", () => {
    expect(CHRISTMAS_REWARDS).toHaveLength(25);
    expect(CHRISTMAS_REWARDS.reduce((sum, reward) => sum + reward.coins, 0)).toBe(30000);
    expect(CHRISTMAS_REWARDS.reduce((sum, reward) => sum + reward.packs, 0)).toBe(16);
    for (let i = 1; i < 25; i++) {
      expect(CHRISTMAS_REWARDS[i].coins).toBeGreaterThan(CHRISTMAS_REWARDS[i - 1].coins);
      expect(CHRISTMAS_REWARDS[i].packs).toBeGreaterThanOrEqual(CHRISTMAS_REWARDS[i - 1].packs);
    }
    expect(CHRISTMAS_REWARDS.filter(reward => reward.style).map(reward => reward.day)).toEqual([5, 10, 15, 20]);
    expect(CHRISTMAS_REWARDS.filter(reward => reward.finalCard).map(reward => reward.day)).toEqual([25]);
  });
});
