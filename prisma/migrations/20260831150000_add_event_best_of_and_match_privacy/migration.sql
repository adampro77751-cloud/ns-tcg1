-- Adds a public/private matches lobby and Event best-of-X series support.
-- Purely additive — no existing Match/Event/EventPlayer data is altered.
--
--  1. Match.isPrivate (default true) — every existing match keeps behaving
--     exactly as before (reachable only via direct link/join code, never
--     listed). New matches can opt into being listed publicly.
--  2. Match.eventId (nullable FK to Event) — links a Match to the Event
--     series it's a round of; null for every existing/standalone match.
--  3. Event.bestOf (nullable Int) — when set, the event is a head-to-head
--     best-of-X series played as real tracked Matches instead of a
--     manually declared winner. Null for every existing event.

-- AlterTable: Match
ALTER TABLE "Match" ADD COLUMN "isPrivate" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "Match" ADD COLUMN "eventId" TEXT;
ALTER TABLE "Match" ADD CONSTRAINT "Match_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "Match_eventId_idx" ON "Match"("eventId");

-- AlterTable: Event
ALTER TABLE "Event" ADD COLUMN "bestOf" INTEGER;
