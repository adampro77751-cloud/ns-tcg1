import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getCoinBalance } from "@/lib/coins";
import { PackStoreClient } from "./pack-store-client";
import { prisma } from "@/lib/prisma";
import Link from "next/link";
import { getShopPaymentMode } from "@/lib/stripe";

export default async function PackStorePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const coinBalance = await getCoinBalance(session.user.id);
  const earnedPacks = await prisma.earnedPack.findMany({
    where: { userId: session.user.id, openedAt: null }, orderBy: { createdAt: "asc" },
    select: { id: true, setName: true, packKind: true, purchaseId: true },
  });

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Your Packs</h1>
          <p className="mt-1 text-sm text-slate-500">
            Open your purchased packs and draft prizes. Visit the Store to buy packs and Coins.
          </p>
          <p className="mt-2 text-sm font-semibold text-violet-700">Each pack also has a 10% chance to contain a bonus Sprite. Keep it automatically—no claim code needed.</p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-lg font-extrabold text-amber-700">
          🪙 {coinBalance.toLocaleString()}
        </div>
      </div>

      <PackStoreClient sets={[]} coinBalance={coinBalance} earnedPacks={earnedPacks} showPurchases={false} />
      <div className="mt-8 flex flex-wrap gap-4 text-sm font-semibold text-violet-700">
        <Link href="/store" className="underline">Store · buy packs &amp; Coins →</Link>
        <Link href="/store/physical" className="underline">Physical packs · disabled →</Link>
      </div>
      {session.user.role === "ADMIN" && getShopPaymentMode() === "test" && <Link href="/store/stripe-test" className="mt-8 inline-block text-sm font-semibold text-violet-700 underline">Try Stripe test checkout →</Link>}
    </div>
  );
}
