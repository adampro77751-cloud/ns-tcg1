import { redirect } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getCollectionMap } from "@/lib/collection";
import { getCoinBalance } from "@/lib/coins";
import { CollectionClient } from "./collection-client";
import Image from "next/image";
import { getEquippedCardArt, getOwnedArtStyles } from "@/lib/card-styles";
import { setCardStyleAction } from "@/lib/actions/card-style-actions";

export default async function CollectionPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [allCards, owned, coinBalance, art, styles] = await Promise.all([
    prisma.card.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, set: true, type: true, rarity: true, image: true },
    }),
    getCollectionMap(session.user.id),
    getCoinBalance(session.user.id),
    getEquippedCardArt(session.user.id),
    getOwnedArtStyles(session.user.id),
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
      {styles.length > 0 && <section id="art-styles" className="mt-10 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <h2 className="text-xl font-bold">Your exclusive art styles</h2>
        <p className="mt-2 text-sm text-slate-600">Permanent cosmetic unlocks for cards and Sprites you own, or collect later. Stats and abilities stay the same. New styles equip automatically; repeat pulls keep your current selection.</p>
        <div className="mt-5 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{styles.map(style => <div key={style.key} className="rounded-xl border border-amber-200 bg-white p-4">
          <Image src={style.image} alt={`${style.targetName} · ${style.name}`} width={212} height={297} className="mx-auto rounded-xl object-contain" />
          <h3 className="mt-3 font-bold">{style.targetName} · {style.name}</h3>
          <p className="mt-1 text-xs text-slate-500">{style.kind === "sprite" ? "Sprite" : "Card"} art style · Collected {style.quantity}×</p>
          <p className="mt-2 text-sm font-semibold">{style.equipped ? "Style equipped" : "Style not equipped"}</p>
          <form action={setCardStyleAction} className="mt-4"><input type="hidden" name="equipped" value={String(!style.equipped)} /><input type="hidden" name="styleKey" value={style.key} />
            <button className="rounded-full bg-violet-600 px-5 py-2 text-sm font-bold text-white">{style.equipped ? "Use standard art" : "Equip style"}</button>
          </form>
        </div>)}</div>
      </section>}
    </div>
  );
}
