ALTER TYPE "CoinTransactionType" ADD VALUE 'STRIPE_PURCHASE';
CREATE TABLE "ShopPurchase" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "stripeSessionId" TEXT,
  "productId" TEXT NOT NULL,
  "productName" TEXT NOT NULL,
  "amountPence" INTEGER NOT NULL,
  "coins" INTEGER NOT NULL,
  "packs" INTEGER NOT NULL,
  "packKind" TEXT NOT NULL,
  "setName" TEXT,
  "fulfilledAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShopPurchase_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ShopPurchase_stripeSessionId_key" ON "ShopPurchase"("stripeSessionId");
CREATE INDEX "ShopPurchase_userId_createdAt_idx" ON "ShopPurchase"("userId", "createdAt");
ALTER TABLE "ShopPurchase" ADD CONSTRAINT "ShopPurchase_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "EarnedPack" ALTER COLUMN "draftPodId" DROP NOT NULL;
ALTER TABLE "EarnedPack" ADD COLUMN "purchaseId" TEXT;
ALTER TABLE "EarnedPack" ADD COLUMN "packKind" TEXT NOT NULL DEFAULT 'NORMAL';
CREATE UNIQUE INDEX "EarnedPack_purchaseId_number_key" ON "EarnedPack"("purchaseId", "number");
ALTER TABLE "EarnedPack" ADD CONSTRAINT "EarnedPack_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "ShopPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
