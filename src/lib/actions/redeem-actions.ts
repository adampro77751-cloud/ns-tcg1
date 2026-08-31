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
  result:
    | {
        instanceId: string;
        spriteName: string;
        editionName: string;
      }
    | null;
};

export async function redeemAction(
  _prevState: RedeemState,
  formData: FormData,
): Promise<RedeemState> {
  const session = await auth();
  if (!session?.user) {
    return {
      error: "You must be logged in to redeem a code.",
      result: null,
    };
  }

  const raw = formData.get("code");
  if (typeof raw !== "string" || raw.trim() === "") {
    return { error: "Enter a code.", result: null };
  }

  const code = normalizeRedemptionCode(raw);
  if (!isValidRedemptionCodeShape(code)) {
    return { error: "That code doesn't look right.", result: null };
  }

  const userId = session.user.id;

  try {
    const result = await prisma.$transaction(async (tx) => {
      // The `redeemed: false` guard in the WHERE clause makes this an
      // atomic compare-and-set: under concurrent requests for the same
      // code, only one transaction's updateMany can match/affect the row,
      // so a code can never be redeemed more than once and can never
      // produce more than one Sprite instance.
      const claimed = await tx.redemptionCode.updateMany({
        where: { code, redeemed: false },
        data: { redeemed: true, redeemedById: userId, redeemedAt: new Date() },
      });

      if (claimed.count === 0) {
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
          id: true,
          spriteId: true,
          editionId: true,
          sprite: { select: { name: true, slug: true, image: true } },
          edition: { select: { name: true } },
        },
      });

      // Every redemption creates its own individual Sprite instance —
      // never merged into a quantity counter. Redeeming three Fire Sprite
      // codes produces three separate rows here, each independently
      // nameable and leveled.
      const instance = await tx.spriteInstance.create({
        data: {
          ownerId: userId,
          spriteId: redemption.spriteId,
          editionId: redemption.editionId,
          name: redemption.sprite.name,
          obtainedMethod: "REDEMPTION_CODE",
        },
      });

      await tx.redemptionCode.update({
        where: { id: redemption.id },
        data: { spriteInstanceId: instance.id },
      });

      await tx.spriteHistoryEntry.create({
        data: {
          spriteInstanceId: instance.id,
          type: "OBTAINED",
          detail: {
            method: "REDEMPTION_CODE",
            redemptionCodeId: redemption.id,
          },
        },
      });

      return {
        instanceId: instance.id,
        spriteName: redemption.sprite.name,
        spriteSlug: redemption.sprite.slug,
        editionName: redemption.edition.name,
      };
    });

    revalidatePath("/sprites");
    revalidatePath(`/sprites/${result.spriteSlug}`);
    revalidatePath("/sprites/mine");
    revalidatePath(`/player/${session.user.username}`);

    return {
      error: null,
      result: {
        instanceId: result.instanceId,
        spriteName: result.spriteName,
        editionName: result.editionName,
      },
    };
  } catch (err) {
    if (err instanceof RedeemError) {
      return { error: err.message, result: null };
    }
    throw err;
  }
}

class RedeemError extends Error {}
