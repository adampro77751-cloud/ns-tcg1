-- CreateEnum
CREATE TYPE "DigitalMatchMode" AS ENUM ('ONLINE', 'BOT');

-- CreateEnum
CREATE TYPE "DigitalMatchStatus" AS ENUM ('WAITING', 'READY', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "DigitalMatch" (
    "id" TEXT NOT NULL,
    "joinCode" TEXT NOT NULL,
    "formatId" TEXT NOT NULL,
    "mode" "DigitalMatchMode" NOT NULL,
    "status" "DigitalMatchStatus" NOT NULL DEFAULT 'WAITING',
    "state" JSONB,
    "winnerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "DigitalMatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalMatchPlayer" (
    "id" TEXT NOT NULL,
    "matchId" TEXT NOT NULL,
    "userId" TEXT,
    "isBot" BOOLEAN NOT NULL DEFAULT false,
    "deckId" TEXT,
    "spriteInstanceId" TEXT,
    "ready" BOOLEAN NOT NULL DEFAULT false,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DigitalMatchPlayer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DigitalMatchPlayerDeckCard" (
    "id" TEXT NOT NULL,
    "digitalMatchPlayerId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "DigitalMatchPlayerDeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DigitalMatch_joinCode_key" ON "DigitalMatch"("joinCode");

-- CreateIndex
CREATE INDEX "DigitalMatch_formatId_idx" ON "DigitalMatch"("formatId");

-- CreateIndex
CREATE INDEX "DigitalMatchPlayer_userId_idx" ON "DigitalMatchPlayer"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalMatchPlayer_matchId_userId_key" ON "DigitalMatchPlayer"("matchId", "userId");

-- CreateIndex
CREATE INDEX "DigitalMatchPlayerDeckCard_digitalMatchPlayerId_idx" ON "DigitalMatchPlayerDeckCard"("digitalMatchPlayerId");

-- CreateIndex
CREATE INDEX "DigitalMatchPlayerDeckCard_cardId_idx" ON "DigitalMatchPlayerDeckCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "DigitalMatchPlayerDeckCard_digitalMatchPlayerId_cardId_key" ON "DigitalMatchPlayerDeckCard"("digitalMatchPlayerId", "cardId");

-- AddForeignKey
ALTER TABLE "DigitalMatch" ADD CONSTRAINT "DigitalMatch_formatId_fkey" FOREIGN KEY ("formatId") REFERENCES "Format"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalMatch" ADD CONSTRAINT "DigitalMatch_winnerId_fkey" FOREIGN KEY ("winnerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalMatchPlayer" ADD CONSTRAINT "DigitalMatchPlayer_matchId_fkey" FOREIGN KEY ("matchId") REFERENCES "DigitalMatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalMatchPlayer" ADD CONSTRAINT "DigitalMatchPlayer_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalMatchPlayer" ADD CONSTRAINT "DigitalMatchPlayer_deckId_fkey" FOREIGN KEY ("deckId") REFERENCES "Deck"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalMatchPlayer" ADD CONSTRAINT "DigitalMatchPlayer_spriteInstanceId_fkey" FOREIGN KEY ("spriteInstanceId") REFERENCES "SpriteInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalMatchPlayerDeckCard" ADD CONSTRAINT "DigitalMatchPlayerDeckCard_digitalMatchPlayerId_fkey" FOREIGN KEY ("digitalMatchPlayerId") REFERENCES "DigitalMatchPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DigitalMatchPlayerDeckCard" ADD CONSTRAINT "DigitalMatchPlayerDeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
