import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/prisma";

export default async function AdminSpriteCodeBatchPage({
  params,
}: PageProps<"/admin/sprite-codes/[batchId]">) {
  await requireAdminPage();
  const { batchId } = await params;

  const batch = await prisma.spriteCodeBatch.findUnique({
    where: { id: batchId },
    select: {
      id: true,
      quantity: true,
      createdAt: true,
      sprite: { select: { name: true } },
      edition: { select: { name: true } },
      createdBy: { select: { username: true } },
      codes: {
        orderBy: { createdAt: "asc" },
        select: { code: true, redeemed: true },
      },
    },
  });
  if (!batch) notFound();

  const redeemedCount = batch.codes.filter((c) => c.redeemed).length;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link href="/admin/sprite-codes" className="text-sm text-blue-600">
        ← All batches
      </Link>
      <div className="mt-2 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            {batch.sprite.name} — {batch.edition.name}
          </h1>
          <p className="mt-1 text-sm text-zinc-500">
            {batch.quantity} codes · created{" "}
            {batch.createdAt.toLocaleDateString()} by{" "}
            {batch.createdBy.username} · {redeemedCount} redeemed
          </p>
        </div>
        <a
          href={`/admin/sprite-codes/${batch.id}/csv`}
          className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
        >
          Download CSV
        </a>
      </div>

      <div className="mt-6 overflow-x-auto rounded border border-zinc-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-zinc-200 bg-zinc-50 text-left text-xs uppercase text-zinc-500">
              <th className="px-4 py-2">Code</th>
              <th className="px-4 py-2">Sprite</th>
              <th className="px-4 py-2">Edition</th>
              <th className="px-4 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {batch.codes.map((code) => (
              <tr key={code.code} className="border-b border-zinc-100 last:border-0">
                <td className="px-4 py-2 font-mono">{code.code}</td>
                <td className="px-4 py-2">{batch.sprite.name}</td>
                <td className="px-4 py-2">{batch.edition.name}</td>
                <td className="px-4 py-2">
                  <span
                    className={
                      "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase " +
                      (code.redeemed
                        ? "bg-green-100 text-green-800"
                        : "bg-zinc-100 text-zinc-500")
                    }
                  >
                    {code.redeemed ? "Redeemed" : "Unused"}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
