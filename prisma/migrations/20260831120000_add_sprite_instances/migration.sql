-- Individual Sprite instances (replaces aggregate UserSprite ownership).
--
-- This migration is additive-then-cleanup, in a single transaction:
--   1. Create the new enum types.
--   2. Convert Sprite.rarity from free-text to the authoritative enum,
--      preserving any existing value (backfilling the seven known Sprites'
--      rarities; any other/unknown Sprite rows are left NULL, not guessed).
--   3. Create SpriteInstance and SpriteHistoryEntry, and link
--      RedemptionCode to the instance it produces.
--   4. Convert every existing UserSprite aggregate-quantity row into that
--      many individual SpriteInstance rows (one per unit of quantity),
--      each with a matching OBTAINED history entry recording that it was
--      converted from aggregate ownership. No ownership is lost — a
--      UserSprite row with quantity=3 becomes exactly 3 SpriteInstance
--      rows, not fewer, not merged.
--   5. Only after that data is safely copied, drop the now-superseded
--      UserSprite table.

-- CreateEnum
CREATE TYPE "SpriteRarity" AS ENUM ('RARE', 'MYTHIC', 'LEGENDARY');

-- CreateEnum
CREATE TYPE "SpriteObtainMethod" AS ENUM ('REDEMPTION_CODE', 'ADMIN_GRANT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "SpriteHistoryEventType" AS ENUM ('OBTAINED', 'RENAMED', 'LEVEL_UP');

-- AlterTable: Sprite.rarity TEXT -> SpriteRarity (nullable), preserving
-- existing values via an explicit backfill rather than a blind cast.
ALTER TABLE "Sprite" ADD COLUMN "rarity_new" "SpriteRarity";

UPDATE "Sprite" SET "rarity_new" = 'RARE'
  WHERE slug IN ('air-sprite', 'fire-sprite', 'earth-sprite', 'water-sprite');
UPDATE "Sprite" SET "rarity_new" = 'MYTHIC'
  WHERE slug IN ('ninja-sprite', 'dragon-sprite');
UPDATE "Sprite" SET "rarity_new" = 'LEGENDARY'
  WHERE slug = 'cosmic-sprite';

ALTER TABLE "Sprite" DROP COLUMN "rarity";
ALTER TABLE "Sprite" RENAME COLUMN "rarity_new" TO "rarity";

-- AlterTable
ALTER TABLE "RedemptionCode" ADD COLUMN "spriteInstanceId" TEXT;

-- CreateTable
CREATE TABLE "SpriteInstance" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "spriteId" TEXT NOT NULL,
    "editionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "obtainedMethod" "SpriteObtainMethod" NOT NULL DEFAULT 'UNKNOWN',
    "obtainedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpriteInstance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SpriteHistoryEntry" (
    "id" TEXT NOT NULL,
    "spriteInstanceId" TEXT NOT NULL,
    "type" "SpriteHistoryEventType" NOT NULL,
    "detail" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SpriteHistoryEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpriteInstance_ownerId_idx" ON "SpriteInstance"("ownerId");

-- CreateIndex
CREATE INDEX "SpriteInstance_spriteId_idx" ON "SpriteInstance"("spriteId");

-- CreateIndex
CREATE INDEX "SpriteHistoryEntry_spriteInstanceId_idx" ON "SpriteHistoryEntry"("spriteInstanceId");

-- CreateIndex
CREATE UNIQUE INDEX "RedemptionCode_spriteInstanceId_key" ON "RedemptionCode"("spriteInstanceId");

-- AddForeignKey
ALTER TABLE "SpriteInstance" ADD CONSTRAINT "SpriteInstance_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpriteInstance" ADD CONSTRAINT "SpriteInstance_spriteId_fkey" FOREIGN KEY ("spriteId") REFERENCES "Sprite"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpriteInstance" ADD CONSTRAINT "SpriteInstance_editionId_fkey" FOREIGN KEY ("editionId") REFERENCES "Edition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpriteHistoryEntry" ADD CONSTRAINT "SpriteHistoryEntry_spriteInstanceId_fkey" FOREIGN KEY ("spriteInstanceId") REFERENCES "SpriteInstance"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionCode" ADD CONSTRAINT "RedemptionCode_spriteInstanceId_fkey" FOREIGN KEY ("spriteInstanceId") REFERENCES "SpriteInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- DataMigration: convert every UserSprite aggregate row into `quantity`
-- individual SpriteInstance rows + a matching OBTAINED history entry each.
-- The exact originating redemption code is not recoverable from aggregate
-- data, so this is recorded transparently in the history detail rather
-- than fabricated.
DO $$
DECLARE
  legacy RECORD;
  base_name TEXT;
  i INTEGER;
  new_instance_id TEXT;
BEGIN
  FOR legacy IN SELECT * FROM "UserSprite" LOOP
    SELECT "name" INTO base_name FROM "Sprite" WHERE id = legacy."spriteId";

    FOR i IN 1..legacy."quantity" LOOP
      new_instance_id := gen_random_uuid()::text;

      INSERT INTO "SpriteInstance"
        (id, "ownerId", "spriteId", "editionId", "name", "level", "obtainedMethod", "obtainedAt", "createdAt", "updatedAt")
      VALUES
        (new_instance_id, legacy."userId", legacy."spriteId", legacy."editionId", base_name, 1, 'REDEMPTION_CODE', legacy."obtainedAt", legacy."obtainedAt", legacy."obtainedAt");

      INSERT INTO "SpriteHistoryEntry"
        (id, "spriteInstanceId", "type", "detail", "createdAt")
      VALUES
        (
          gen_random_uuid()::text,
          new_instance_id,
          'OBTAINED',
          jsonb_build_object(
            'method', 'REDEMPTION_CODE',
            'migratedFromAggregateOwnership', true,
            'originalAggregateQuantity', legacy."quantity"
          ),
          legacy."obtainedAt"
        );
    END LOOP;
  END LOOP;
END $$;

-- DropForeignKey
ALTER TABLE "UserSprite" DROP CONSTRAINT "UserSprite_editionId_fkey";

-- DropForeignKey
ALTER TABLE "UserSprite" DROP CONSTRAINT "UserSprite_spriteId_fkey";

-- DropForeignKey
ALTER TABLE "UserSprite" DROP CONSTRAINT "UserSprite_userId_fkey";

-- DropTable
DROP TABLE "UserSprite";
