import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma";
import { creditCoins } from "../src/lib/coins";
import { buyHalloweenPack } from "../src/lib/halloween-packs";
import { getEquippedCardArt, getEquippedSpriteArt, getOwnedArtStyles, setOwnedArtStyle } from "../src/lib/card-styles";
import { HALLOWEEN_STYLES, isHalloweenPackAvailable } from "../src/lib/card-style-catalog";

let userId: string | undefined;
async function main() {
  assert.ok(isHalloweenPackAvailable(), "Run this verification during the Halloween 2026 sale.");
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: { username: `halloween-test-${suffix}`, email: `halloween-test-${suffix}@example.invalid`, passwordHash: "test-only-no-login" } });
  userId = user.id;
  await assert.rejects(buyHalloweenPack(user.id, randomUUID()), /Not enough Coins/);
  assert.equal(await prisma.packOpening.count({ where: { userId } }), 0);
  await prisma.$transaction(tx => creditCoins(tx, user.id, 500, "ADMIN_GRANT", { reason: "Temporary Halloween verification" }));
  const requestKey = randomUUID();
  const [first, retry] = await Promise.all([buyHalloweenPack(user.id, requestKey), buyHalloweenPack(user.id, requestKey)]);
  assert.equal(first.openingId, retry.openingId);
  assert.deepEqual(first.cards, retry.cards);
  assert.equal(first.cards.length, 3);
  assert.equal(new Set(first.cards.map(card => card.id)).size, 3);
  assert.equal(await prisma.packOpening.count({ where: { userId } }), 1);
  assert.equal(await prisma.coinTransaction.count({ where: { userId, type: "PACK_PURCHASE" } }), 1);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).coinBalance, 0);
  assert.equal(await prisma.userCard.count({ where: { userId } }), 0);
  assert.equal(await prisma.spriteInstance.count({ where: { ownerId: userId } }), 0);
  assert.equal((await getOwnedArtStyles(user.id)).length, 3);
  for (const card of first.cards) {
    const style = HALLOWEEN_STYLES.find(style => style.key === card.id)!;
    assert.ok(style);
    await setOwnedArtStyle(user.id, style.key, false);
    assert.equal((await getOwnedArtStyles(user.id)).find(owned => owned.key === style.key)?.equipped, false);
    await setOwnedArtStyle(user.id, style.key, true);
    assert.equal((await getOwnedArtStyles(user.id)).find(owned => owned.key === style.key)?.equipped, true);
  }
  const cardArt = await getEquippedCardArt(user.id);
  const spriteArt = await getEquippedSpriteArt(user.id);
  assert.equal(cardArt.size + spriteArt.size, 3);
  await assert.rejects(buyHalloweenPack(user.id, randomUUID()), /Not enough Coins/);
  const unowned = HALLOWEEN_STYLES.find(style => !first.cards.some(card => card.id === style.key))!;
  await assert.rejects(setOwnedArtStyle(user.id, unowned.key, true), /not unlocked/);
  console.log("PASS: 500-Coin charge, three distinct permanent art styles, concurrent purchase retry charged once, wallet/ledger agreement, no base cards or Sprites granted, owned styles equip/unequip, insufficient funds and unowned styles rejected.");
}

main().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (userId) {
    await prisma.userCardStyle.deleteMany({ where: { userId } });
    await prisma.userSpriteStyle.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    console.log("Temporary Halloween test data removed.");
  }
  await prisma.$disconnect();
});
