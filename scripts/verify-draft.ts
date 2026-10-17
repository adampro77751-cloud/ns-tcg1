import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Run `npm run test:draft` against a migrated database with seeded cards.
// Only a uniquely named temporary account is used; its data is removed.
import { prisma } from '../src/lib/prisma';
import { creditCoins } from '../src/lib/coins';
import { enterDraft, pickCardInDraft, startDraftMatches, advanceDraftAfterMatch } from '../src/lib/draft';
import { concede } from '../src/lib/digital-engine/engine';
import type { DigitalGameState } from '../src/lib/digital-engine/types';
import type { DraftState } from '../src/lib/draft-logic';
import type { Prisma } from '../src/generated/prisma/client';

let userId: string | undefined;
async function main() {
  const suffix = randomUUID();
  const user = await prisma.user.create({ data: {
    username: `draft-test-${suffix}`, email: `draft-test-${suffix}@example.invalid`, passwordHash: 'no-login-test-account',
  }, select: { id: true } });
  userId = user.id;
  const cards = await prisma.card.findMany({ where: { set: { not: null }, type: 'Item' }, select: { set: true }, take: 1 });
  assert(cards[0]?.set, 'Need a seeded set');
  await assert.rejects(enterDraft(user.id, cards[0].set), /Not enough Coins/);
  assert.equal(await prisma.draftPod.count({ where: { userId: user.id } }), 0);
  await prisma.$transaction((tx) => creditCoins(tx, user.id, 5000, 'ADMIN_GRANT', { reason: 'Temporary draft verification' }));
  const entries = await Promise.all([enterDraft(user.id, cards[0].set), enterDraft(user.id, cards[0].set)]);
  assert.equal(entries[0], entries[1]);
  const podId = entries[0];
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).coinBalance, 3000);
  assert.equal(await prisma.coinTransaction.count({ where: { userId: user.id, type: 'DRAFT_ENTRY' } }), 1);
  await assert.rejects(pickCardInDraft('not-the-owner', podId, 0, 0), /not found/);
  const concurrent = await Promise.allSettled([pickCardInDraft(user.id, podId, 0, 0), pickCardInDraft(user.id, podId, 0, 0)]);
  assert.equal(concurrent.filter((result) => result.status === 'fulfilled').length, 1);
  for (let pick = 1; pick < 30; pick++) {
    const pod = await prisma.draftPod.findUniqueOrThrow({ where: { id: podId } });
    await pickCardInDraft(user.id, podId, pod.version, 0);
  }
  const pod = await prisma.draftPod.findUniqueOrThrow({ where: { id: podId } });
  assert.equal(pod.status, 'BUILDING');
  const state = pod.state as unknown as DraftState;
  assert.equal(state.pools[0].length, 30);
  const copies = await prisma.userCard.aggregate({ where: { userId: user.id }, _sum: { quantity: true } });
  assert.equal(copies._sum.quantity, 30);
  await assert.rejects(startDraftMatches(user.id, podId, pod.version, [...state.pools[0].slice(0, 19), 'not-drafted']), /picked/);
  await startDraftMatches(user.id, podId, pod.version, state.pools[0].slice(0, 20));
  const opponents = new Set<number>();
  for (let round = 0; round < 5; round++) {
    const match = await prisma.digitalMatch.findFirstOrThrow({ where: { draftPodId: podId, draftRound: round }, include: { players: { include: { deckSnapshot: true } } } });
    assert.equal(match.status, 'IN_PROGRESS');
    assert.equal(match.players.length, 2);
    for (const player of match.players) assert.equal(player.deckSnapshot.reduce((sum, card) => sum + card.quantity, 0), 20);
    opponents.add(match.draftOpponentSeat!);
    const game = concede(match.state as unknown as DigitalGameState, 0);
    await prisma.digitalMatch.update({ where: { id: match.id }, data: { status: 'COMPLETED', state: game as unknown as Prisma.InputJsonValue, finishedAt: new Date() } });
    await Promise.all([advanceDraftAfterMatch(match.id), advanceDraftAfterMatch(match.id)]);
    await advanceDraftAfterMatch(match.id);
  }
  const complete = await prisma.draftPod.findUniqueOrThrow({ where: { id: podId } });
  assert.equal(complete.status, 'COMPLETED');
  assert.equal(complete.activeUserId, null);
  assert.equal((complete.state as unknown as DraftState).results.length, 15);
  assert.equal(opponents.size, 5);
  assert.equal(await prisma.digitalMatch.count({ where: { draftPodId: podId } }), 5);
  assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).coinBalance, 3000);
  assert.equal((await prisma.userCard.aggregate({ where: { userId: user.id }, _sum: { quantity: true } }))._sum.quantity, 30);
  console.log('PASS: insufficient funds rollback, single 2,000-coin entry under concurrent requests, private pod ownership, duplicate-pick protection, 30 kept cards, draft-only deck validation, 5 automatic matches, 15 results, idempotent advancement.');
}

main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  if (userId) {
    await prisma.digitalMatch.deleteMany({ where: { draftPod: { userId } } });
    await prisma.draftPod.deleteMany({ where: { userId } });
    await prisma.user.delete({ where: { id: userId } });
    console.log('Temporary draft test data removed.');
  }
  await prisma.$disconnect();
});
