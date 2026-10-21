import { prisma } from "./prisma";
import type { Prisma } from "@/generated/prisma/client";
import { creditCoins } from "./coins";

export const DAILY_TASKS = [
  { key: "check-in", name: "Daily check-in", description: "Drop by and collect your daily gift.", target: 1, reward: 1000, activity: "checkIn", href: "/daily-tasks" },
  { key: "play-one", name: "Warm up", description: "Finish 1 digital match. Wins, losses and bot matches count.", target: 1, reward: 1500, activity: "matches", href: "/play/digital" },
  { key: "play-three", name: "Keep playing", description: "Finish 3 digital matches. Bot matches count too.", target: 3, reward: 2500, activity: "matches", href: "/play/digital" },
  { key: "win-one", name: "Victory bonus", description: "Win 1 digital match against a player or a bot.", target: 1, reward: 2000, activity: "wins", href: "/play/digital" },
  { key: "open-pack", name: "Fresh cards", description: "Open 1 pack from the Store or Your Packs.", target: 1, reward: 1500, activity: "packs", href: "/store" },
] as const;

export function dailyTaskWindow(now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const start = new Date(`${day}T00:00:00.000Z`);
  return { day, start, end: new Date(start.getTime() + 86_400_000) };
}

async function dailyProgress(db: Prisma.TransactionClient, userId: string, window: ReturnType<typeof dailyTaskWindow>) {
  const finishedAt = { gte: window.start, lt: window.end };
  const [matches, wins, packs] = await Promise.all([
    db.digitalMatch.count({ where: { status: "COMPLETED", finishedAt, players: { some: { userId } } } }),
    db.digitalMatch.count({ where: { status: "COMPLETED", finishedAt, winnerId: userId } }),
    db.packOpening.count({ where: { userId, createdAt: { gte: window.start, lt: window.end } } }),
  ]);
  return { checkIn: 1, matches, wins, packs };
}

export async function getDailyTasks(userId: string) {
  const window = dailyTaskWindow();
  const [progress, claims] = await Promise.all([
    dailyProgress(prisma, userId, window),
    prisma.dailyTaskClaim.findMany({ where: { userId, day: window.day }, select: { taskKey: true } }),
  ]);
  return {
    day: window.day,
    tasks: DAILY_TASKS.map(task => ({ ...task, progress: Math.min(progress[task.activity], task.target), claimed: claims.some(claim => claim.taskKey === task.key) })),
  };
}

export async function claimDailyTask(userId: string, taskKey: string, expectedDay: string): Promise<{ error?: string; success?: string }> {
  const task = DAILY_TASKS.find(task => task.key === taskKey);
  if (!task) return { error: "Choose a valid daily task." };
  const window = dailyTaskWindow();
  if (expectedDay !== window.day) return { error: "A new day has started. Refresh to see today's tasks." };

  return prisma.$transaction(async tx => {
    const progress = await dailyProgress(tx, userId, window);
    if (progress[task.activity] < task.target) return { error: "Finish this task before claiming its reward." };
    // The unique constraint arbitrates concurrent requests; the claim and
    // ledger credit commit together, or both roll back.
    const claim = await tx.dailyTaskClaim.createMany({ data: { userId, day: window.day, taskKey }, skipDuplicates: true });
    if (claim.count === 0) return { error: "You've already claimed this reward today." };
    await creditCoins(tx, userId, task.reward, "DAILY_TASK", { day: window.day, taskKey });
    return { success: `Claimed ${task.reward.toLocaleString()} Coins for ${task.name}!` };
  });
}
