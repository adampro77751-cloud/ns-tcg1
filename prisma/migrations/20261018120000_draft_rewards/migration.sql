ALTER TYPE "CoinTransactionType" ADD VALUE 'DRAFT_REWARD';
ALTER TABLE "DraftPod" ADD COLUMN "reward" JSONB;
CREATE TABLE "EarnedPack" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "draftPodId" TEXT NOT NULL,
  "number" INTEGER NOT NULL,
  "setName" TEXT NOT NULL,
  "openedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "EarnedPack_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "EarnedPack_draftPodId_number_key" ON "EarnedPack"("draftPodId", "number");
CREATE INDEX "EarnedPack_userId_openedAt_idx" ON "EarnedPack"("userId", "openedAt");
ALTER TABLE "EarnedPack" ADD CONSTRAINT "EarnedPack_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EarnedPack" ADD CONSTRAINT "EarnedPack_draftPodId_fkey" FOREIGN KEY ("draftPodId") REFERENCES "DraftPod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
