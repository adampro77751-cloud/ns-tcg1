ALTER TYPE "CoinTransactionType" ADD VALUE 'CHRISTMAS_REWARD';
CREATE TABLE "ChristmasClaim" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "year" INTEGER NOT NULL,
  "day" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ChristmasClaim_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ChristmasClaim_day_check" CHECK ("day" BETWEEN 1 AND 25)
);
CREATE UNIQUE INDEX "ChristmasClaim_userId_year_day_key" ON "ChristmasClaim"("userId", "year", "day");
ALTER TABLE "ChristmasClaim" ADD CONSTRAINT "ChristmasClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
