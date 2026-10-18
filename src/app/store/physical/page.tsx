import Link from "next/link";
import { getPacks } from "@/lib/orders";
import { PHYSICAL_PACKS, PHYSICAL_MINIMUM_PENCE, formatGBP } from "@/lib/shop-products";

export default async function PhysicalPacksPage() {
  const packs = await getPacks();
  return <div className="mx-auto w-full max-w-3xl px-4 py-12">
    <Link href="/store/packs" className="text-sm text-violet-700">← Pack Store</Link>
    <h1 className="mt-4 text-3xl font-black">Physical pack preorders</h1>
    <p className="mt-3 rounded-xl bg-amber-50 p-4 font-semibold text-amber-900">Physical sales and reservations are currently disabled.</p>
    <p className="mt-3 text-sm text-slate-600">Minimum physical order: {formatGBP(PHYSICAL_MINIMUM_PENCE)}. These are printed packs, separate from in-game packs.</p>
    <div className="mt-6 grid gap-6 sm:grid-cols-2">{PHYSICAL_PACKS.map((product, index) => {
      const pack = packs.find((row) => row.slug === (index === 0 ? "basic-pack" : "shiny-pack"));
      return <section key={product.name} className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-sky-50 p-6 shadow-sm">
        <h2 className="text-xl font-bold">{pack?.name ?? product.name}</h2>
        <p className="mt-2 text-2xl font-extrabold text-violet-700">{formatGBP(product.pricePence)}</p>
        {pack && <p className="mt-2 text-xs font-semibold uppercase text-slate-500">{pack.stock > 0 ? `${pack.stock} left in stock` : "Out of stock"}</p>}
        <button disabled className="mt-5 rounded-full bg-slate-200 px-5 py-2 text-sm font-bold text-slate-500">Currently disabled</button>
      </section>;
    })}</div>
  </div>;
}
