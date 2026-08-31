"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  isValidRedemptionCodeShape,
  normalizeRedemptionCode,
} from "@/lib/redemption-code";

export type RedeemState = {
  error: string | null;
  sprite:
    | { name: string; slug: string; image: string | null; editionName: string }
    | null;
};

export async function redeemAction(
  _prevState: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await auth();
  if (!session?.user) {
    return { error: "You must be logged in to redeem a code.", sprite: null };
  }

  const raw = formData.get("code");
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: "Enter a code.", sprite: null };
  }

  const code = normalizeRedemptionCode(raw);
  if (!isValidRedemptionCodeShape(code)) {
    return { error: "That code doesn't look right.", sprite: null };
  }

  const userId = session.user.id;

  try {
    const sprite = await prisma.$transaction(async (tx) => {
      // The `redeemed: false` guard in the WHERE clause makes this an
      // atomic compare-and-set: under concurrent requests for the same
      // code, only one transaction's updateMany can match/affect the row,
      // so a code can never be redeemed more than once.
      const result = await tx.redemptionCode.updateMany({
        where: { code, redeemed: false },
        data: { redeemed: true, redeemedById: userId, redeemedAt: new Date() },
      });

      if (result.count === 0) {
        const existing = await tx.redemptionCode.findUnique({
          where: { code },
          select: { redeemed: true },
        });
        throw new RedeemError(
          existing?.redeemed
            ? "This code has already been redeemed."
            : "Invalid code.",
        );
      }

      const redemption = await tx.redemptionCode.findUniqueOrThrow({
        where: { code },
        select: {
          spriteId: true,
          editionId: true,
          sprite: { select: { name: true, slug: true, image: true } },
          edition: { select: { name: true } },
        },
      });

      await tx.userSprite.upsert({
        where: {
          userId_spriteId_editionId: {
            userId,
            spriteId: redemption.spriteId,
            editionId: redemption.editionId,
          },
        },
        create: {
          userId,
          spriteId: redemption.spriteId,
          editionId: redemption.editionId,
        },
        update: { quantity: { increment: 1 } },
      });

      return { ...redemption.sprite, editionName: redemption.edition.name };
    });

    revalidatePath("/sprites");
    revalidatePath(`/sprites/${sprite.slug}`);
    revalidatePath(`/player/${session.user.username}`);

    return { error: null, sprite };
  } catch (err) {
    if (err instanceof RedeemError) {
      return { error: err.message, sprite: null };
    }
    throw err;
  }
}

class RedeemError extends Error {}
