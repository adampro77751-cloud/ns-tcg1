import { prisma } from "./prisma";
import type { Prisma } from "@/generated/prisma/client";
import { ART_STYLES, GOLDEN_COINS_STYLE } from "./card-style-catalog";

export async function grantPurchaseCardStyle(tx: Prisma.TransactionClient, purchase: { id: string; userId: string; productId: string }) {
  if (purchase.productId !== GOLDEN_COINS_STYLE.productId) return;
  const card = await tx.card.findUnique({ where: { slug: GOLDEN_COINS_STYLE.cardSlug }, select: { id: true } });
  if (!card) throw new Error("Exclusive style card is not available.");
  await tx.userCardStyle.upsert({
    where: { userId_styleKey: { userId: purchase.userId, styleKey: GOLDEN_COINS_STYLE.key } },
    update: {}, // Repeat purchases preserve the owner's current art selection.
    create: { userId: purchase.userId, cardId: card.id, styleKey: GOLDEN_COINS_STYLE.key, purchaseId: purchase.id },
  });
}

export async function getEquippedCardArt(userId: string): Promise<Map<string, string>> {
  const styles = await prisma.userCardStyle.findMany({ where: { userId, equipped: true }, select: { cardId: true, styleKey: true } });
  return new Map(styles.flatMap(s => {
    const style = ART_STYLES.find(style => style.kind === "card" && style.key === s.styleKey);
    return style ? [[s.cardId, style.image] as const] : [];
  }));
}

export async function getEquippedSpriteArt(userId: string): Promise<Map<string, string>> {
  const styles = await prisma.userSpriteStyle.findMany({ where: { userId, equipped: true }, select: { spriteId: true, styleKey: true } });
  return new Map(styles.flatMap(s => {
    const style = ART_STYLES.find(style => style.kind === "sprite" && style.key === s.styleKey);
    return style ? [[s.spriteId, style.image] as const] : [];
  }));
}

export async function getSpriteInstanceArt(instances: { id: string; ownerId: string; spriteId: string }[]) {
  if (!instances.length) return new Map<string, string>();
  const styles = await prisma.userSpriteStyle.findMany({
    where: { userId: { in: [...new Set(instances.map(instance => instance.ownerId))] }, spriteId: { in: [...new Set(instances.map(instance => instance.spriteId))] }, equipped: true },
    select: { userId: true, spriteId: true, styleKey: true },
  });
  const artByOwner = new Map(styles.flatMap(owned => {
    const style = ART_STYLES.find(style => style.kind === "sprite" && style.key === owned.styleKey);
    return style ? [[`${owned.userId}:${owned.spriteId}`, style.image] as const] : [];
  }));
  return new Map(instances.flatMap(instance => {
    const image = artByOwner.get(`${instance.ownerId}:${instance.spriteId}`);
    return image ? [[instance.id, image] as const] : [];
  }));
}

export async function getOwnedArtStyles(userId: string) {
  const [cards, sprites] = await Promise.all([
    prisma.userCardStyle.findMany({ where: { userId }, select: { styleKey: true, equipped: true, quantity: true, card: { select: { name: true } } } }),
    prisma.userSpriteStyle.findMany({ where: { userId }, select: { styleKey: true, equipped: true, quantity: true, sprite: { select: { name: true } } } }),
  ]);
  const owned = [...cards.map(style => ({ ...style, targetName: style.card.name })), ...sprites.map(style => ({ ...style, targetName: style.sprite.name }))];
  return owned.flatMap(item => {
    const style = ART_STYLES.find(style => style.key === item.styleKey);
    return style ? [{ key: style.key, kind: style.kind, name: style.name, image: style.image, targetName: item.targetName, equipped: item.equipped, quantity: item.quantity }] : [];
  });
}

export async function setOwnedArtStyle(userId: string, styleKey: string, equipped: boolean) {
  const style = ART_STYLES.find(style => style.key === styleKey);
  if (!style) throw new Error("Choose a valid art style.");
  await prisma.$transaction(async tx => {
    // All equipment writes for this owner take the wallet's row lock first,
    // keeping simultaneous selections from equipping competing styles.
    await tx.user.update({ where: { id: userId }, data: { updatedAt: new Date() } });
    const where = { userId_styleKey: { userId, styleKey } };
    if (style.kind === "card") {
      const owned = await tx.userCardStyle.findUnique({ where });
      if (!owned) throw new Error("You have not unlocked this art style.");
      if (equipped) await tx.userCardStyle.updateMany({ where: { userId, cardId: owned.cardId, equipped: true }, data: { equipped: false } });
      await tx.userCardStyle.update({ where, data: { equipped } });
    } else {
      const owned = await tx.userSpriteStyle.findUnique({ where });
      if (!owned) throw new Error("You have not unlocked this art style.");
      if (equipped) await tx.userSpriteStyle.updateMany({ where: { userId, spriteId: owned.spriteId, equipped: true }, data: { equipped: false } });
      await tx.userSpriteStyle.update({ where, data: { equipped } });
    }
  });
}

export async function getVisibleInstanceArt(players: { userId: string | null; cards: { instanceId: string; cardId: string }[] }[]) {
  const entries = await Promise.all(players.map(async (player) => {
    if (!player.userId) return [];
    const art = await getEquippedCardArt(player.userId);
    return player.cards.flatMap((card) => art.has(card.cardId) ? [[card.instanceId, art.get(card.cardId)!] as const] : []);
  }));
  return Object.fromEntries(entries.flat());
}
