"use client";

import { useActionState } from "react";
import { SHOP_PRODUCTS, formatGBP, type ShopProduct } from "@/lib/shop-products";
import { buyBundleAction } from "./actions";

function BundleCard({ product, sets, canBuy }: { product: ShopProduct; sets: string[]; canBuy: boolean }) {
  const [state, action, pending] = useActionState(buyBundleAction, { error: null });
  return <form action={action} className="flex flex-col rounded-2xl border border-violet-200 bg-white p-5 shadow-sm">
    <input type="hidden" name="productId" value={product.id} />
    <h3 className="text-lg font-bold">{product.name}</h3>
    <p className="mt-2 text-2xl font-extrabold text-violet-700">{formatGBP(product.pricePence)}</p>
    {product.packs > 0 && <>
      <p className="mt-2 text-sm text-slate-600">{product.packKind === "SHINY" ? "15 cards: 2 Mythic, 2 Epic, 1 Legendary and 10 Common/Rare." : "10 cards per pack."} Each pack has a 10% bonus Sprite chance.</p>
      <label className="mt-4 text-sm font-semibold">Card set
        <select name="setName" required className="mt-1 w-full rounded-lg border border-sky-200 bg-white p-2 font-normal">
          {sets.map((set) => <option key={set}>{set}</option>)}
        </select>
      </label>
    </>}
    <p className="mt-3 text-xs text-slate-500">{product.coins ? "Added to your Coin balance after payment." : "Saved in your Pack Store to open whenever you like."}</p>
    {state.error && <p role="alert" className="mt-3 text-sm text-red-700">{state.error}</p>}
    <button disabled={pending || !canBuy || (product.packs > 0 && !sets.length)} className="mt-4 rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">
      {pending ? "Opening Stripe…" : canBuy ? "Test purchase" : "Coming soon"}
    </button>
  </form>;
}

export function BundleStore({ sets, canBuy }: { sets: string[]; canBuy: boolean }) {
  return <>{["packs", "coins"].map((category) => <section key={category} className="mt-8">
    <h2 className="text-xl font-bold">{category === "packs" ? "In-game pack bundles" : "Coin bundles"}</h2>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{SHOP_PRODUCTS.filter((p) => category === "packs" ? p.packs > 0 : p.coins > 0)
      .map((product) => <BundleCard key={product.id} product={product} sets={sets} canBuy={canBuy} />)}</div>
  </section>)}</>;
}
