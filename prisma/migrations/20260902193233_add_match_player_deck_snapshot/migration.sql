-- CreateTable
CREATE TABLE "MatchPlayerDeckCard" (
    "id" TEXT NOT NULL,
    "matchPlayerId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,

    CONSTRAINT "MatchPlayerDeckCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchPlayerDeckCard_matchPlayerId_idx" ON "MatchPlayerDeckCard"("matchPlayerId");

-- CreateIndex
CREATE INDEX "MatchPlayerDeckCard_cardId_idx" ON "MatchPlayerDeckCard"("cardId");

-- CreateIndex
CREATE UNIQUE INDEX "MatchPlayerDeckCard_matchPlayerId_cardId_key" ON "MatchPlayerDeckCard"("matchPlayerId", "cardId");

-- AddForeignKey
ALTER TABLE "MatchPlayerDeckCard" ADD CONSTRAINT "MatchPlayerDeckCard_matchPlayerId_fkey" FOREIGN KEY ("matchPlayerId") REFERENCES "MatchPlayer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchPlayerDeckCard" ADD CONSTRAINT "MatchPlayerDeckCard_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
