"use client";

import { useMemo, useState } from "react";
import { CardNameHover } from "@/components/card-name-hover";
import { normalizeRarity, RARITY_COLORS } from "@/lib/card-rarity";

type CollectionCard = {
  id: string;
  name: string;
  set: string | null;
  type: string | null;
  rarity: string | null;
  image: string | null;
  owned: number;
};

export function CollectionClient({ cards }: { cards: CollectionCard[] }) {
  const [search, setSearch] = useState("");
  const [set, setSet] = useState("all");
  const [ownedOnly, setOwnedOnly] = useState(true);

  const sets = useMemo(() => Array.from(new Set(cards.map((c) => c.set).filter(Boolean))) as string[], [cards]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return cards.filter((c) => {
      if (ownedOnly && c.owned <= 0) return false;
      if (term && !c.name.toLowerCase().includes(term)) return false;
      if (set !== "all" && c.set !== set) return false;
      return true;
    });
  }, [cards, search, set, ownedOnly]);

  const totalOwned = cards.reduce((sum, c) => sum + c.owned, 0);
  const uniqueOwned = cards.filter((c) => c.owned > 0).length;

  return (
    <div>
      <p className="mt-1 text-sm text-slate-500">
        {uniqueOwned} unique card{uniqueOwned === 1 ? "" : "s"} · {totalOwned} total cop{totalOwned === 1 ? "y" : "ies"}
      </p>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <input
          type="text"
          placeholder="Search cards by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        {sets.length > 0 && (
          <select
            value={set}
            onChange={(e) => setSet(e.target.value)}
            className="rounded border border-sky-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
          >
            <option value="all">All sets</option>
            {sets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        <label className="flex items-center gap-1.5 text-sm text-slate-600">
          <input type="checkbox" checked={ownedOnly} onChange={(e) => setOwnedOnly(e.target.checked)} />
          Owned only
        </label>
      </div>

      {filtered.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          {ownedOnly ? "You don't own any matching cards yet — open a pack in the Pack Store!" : "No cards match."}
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {filtered.map((card) => {
            const rarity = normalizeRarity(card.rarity);
            const meta = rarity ? RARITY_COLORS[rarity] : null;
            const notOwned = card.owned <= 0;
            return (
              <div
                key={card.id}
                className={`relative flex flex-col items-center gap-1 rounded-xl border-2 bg-white p-2 text-center shadow-sm ${
                  meta ? meta.border : "border-slate-200"
                } ${notOwned ? "opacity-40 grayscale" : ""}`}
              >
                {card.owned > 0 && (
                  <span className="absolute -right-1.5 -top-1.5 rounded-full bg-violet-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow">
                    ×{card.owned}
                  </span>
                )}
                <div className="aspect-[5/7] w-full overflow-hidden rounded-lg bg-slate-50">
                  {card.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.image} alt={card.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-xs font-semibold text-slate-500">
                      {card.name}
                    </span>
                  )}
                </div>
                <CardNameHover name={card.name} image={card.image} className="text-xs font-semibold" />
                {rarity && (
                  <span className={`text-[10px] font-bold uppercase tracking-wide ${meta?.text ?? ""}`}>{rarity}</span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
