ALTER TABLE "PackOpening" ADD COLUMN "requestKey" TEXT;
CREATE UNIQUE INDEX "PackOpening_userId_requestKey_key" ON "PackOpening"("userId", "requestKey");
ALTER TABLE "UserCardStyle" ALTER COLUMN "purchaseId" DROP NOT NULL,
  ADD COLUMN "packOpeningId" TEXT,
  ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "UserCardStyle" ADD CONSTRAINT "UserCardStyle_packOpeningId_fkey" FOREIGN KEY ("packOpeningId") REFERENCES "PackOpening"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE TABLE "UserSpriteStyle" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "spriteId" TEXT NOT NULL,
  "styleKey" TEXT NOT NULL,
  "packOpeningId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "equipped" BOOLEAN NOT NULL DEFAULT true,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserSpriteStyle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserSpriteStyle_userId_styleKey_key" ON "UserSpriteStyle"("userId", "styleKey");
CREATE INDEX "UserSpriteStyle_userId_spriteId_idx" ON "UserSpriteStyle"("userId", "spriteId");
ALTER TABLE "UserSpriteStyle" ADD CONSTRAINT "UserSpriteStyle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserSpriteStyle" ADD CONSTRAINT "UserSpriteStyle_spriteId_fkey" FOREIGN KEY ("spriteId") REFERENCES "Sprite"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserSpriteStyle" ADD CONSTRAINT "UserSpriteStyle_packOpeningId_fkey" FOREIGN KEY ("packOpeningId") REFERENCES "PackOpening"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
