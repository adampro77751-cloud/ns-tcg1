// Scripts run via `tsx` (e.g. prisma/seed.ts) never go through
// prisma.config.ts, so .env wouldn't otherwise get loaded outside of the
// Next.js app itself or the Prisma CLI. dotenv doesn't override variables
// that are already set, so this is a safe no-op in contexts where the env
// is already populated (Next.js dev/prod, Prisma CLI).
import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}
