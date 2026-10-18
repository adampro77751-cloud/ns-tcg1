import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listAvailableSets } from "@/lib/packs";
import { BundleStore } from "./bundle-store";

export default async function BundlesPage({ searchParams }: { searchParams: Promise<{ cancelled?: string }> }) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const [sets, params] = await Promise.all([listAvailableSets(), searchParams]);
  const canBuy = session.user.role === "ADMIN";
  return <div className="mx-auto w-full max-w-6xl px-4 py-12">
    <Link href="/store/packs" className="text-sm text-violet-700">← Pack Store</Link>
    <h1 className="mt-4 text-3xl font-black">Packs &amp; Coins</h1>
    <p className="mt-2 text-sm text-slate-600">Choose a bundle. All prices are in GBP.</p>
    <p className="mt-4 rounded-xl bg-amber-50 p-4 text-sm font-semibold text-amber-900">{canBuy
      ? "Sandbox preview: admin test purchases only. No real money is charged. Test purchases add items to your account."
      : "Purchases are coming soon. The store is currently being tested."}</p>
    {params.cancelled === "1" && <p role="status" className="mt-4 text-sm">Checkout cancelled. Your balance and packs are unchanged.</p>}
    <BundleStore sets={sets.map((set) => set.name)} canBuy={canBuy} />
    <Link href="/store/physical" className="mt-8 inline-block font-semibold text-violet-700 underline">Physical packs · currently disabled →</Link>
  </div>;
}
