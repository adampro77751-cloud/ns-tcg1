-- Preserve previously claimed rank rewards as the ladder thresholds increase.
-- Earned RP stays unchanged; claimed rewards move to their corresponding new tier.
UPDATE "User"
SET "draftRewardPoints" = CASE
  WHEN "draftRewardPoints" >= 1400 THEN 6000
  WHEN "draftRewardPoints" >= 900 THEN 4200
  WHEN "draftRewardPoints" >= 500 THEN 2400
  WHEN "draftRewardPoints" >= 200 THEN 1000
  ELSE "draftRewardPoints"
END
WHERE "draftRewardPoints" >= 200;
