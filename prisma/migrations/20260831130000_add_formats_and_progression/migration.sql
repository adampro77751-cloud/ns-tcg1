-- Formats (Basic/Historic/Quickfire) + Sprite match progression.
--
-- Verified against production before writing this migration: 0 Decks, 0
-- Matches, 0 Events, 0 SpriteInstances existed referencing any Format, and
-- no SpriteInstance had level > 5. Nothing below deletes or alters any row
-- of user-owned data (Users, SpriteInstances, RedemptionCodes, Decks,
-- Matches, Events) — only the two placeholder Format rows are touched, and
-- confirmed with the project owner as safe to do so.
--
--  1. Format gains startingHand/startingHealth (required — read by
--     match/deck systems, not just display text).
--  2. "Standard" is renamed to "Basic" IN PLACE (same id) — keeps its
--     existing 30-40 card / max-3-copies / all-sets construction rules,
--     adds startingHand=5, startingHealth=500.
--  3. "Core Set Only" is deleted (confirmed zero references in production).
--  4. "Historic" is added with the same construction rules as Basic (its
--     own empty ban/restricted lists — none existed to carry over).
--  5. "Quickfire" is added: exactly 10 cards, 3-card starting hand, 200
--     starting health.
--  6. SpriteInstance gains `xp` (Int, default 0) and a DB-level CHECK
--     constraint enforcing 1 <= level <= 5 — a second, independent
--     guarantee (beyond application code) that Level 6 can never exist,
--     even via a direct/compromised write path.
--  7. MatchPlayer gains an optional spriteInstanceId — the individual
--     owned Sprite (if any) that player equipped for the match. Nullable,
--     so all existing/historical MatchPlayer rows remain valid with no
--     Sprite selection.
--  8. MatchResult gains xpAwardedAt — an explicit once-only guard for
--     Sprite XP awarding, alongside the existing PENDING->CONFIRMED atomic
--     transition.
--  9. SpriteHistoryEventType gains MATCH_PLAYED, MATCH_WON, XP_GAINED.

-- AlterEnum
ALTER TYPE "SpriteHistoryEventType" ADD VALUE 'MATCH_PLAYED';
ALTER TYPE "SpriteHistoryEventType" ADD VALUE 'MATCH_WON';
ALTER TYPE "SpriteHistoryEventType" ADD VALUE 'XP_GAINED';

-- AlterTable: Format — add columns nullable first, backfill, then require.
ALTER TABLE "Format" ADD COLUMN "startingHand" INTEGER;
ALTER TABLE "Format" ADD COLUMN "startingHealth" INTEGER;

-- Rename "Standard" -> "Basic" in place (same id — no FK ever needs to
-- change), keep its deck-construction rules, set its match-setup values.
UPDATE "Format"
SET "name" = 'Basic',
    "slug" = 'basic',
    "description" = 'The main standard NS TCG format.',
    "startingHand" = 5,
    "startingHealth" = 500
WHERE "slug" = 'standard';

-- Remove "Core Set Only" — verified above to have zero references.
DELETE FROM "Format" WHERE "slug" = 'core-set-only';

-- Add Historic: same construction rules as Basic, kept as a fully separate
-- Format row so its legality (bans/restrictions/allowed sets) can diverge
-- independently later. No banned/restricted cards seeded — none existed.
INSERT INTO "Format"
  (id, name, slug, description, "minDeckSize", "maxDeckSize", "maxCopiesPerCard", "startingHand", "startingHealth", "allowedSets", "isActive", "createdAt")
VALUES
  (gen_random_uuid()::text, 'Historic', 'historic', 'The historic NS TCG card-pool format.', 30, NULL, 3, 5, 500, NULL, true, CURRENT_TIMESTAMP)
ON CONFLICT (slug) DO NOTHING;

-- Add Quickfire: fixed 10-card deck, 3-card starting hand, 200 health.
INSERT INTO "Format"
  (id, name, slug, description, "minDeckSize", "maxDeckSize", "maxCopiesPerCard", "startingHand", "startingHealth", "allowedSets", "isActive", "createdAt")
VALUES
  (gen_random_uuid()::text, 'Quickfire', 'quickfire', 'A fast 10-card NS TCG format.', 10, 10, 3, 3, 200, NULL, true, CURRENT_TIMESTAMP)
ON CONFLICT (slug) DO NOTHING;

-- Defensive backfill for any other pre-existing Format row this
-- verification pass didn't know about, so the NOT NULL below can never fail.
UPDATE "Format" SET "startingHand" = 5, "startingHealth" = 500 WHERE "startingHand" IS NULL OR "startingHealth" IS NULL;

ALTER TABLE "Format" ALTER COLUMN "startingHand" SET NOT NULL;
ALTER TABLE "Format" ALTER COLUMN "startingHealth" SET NOT NULL;

-- AlterTable: SpriteInstance
ALTER TABLE "SpriteInstance" ADD COLUMN "xp" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "SpriteInstance" ADD CONSTRAINT "SpriteInstance_level_range" CHECK ("level" >= 1 AND "level" <= 5);

-- AlterTable: MatchPlayer
ALTER TABLE "MatchPlayer" ADD COLUMN "spriteInstanceId" TEXT;
ALTER TABLE "MatchPlayer" ADD CONSTRAINT "MatchPlayer_spriteInstanceId_fkey" FOREIGN KEY ("spriteInstanceId") REFERENCES "SpriteInstance"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "MatchPlayer_spriteInstanceId_idx" ON "MatchPlayer"("spriteInstanceId");

-- AlterTable: MatchResult
ALTER TABLE "MatchResult" ADD COLUMN "xpAwardedAt" TIMESTAMP(3);
