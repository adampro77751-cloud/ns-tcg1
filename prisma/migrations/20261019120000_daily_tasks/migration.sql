ALTER TYPE "CoinTransactionType" ADD VALUE 'DAILY_TASK';

CREATE TABLE "DailyTaskClaim" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "taskKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "DailyTaskClaim_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DailyTaskClaim_userId_day_taskKey_key" ON "DailyTaskClaim"("userId", "day", "taskKey");
ALTER TABLE "DailyTaskClaim" ADD CONSTRAINT "DailyTaskClaim_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
