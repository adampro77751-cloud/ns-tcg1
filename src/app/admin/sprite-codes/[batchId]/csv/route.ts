import { getAdminSession } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { buildBatchCsv } from "@/lib/sprite-codes";

export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/sprite-codes/[batchId]/csv">,
) {
  const session = await getAdminSession();
  if (!session) {
    return new Response("Unauthorized", { status: 403 });
  }

  const { batchId } = await params;

  const batch = await prisma.spriteCodeBatch.findUnique({
    where: { id: batchId },
    select: {
      sprite: { select: { name: true, slug: true } },
      edition: { select: { name: true, slug: true } },
      // Deliberately not selecting redeemedById/redeemedAt/redeemedBy —
      // the export must not expose who redeemed a code, only whether it
      // has been.
      codes: { select: { code: true, redeemed: true } },
    },
  });
  if (!batch) {
    return new Response("Not found", { status: 404 });
  }

  const csv = buildBatchCsv(
    batch.codes.map((c) => ({
      code: c.code,
      spriteName: batch.sprite.name,
      editionName: batch.edition.name,
      redeemed: c.redeemed,
    })),
  );

  const filename = `${batch.sprite.slug}-${batch.edition.slug}-codes.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
