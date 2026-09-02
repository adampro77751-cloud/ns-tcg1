import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import { GenerateCodesForm } from "./generate-codes-form";

export default async function AdminSpriteCodesPage() {
  await requireAdminPage();

  const [sprites, editions, batches] = await Promise.all([
    prisma.sprite.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.edition.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    prisma.spriteCodeBatch.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        quantity: true,
        createdAt: true,
        sprite: { select: { name: true } },
        edition: { select: { name: true } },
        createdBy: { select: { username: true } },
        _count: { select: { codes: { where: { redeemed: true } } } },
      },
    }),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Sprite codes</h1>

      <div id="generate" className="mt-6 scroll-mt-6 rounded border border-sky-200 bg-white p-4">
        <h2 className="font-semibold">Sprite Code Generator</h2>
        {sprites.length === 0 || editions.length === 0 ? (
          <p className="mt-2 text-sm text-slate-500">
            You need at least one Sprite and one Edition before generating
            codes.
          </p>
        ) : (
          <GenerateCodesForm sprites={sprites} editions={editions} />
        )}
      </div>

      <h2
        id="batches"
        className="mt-10 scroll-mt-6 text-sm font-semibold uppercase tracking-wide text-slate-500"
      >
        Sprite Code Batches
      </h2>
      {batches.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No batches generated yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {batches.map((batch) => (
            <li key={batch.id}>
              <Link
                href={`/admin/sprite-codes/${batch.id}`}
                className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <div>
                  <div className="font-medium">
                    {batch.sprite.name} — {batch.edition.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {batch.quantity} codes · created{" "}
                    {batch.createdAt.toLocaleDateString()} by{" "}
                    {batch.createdBy.username}
                  </div>
                </div>
                <span className="text-sm text-slate-600">
                  {batch._count.codes} / {batch.quantity} redeemed
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
