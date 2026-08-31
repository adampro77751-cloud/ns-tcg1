import { prisma } from "@/lib/prisma";
import { Prisma } from "@/generated/prisma/client";
import { generateRedemptionCode } from "@/lib/redemption-code";

async function createOneCodeInBatch(
  tx: Prisma.TransactionClient,
  params: { batchId: string; spriteId: string; editionId: string },
) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = generateRedemptionCode();
    try {
      return await tx.redemptionCode.create({
        data: {
          code,
          spriteId: params.spriteId,
          editionId: params.editionId,
          batchId: params.batchId,
        },
      });
    } catch (err) {
      const isCollision =
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === "P2002" &&
        (err.meta?.target as string[] | undefined)?.includes("code");
      if (!isCollision) throw err;
    }
  }
  throw new Error("Failed to generate a unique redemption code.");
}

// Creates a SpriteCodeBatch and `quantity` freshly generated, unique
// RedemptionCodes for it, all in one transaction — either the whole batch
// exists or none of it does.
export async function createSpriteCodeBatch(params: {
  spriteId: string;
  editionId: string;
  quantity: number;
  createdById: string;
}) {
  return prisma.$transaction(
    async (tx) => {
      const batch = await tx.spriteCodeBatch.create({
        data: {
          spriteId: params.spriteId,
          editionId: params.editionId,
          quantity: params.quantity,
          createdById: params.createdById,
        },
      });
      for (let i = 0; i < params.quantity; i++) {
        await createOneCodeInBatch(tx, {
          batchId: batch.id,
          spriteId: params.spriteId,
          editionId: params.editionId,
        });
      }
      return batch;
    },
    { timeout: 30_000 },
  );
}

// Minimal RFC 4180-ish CSV field escaping: wrap in quotes and double up any
// embedded quotes whenever the field contains a comma, quote, or newline.
export function csvField(value: string): string {
  if (/[",\n]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function buildBatchCsv(
  rows: { code: string; spriteName: string; editionName: string; redeemed: boolean }[],
): string {
  const header = "code,sprite,edition,status";
  const lines = rows.map((row) =>
    [
      csvField(row.code),
      csvField(row.spriteName),
      csvField(row.editionName),
      row.redeemed ? "REDEEMED" : "UNUSED",
    ].join(","),
  );
  return [header, ...lines].join("\n") + "\n";
}
