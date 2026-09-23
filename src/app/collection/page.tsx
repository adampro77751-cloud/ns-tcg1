import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCollectionMap } from "@/lib/collection";
import { getCoinBalance } from "@/lib/coins";
import { CollectionClient } from "./collection-client";

export default async function CollectionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [allCards, owned, coinBalance] = await Promise.all([
    prisma.card.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, set: true, type: true, rarity: true, image: true },
    }),
    getCollectionMap(session.user.id),
    getCoinBalance(session.user.id),
  ]);

  const cards = allCards.map((c) => ({ ...c, owned: owned.get(c.id) ?? 0 }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">My Collection</h1>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-base font-extrabold text-amber-700">
            🪙 {coinBalance.toLocaleString()}
          </span>
          <Link
            href="/store/packs"
            className="rounded-full bg-violet-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-violet-700"
          >
            Buy a Pack
          </Link>
        </div>
      </div>
      <CollectionClient cards={cards} />
    </div>
  );
}
