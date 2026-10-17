ALTER TYPE "CoinTransactionType" ADD VALUE 'DRAFT_ENTRY';

CREATE TYPE "DraftStatus" AS ENUM ('DRAFTING', 'BUILDING', 'PLAYING', 'COMPLETED');

CREATE TABLE "DraftPod" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activeUserId" TEXT,
    "setName" TEXT NOT NULL,
    "status" "DraftStatus" NOT NULL DEFAULT 'DRAFTING',
    "state" JSONB NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "DraftPod_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "DraftPod_activeUserId_key" ON "DraftPod"("activeUserId");
CREATE INDEX "DraftPod_userId_createdAt_idx" ON "DraftPod"("userId", "createdAt");
ALTER TABLE "DraftPod" ADD CONSTRAINT "DraftPod_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "DigitalMatch" ADD COLUMN "draftPodId" TEXT,
    ADD COLUMN "draftRound" INTEGER,
    ADD COLUMN "draftOpponentSeat" INTEGER;
CREATE UNIQUE INDEX "DigitalMatch_draftPodId_draftRound_key" ON "DigitalMatch"("draftPodId", "draftRound");
ALTER TABLE "DigitalMatch" ADD CONSTRAINT "DigitalMatch_draftPodId_fkey" FOREIGN KEY ("draftPodId") REFERENCES "DraftPod"("id") ON DELETE SET NULL ON UPDATE CASCADE;
