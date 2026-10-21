import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ matches: vi.fn(), packs: vi.fn(), claims: vi.fn(), insert: vi.fn(), credit: vi.fn(), transaction: vi.fn() }));
vi.mock("./prisma", () => ({ prisma: {
  digitalMatch: { count: mocks.matches }, packOpening: { count: mocks.packs },
  dailyTaskClaim: { findMany: mocks.claims, createMany: mocks.insert }, $transaction: mocks.transaction,
} }));
vi.mock("./coins", () => ({ creditCoins: mocks.credit }));
import { prisma } from "./prisma";
import { claimDailyTask, dailyTaskWindow, getDailyTasks } from "./daily-tasks";

describe("daily tasks", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.matches.mockResolvedValue(0);
    mocks.packs.mockResolvedValue(0);
    mocks.claims.mockResolvedValue([]);
    mocks.insert.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation(fn => fn(prisma));
  });

  it("uses UTC calendar days at the reset boundary", () => {
    const before = dailyTaskWindow(new Date("2026-10-19T23:59:59.999Z"));
    const after = dailyTaskWindow(new Date("2026-10-20T00:00:00Z"));
    expect(before.day).toBe("2026-10-19");
    expect(before.end).toEqual(after.start);
    expect(after.day).toBe("2026-10-20");
  });

  it("offers a free check-in without requiring a match or pack", async () => {
    const result = await claimDailyTask("player", "check-in", dailyTaskWindow().day);
    expect(result.success).toContain("1,000");
    expect(mocks.credit).toHaveBeenCalledWith(prisma, "player", 1000, "DAILY_TASK", { day: dailyTaskWindow().day, taskKey: "check-in" });
  });

  it("does not credit a duplicate claim", async () => {
    mocks.insert.mockResolvedValue({ count: 0 });
    expect((await claimDailyTask("player", "check-in", dailyTaskWindow().day)).error).toContain("already claimed");
    expect(mocks.credit).not.toHaveBeenCalled();
  });

  it("rejects incomplete tasks, unknown keys and stale forms", async () => {
    expect((await claimDailyTask("player", "play-one", dailyTaskWindow().day)).error).toContain("Finish");
    expect((await claimDailyTask("player", "invented", dailyTaskWindow().day)).error).toContain("valid");
    expect((await claimDailyTask("player", "check-in", "2000-01-01")).error).toContain("new day");
    expect(mocks.insert).not.toHaveBeenCalled();
    expect(mocks.credit).not.toHaveBeenCalled();
  });

  it("uses only the player's completed matches and today's openings, with capped progress", async () => {
    mocks.matches.mockResolvedValue(4);
    mocks.packs.mockResolvedValue(2);
    mocks.claims.mockResolvedValue([{ taskKey: "check-in" }]);
    const result = await getDailyTasks("player");
    expect(result.tasks.find(task => task.key === "play-three")?.progress).toBe(3);
    expect(result.tasks[0].claimed).toBe(true);
    expect(result.tasks.reduce((sum, task) => sum + task.reward, 0)).toBe(8500);
    const window = dailyTaskWindow();
    expect(mocks.matches).toHaveBeenCalledWith({ where: { status: "COMPLETED", finishedAt: { gte: window.start, lt: window.end }, players: { some: { userId: "player" } } } });
    expect(mocks.matches).toHaveBeenCalledWith({ where: { status: "COMPLETED", finishedAt: { gte: window.start, lt: window.end }, winnerId: "player" } });
  });
});
