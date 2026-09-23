// Coins wallet service — the ONLY place balances change. Every credit/debit
// happens alongside an appended CoinTransaction row (see prisma/schema.prisma's
// "Coins economy" section), so User.coinBalance is always a fast-read cache
// that the ledger could reconstruct, never a value trusted on its own.
//
// Every function here takes a `Db` (either the main `prisma` client or a
// `Prisma.TransactionClient`) so callers can compose a Coins change with
// other writes (granting cards, recording a pack opening) inside one
// atomic transaction — see src/lib/packs.ts and src/lib/match-rewards.ts.
import { prisma } from "@/lib/prisma";
import { Prisma, type CoinTransactionType } from "@/generated/prisma/client";
export { STARTER_COIN_BALANCE, PACK_COST, MATCH_WIN_REWARD } from "@/lib/economy-constants";

export class InsufficientCoinsError extends Error {}

type Db = Prisma.TransactionClient | typeof prisma;

export async function getCoinBalance(userId: string): Promise<number> {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { coinBalance: true } });
  return user?.coinBalance ?? 0;
}

// Adds Coins and appends a ledger row. Amount must be positive — a debit
// is `debitCoins`, not a negative credit, so the sign convention in the
// ledger (`CoinTransaction.amount`) stays unambiguous at every call site.
export async function creditCoins(
  db: Db,
  userId: string,
  amount: number,
  type: CoinTransactionType,
  detail: Prisma.InputJsonValue = {},
): Promise<void> {
  if (amount <= 0) throw new Error("creditCoins amount must be positive.");
  await db.user.update({ where: { id: userId }, data: { coinBalance: { increment: amount } } });
  await db.coinTransaction.create({ data: { userId, type, amount, detail } });
}

// Removes Coins and appends a (negative-amount) ledger row. Uses an atomic
// conditional update — `WHERE coinBalance >= amount` combined with the
// decrement in the SAME statement — rather than a separate read-then-
// write, so two concurrent spends (a double-click, two tabs, a retried
// request) can never both succeed against a balance that only actually
// covers one of them. Throws InsufficientCoinsError (never silently
// clamps or overdraws) if the balance is too low at that exact moment.
export async function debitCoins(
  db: Db,
  userId: string,
  amount: number,
  type: CoinTransactionType,
  detail: Prisma.InputJsonValue = {},
): Promise<void> {
  if (amount <= 0) throw new Error("debitCoins amount must be positive.");
  const result = await db.user.updateMany({
    where: { id: userId, coinBalance: { gte: amount } },
    data: { coinBalance: { decrement: amount } },
  });
  if (result.count === 0) throw new InsufficientCoinsError("Not enough Coins.");
  await db.coinTransaction.create({ data: { userId, type, amount: -amount, detail } });
}

export async function listCoinTransactions(userId: string, limit = 25) {
  return prisma.coinTransaction.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
}
