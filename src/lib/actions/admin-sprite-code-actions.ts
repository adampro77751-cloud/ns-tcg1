"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdminAction } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { createSpriteCodeBatch } from "@/lib/sprite-codes";
import { MIN_CODES_PER_BATCH, MAX_CODES_PER_BATCH } from "@/lib/sprite-code-limits";

export type GenerateCodesState = {
  error: string | null;
};

const generateSchema = z.object({
  spriteId: z.string().min(1, "Choose a Sprite."),
  editionId: z.string().min(1, "Choose an edition."),
  quantity: z.coerce
    .number()
    .int()
    .min(MIN_CODES_PER_BATCH, `Generate at least ${MIN_CODES_PER_BATCH} code.`)
    .max(MAX_CODES_PER_BATCH, `Generate at most ${MAX_CODES_PER_BATCH} codes at once.`),
});

export async function generateSpriteCodesAction(
  _prevState: GenerateCodesState,
  formData: FormData,
): Promise<GenerateCodesState> {
  // Throws (blocking the mutation) for anyone who isn't logged in as an
  // admin — including a request that bypasses the UI entirely and calls
  // this action directly.
  const session = await requireAdminAction();

  const parsed = generateSchema.safeParse({
    spriteId: formData.get("spriteId"),
    editionId: formData.get("editionId"),
    quantity: formData.get("quantity"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const [sprite, edition] = await Promise.all([
    prisma.sprite.findUnique({
      where: { id: parsed.data.spriteId },
      select: { id: true },
    }),
    prisma.edition.findUnique({
      where: { id: parsed.data.editionId },
      select: { id: true },
    }),
  ]);
  if (!sprite || !edition) {
    return { error: "Choose a valid Sprite and edition." };
  }

  const batch = await createSpriteCodeBatch({
    spriteId: sprite.id,
    editionId: edition.id,
    quantity: parsed.data.quantity,
    createdById: session.user.id,
  });

  redirect(`/admin/sprite-codes/${batch.id}`);
}
