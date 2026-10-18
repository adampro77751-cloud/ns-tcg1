"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { buyPackAction, openEarnedPackAction } from "@/lib/actions/pack-actions";
import { PackRevealModal } from "./pack-reveal-modal";
import type { PackOpeningResult, SetSummary } from "@/lib/packs";
import { PACK_COST, PACK_SPRITE_CHANCE_PERCENT } from "@/lib/economy-constants";

export function PackStoreClient({
  sets,
  coinBalance,
  earnedPacks,
  showPurchases = true,
}: {
  sets: SetSummary[];
  coinBalance: number;
  earnedPacks: { id: string; setName: string; packKind: string; purchaseId: string | null }[];
  showPurchases?: boolean;
}) {
  const router = useRouter();
  const [buyingSet, setBuyingSet] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reveal, setReveal] = useState<{ setName: string; result: PackOpeningResult } | null>(null);

  async function buy(setName: string, earnedPackId?: string) {
    setError(null);
    setBuyingSet(setName);
    try {
      const formData = new FormData();
      formData.set("setName", setName);
      if (earnedPackId) formData.set("earnedPackId", earnedPackId);
      const result = earnedPackId ? await openEarnedPackAction(formData) : await buyPackAction(formData);
      setReveal({ setName, result });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setBuyingSet(null);
    }
  }

  function closeReveal() {
    setReveal(null);
    router.refresh(); // pick up the new Coin balance and collection
  }

  return (
    <div>
      {error && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {earnedPacks.length > 0 && <section className="mt-8 rounded-2xl border border-amber-300 bg-amber-50 p-5">
        <h2 className="text-lg font-bold">Your unopened packs · {earnedPacks.length}</h2>
        <p className="mt-1 text-sm text-slate-600">Purchased packs and draft prizes are ready to open, with the same 10% bonus Sprite chance.</p>
        <ul className="mt-4 space-y-2">{earnedPacks.map((pack) => <li key={pack.id} className="flex items-center justify-between gap-3">
          <span className="text-sm font-semibold">{pack.setName} · {pack.packKind === "SHINY" ? "Shiny · 15 cards" : "Normal · 10 cards"} · {pack.purchaseId ? "Purchased" : "Draft reward"}</span>
          <button type="button" disabled={buyingSet !== null || reveal !== null} onClick={() => buy(pack.setName, pack.id)} className="rounded-full bg-violet-600 px-4 py-2 text-sm font-bold text-white disabled:bg-slate-300">Open pack</button>
        </li>)}</ul>
      </section>}

      {!showPurchases && earnedPacks.length === 0 && <p className="mt-8 text-sm text-slate-500">You have no unopened packs yet. Buy a bundle in the Store or earn packs by drafting.</p>}

      {showPurchases && (sets.length === 0 ? (
        <p className="mt-8 text-sm text-slate-500">No sets are available to open packs from yet.</p>
      ) : (
        <div className="mt-8 grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {sets.map((set) => {
            const canAfford = coinBalance >= PACK_COST;
            const isBuying = buyingSet === set.name;
            return (
              <div
                key={set.name}
                className="flex flex-col overflow-hidden rounded-2xl border border-violet-200 bg-white shadow-md transition hover:shadow-lg"
              >
                <div className="relative flex aspect-[4/3] items-center justify-center overflow-hidden bg-gradient-to-br from-violet-600 via-blue-600 to-sky-500">
                  {set.sampleImage ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={set.sampleImage}
                      alt=""
                      aria-hidden
                      className="absolute inset-0 h-full w-full scale-125 object-cover opacity-30 blur-sm"
                    />
                  ) : null}
                  <div className="relative flex flex-col items-center text-white drop-shadow">
                    <span className="text-4xl">📦</span>
                    <span className="mt-1 text-xs font-bold uppercase tracking-widest">NS TCG Pack</span>
                  </div>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="text-lg font-bold text-slate-900">{set.name}</h3>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {set.cardCount} card{set.cardCount === 1 ? "" : "s"} in set · 10 cards per pack
                  </p>
                  <p className="mt-2 text-xs font-semibold text-violet-700">{PACK_SPRITE_CHANCE_PERCENT}% chance of a bonus Sprite · automatically added to My Sprites</p>
                  <div className="mt-4 flex items-center justify-between">
                    <span className="flex items-center gap-1 text-lg font-extrabold text-amber-600">
                      🪙 {PACK_COST.toLocaleString()}
                    </span>
                    <button
                      type="button"
                      disabled={!canAfford || buyingSet !== null || reveal !== null}
                      onClick={() => buy(set.name)}
                      className="rounded-full bg-violet-600 px-5 py-2 text-sm font-bold text-white shadow transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                    >
                      {isBuying ? "Opening…" : canAfford ? "Buy Pack" : "Not enough Coins"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}

      {reveal && <PackRevealModal setName={reveal.setName} cards={reveal.result.cards} sprite={reveal.result.sprite} onClose={closeReveal} />}
    </div>
  );
}
