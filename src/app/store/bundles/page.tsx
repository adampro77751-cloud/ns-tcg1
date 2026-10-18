import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listAvailableSets } from "@/lib/packs";
import { BundleStore } from "./bundle-store";
import { getShopPaymentMode } from "@/lib/stripe";

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [sets, params] = await Promise.all([listAvailableSets(), searchParams]);
  const mode = getShopPaymentMode();
  const canBuy = mode === "live" || (mode === "test" && session.user.role === "ADMIN");
  return <div className="mx-auto w-full max-w-6xl px-4 py-12">
    <Link href="/store/packs" className="text-sm text-violet-700">← Pack Store</Link>
    <h1 className="mt-4 text-3xl font-black">Packs &amp; Coins</h1>
    <p className="mt-2 text-sm text-slate-600">Choose a bundle. All prices are in GBP.</p>
    {mode !== "live" && <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">{canBuy
      ? "Sandbox preview: admin test purchases only. No real money is charged. Test purchases add items to your account."
      : "Purchases are temporarily unavailable."}</p>}
    {params.cancelled === "1" && <p role="status" className="mt-4 text-sm">Checkout cancelled. Your balance and packs are unchanged.</p>}
    <BundleStore sets={sets.map((set) => set.name)} canBuy={canBuy} live={mode === "live"} />
    <Link href="/store/physical" className="mt-8 inline-block font-semibold text-violet-700 underline">Physical packs · currently disabled →</Link>
  </div>;
}
