CREATE TABLE "UserCardStyle" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "styleKey" TEXT NOT NULL,
  "purchaseId" TEXT NOT NULL,
  "equipped" BOOLEAN NOT NULL DEFAULT true,
  "unlockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserCardStyle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserCardStyle_userId_styleKey_key" ON "UserCardStyle"("userId", "styleKey");
CREATE INDEX "UserCardStyle_userId_cardId_idx" ON "UserCardStyle"("userId", "cardId");
ALTER TABLE "UserCardStyle" ADD CONSTRAINT "UserCardStyle_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserCardStyle" ADD CONSTRAINT "UserCardStyle_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "Card"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "UserCardStyle" ADD CONSTRAINT "UserCardStyle_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "ShopPurchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
-- Honor existing customers who already paid for the qualifying live bundle.
INSERT INTO "UserCardStyle" ("id", "userId", "cardId", "styleKey", "purchaseId", "unlockedAt")
SELECT DISTINCT ON (p."userId") 'style_' || p."userId" || '_golden_coins', p."userId", c."id",
  'cathedral-pergrines-golden-coins', p."id", p."fulfilledAt"
FROM "ShopPurchase" p CROSS JOIN "Card" c
WHERE p."productId" = 'coins-50000' AND p."fulfilledAt" IS NOT NULL
  AND p."stripeSessionId" LIKE 'cs_live_%' AND c."slug" = 'cathedral-pergrines'
ORDER BY p."userId", p."createdAt";
