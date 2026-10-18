ALTER TYPE "SpriteObtainMethod" ADD VALUE 'PACK_OPENING';

ALTER TABLE "PackOpening" ADD COLUMN "spriteInstanceId" TEXT;
CREATE UNIQUE INDEX "PackOpening_spriteInstanceId_key" ON "PackOpening"("spriteInstanceId");
ALTER TABLE "PackOpening" ADD CONSTRAINT "PackOpening_spriteInstanceId_fkey"
  FOREIGN KEY ("spriteInstanceId") REFERENCES "SpriteInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;

UPDATE "Sprite" SET "image" = '/sprites/' || "slug" || '.png'
WHERE "slug" IN ('fire-sprite', 'devil-sprite', 'cosmic-sprite', 'air-sprite', 'angel-sprite', 'water-sprite', 'ninja-sprite');
