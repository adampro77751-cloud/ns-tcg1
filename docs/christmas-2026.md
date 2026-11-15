# Christmas 2026 release

The calendar opens at 2026-12-01 00:00 GMT. Doors 1-25 unlock daily at midnight GMT. Catch-up claims remain available until 2027-01-01 00:00 GMT (exclusive). Before launch the route is a teaser only. All release and claim checks run on the server.

Coins increase from 240 on day 1 to 2,160 on day 25, rising by 80 each day. Days 11-24 each grant one normal unopened pack; day 25 grants two. Days 5, 10, 15 and 20 add a permanent card skin. Day 25 adds one copy of the original finale card. Total: 30,000 Coins and 16 packs.

## Calendar skins supplied

The four supplied full-card PNGs are installed unchanged. These are cosmetic skins: original card stats and rules remain unchanged. Christmas Letter uses Old book because their printed effects match.

| Day | Card | Skin/theme | Public asset path |
| --- | --- | --- | --- |
| 5 | Cupcake | Christmas Cupcake: festive cupcake with candy cane and holly | /cards/styles/christmas-2026/cupcake.png |
| 10 | Old book | Christmas Letter: ribbon-wrapped book, candlelight and snow | /cards/styles/christmas-2026/old-book.png |
| 15 | Bio Worm | Christmas Bio Worm: Santa hat, snow and holly | /cards/styles/christmas-2026/bio-worm.png |
| 20 | Revision | Christmas Revision: festive notes, hot chocolate and fairy lights | /cards/styles/christmas-2026/revision.png |

Day 25: **Christmas day**, an original Spell using the supplied snowman artwork at `/cards/christmas-day.png`. Discard your hand as a casting cost, return all Items in your discard pile to play, then gain 100 health. Newly discarded Items are included. Uses the existing battlefield entry triggers. Rarity is unmarked and remains null. The card is created atomically on the first valid day 25 claim with slug `christmas-2026-finale`; its null set keeps it out of ordinary packs. No new gameplay stats are invented.

## Before release

- Apply the Christmas migration with the normal deployment migration workflow, then deploy the app.
- The four skin PNGs are installed under public/cards/styles/christmas-2026/. Include them in deployment.
- Finale artwork is installed. Its card record is created automatically on the first day 25 claim.
- Ensure at least one seeded card set exists. Packs use the set of the first eligible card ordered by ID.
- Verify a claim against the migrated staging database, including concurrent duplicate submissions.

Claims are uniquely constrained by user, year and day. Claim records, ledger credits, packs and cosmetics share one database transaction. Existing skins are left equipped as they were.
