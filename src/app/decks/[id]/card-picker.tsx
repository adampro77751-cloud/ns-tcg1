"use client";

import { useMemo, useState } from "react";

type CardSummary = {
  id: string;
  name: string;
  set: string | null;
  type: string | null;
  rarity: string | null;
};

export function CardPicker({
  deckId,
  allCards,
  deckCardQuantities,
  addCardAction,
}: {
  deckId: string;
  allCards: CardSummary[];
  deckCardQuantities: Record<string, number>;
  addCardAction: (formData: FormData) => void | Promise<void>;
}) {
  const [search, setSearch] = useState("");
  const [set, setSet] = useState("all");
  const [type, setType] = useState("all");

  const sets = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.set).filter(Boolean))) as string[],
    [allCards],
  );
  const types = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.type).filter(Boolean))) as string[],
    [allCards],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allCards.filter((card) => {
      if (term && !card.name.toLowerCase().includes(term)) return false;
      if (set !== "all" && card.set !== set) return false;
      if (type !== "all" && card.type !== type) return false;
      return true;
    });
  }, [allCards, search, set, type]);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search cards..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        {sets.length > 0 && (
          <select
            value={set}
            onChange={(e) => setSet(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
          >
            <option value="all">All sets</option>
            {sets.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {types.length > 0 && (
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border border-zinc-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No cards match.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {filtered.map((card) => (
            <li
              key={card.id}
              className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2"
            >
              <div>
                <span className="font-medium">{card.name}</span>{" "}
                <span className="text-xs text-zinc-500">
                  {[card.type, card.set, card.rarity].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                {deckCardQuantities[card.id] > 0 && (
                  <span className="text-xs text-zinc-500">
                    In deck ×{deckCardQuantities[card.id]}
                  </span>
                )}
                <form action={addCardAction}>
                  <input type="hidden" name="deckId" value={deckId} />
                  <input type="hidden" name="cardId" value={card.id} />
                  <button
                    type="submit"
                    className="rounded border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50"
                  >
                    Add
                  </button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
