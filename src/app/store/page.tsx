import Link from "next/link";
import { auth } from "@/auth";
import { listAvailableSets } from "@/lib/packs";
import { BundleStore } from "./bundles/bundle-store";
import { getShopPaymentMode } from "@/lib/stripe";
import { PackStoreClient } from "./packs/pack-store-client";
import { getCoinBalance } from "@/lib/coins";
import { PACK_COST } from "@/lib/economy-constants";

export default async function StorePage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const [session, sets, params] = await Promise.all([auth(), listAvailableSets(), searchParams]);
  const coinBalance = session?.user ? await getCoinBalance(session.user.id) : 0;
  const mode = getShopPaymentMode();
  const signedIn = !!session?.user;
  const canBuy = signedIn && (mode === "live" || (mode === "test" && session.user.role === "ADMIN"));
  return <div className="mx-auto w-full max-w-6xl px-4 py-12">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div><h1 className="text-3xl font-black">Store</h1>
        <p className="mt-2 text-sm text-slate-600">Buy in-game packs and Coins. All prices are in GBP.</p></div>
      <Link href="/store/packs" className="rounded-full border border-violet-300 px-5 py-2 text-sm font-bold text-violet-700">Open your packs →</Link>
    </div>
    {!signedIn && <p className="mt-4 text-sm"><Link href="/login" className="font-semibold text-violet-700 underline">Sign in</Link> or <Link href="/signup" className="font-semibold text-violet-700 underline">create an account</Link> to buy and keep your purchases.</p>}
    {mode !== "live" && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">{canBuy
      ? "Sandbox preview: admin test purchases only. No real money is charged. Test purchases add items to your account."
      : "Purchases are temporarily unavailable."}</p>}
    {params.cancelled === "1" && <p role="status" className="mt-4 text-sm">Checkout cancelled. Your balance and packs are unchanged.</p>}
    <BundleStore sets={sets.map((set) => set.name)} canBuy={canBuy} live={mode === "live"} signedIn={signedIn} />
    <section className="mt-10 border-t border-sky-200 pt-8">
      <h2 className="text-xl font-bold">Single packs with Coins</h2>
      <p className="mt-2 text-sm text-slate-600">{PACK_COST.toLocaleString()} Coins for a normal 10-card pack. {signedIn ? `Your balance: ${coinBalance.toLocaleString()} Coins.` : "Sign in to spend your Coins."}</p>
      {signedIn ? <PackStoreClient sets={sets} coinBalance={coinBalance} earnedPacks={[]} /> : <Link href="/login" className="mt-4 inline-block font-semibold text-violet-700 underline">Sign in to buy packs with Coins →</Link>}
    </section>
    <Link href="/store/physical" className="mt-8 inline-block font-semibold text-violet-700 underline">Physical packs · currently disabled →</Link>
  </div>;
}
