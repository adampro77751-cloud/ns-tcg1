-- Extends individual Sprite equipping + progression (added for direct
-- Matches in the previous migration) to Events: a player can now equip
-- one owned Sprite (or none) when joining an event, and the organizer
-- declaring a winner awards match-equivalent XP exactly once per event.
-- Purely additive — no existing Event/EventPlayer data is altered.

-- AlterTable: Event
ALTER TABLE "Event" ADD COLUMN "xpAwardedAt" TIMESTAMP(3);

-- AlterTable: EventPlayer
ALTER TABLE "EventPlayer" ADD COLUMN "spriteInstanceId" TEXT;
ALTER TABLE "EventPlayer" ADD CONSTRAINT "EventPlayer_spriteInstanceId_fkey" FOREIGN KEY ("spriteInstanceId") REFERENCES "SpriteInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "EventPlayer_spriteInstanceId_idx" ON "EventPlayer"("spriteInstanceId");
