import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCollectionMap } from "@/lib/collection";
import { getCoinBalance } from "@/lib/coins";
import { CollectionClient } from "./collection-client";
import Image from "next/image";
import { GOLDEN_COINS_STYLE } from "@/lib/card-style-catalog";
import { getEquippedCardArt } from "@/lib/card-styles";
import { setCardStyleAction } from "@/lib/actions/card-style-actions";

export default async function CollectionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [allCards, owned, coinBalance, art, style] = await Promise.all([
    prisma.card.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, set: true, type: true, rarity: true, image: true },
    }),
    getCollectionMap(session.user.id),
    getCoinBalance(session.user.id),
    getEquippedCardArt(session.user.id),
    prisma.userCardStyle.findUnique({ where: { userId_styleKey: { userId: session.user.id, styleKey: GOLDEN_COINS_STYLE.key } },
      select: { equipped: true, card: { select: { name: true } } } }),
  ]);

  const cards = allCards.map((c) => ({ ...c, image: art.get(c.id) ?? c.image, owned: owned.get(c.id) ?? 0 }));

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight">My Collection</h1>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-base font-extrabold text-amber-700">
            🪙 {coinBalance.toLocaleString()}
          </span>
          <Link
            href="/store"
            className="rounded-full bg-violet-600 px-5 py-2 text-sm font-bold text-white shadow hover:bg-violet-700"
          >
            Buy a Pack
          </Link>
        </div>
      </div>
      <CollectionClient cards={cards} />
      {style && <section className="mt-10 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <h2 className="text-xl font-bold">Your exclusive card styles</h2>
        <div className="mt-4 flex flex-col gap-5 sm:flex-row">
          <Image src={GOLDEN_COINS_STYLE.image} alt={`${style.card.name} · Golden Coins art`} width={212} height={297} className="rounded-xl object-contain" />
          <div><h3 className="font-bold">{style.card.name} · Golden Coins</h3>
            <p className="mt-2 text-sm text-slate-600">Exclusive to the 50,000-Coin bundle. A cosmetic style for your existing card; its stats and abilities stay the same.</p>
            <p className="mt-2 text-sm font-semibold">{style.equipped ? "Golden Coins art equipped" : "Standard art equipped"}</p>
            <form action={setCardStyleAction} className="mt-4"><input type="hidden" name="equipped" value={String(!style.equipped)} />
              <button className="rounded-full bg-violet-600 px-5 py-2 text-sm font-bold text-white">{style.equipped ? "Use standard art" : "Equip Golden Coins art"}</button>
            </form>
          </div>
        </div>
      </section>}
    </div>
  );
}
