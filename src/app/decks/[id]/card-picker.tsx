"use client";

import { useMemo, useState } from "react";
import { CardNameHover } from "@/components/card-name-hover";

type CardSummary = {
  id: string;
  name: string;
  set: string | null;
  type: string | null;
  rarity: string | null;
  attack: number | null;
  defence: number | null;
  speed: number | null;
  rulesText: string | null;
  image: string | null;
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
  const [rarity, setRarity] = useState("all");

  const sets = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.set).filter(Boolean))) as string[],
    [allCards],
  );
  const types = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.type).filter(Boolean))) as string[],
    [allCards],
  );
  const rarities = useMemo(
    () => Array.from(new Set(allCards.map((c) => c.rarity).filter(Boolean))) as string[],
    [allCards],
  );

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return allCards.filter((card) => {
      if (term && !card.name.toLowerCase().includes(term)) return false;
      if (set !== "all" && card.set !== set) return false;
      if (type !== "all" && card.type !== type) return false;
      if (rarity !== "all" && card.rarity !== rarity) return false;
      return true;
    });
  }, [allCards, search, set, type, rarity]);

  return (
    <div className="mt-3">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          placeholder="Search cards by name..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="min-w-0 flex-1 rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        {types.length > 0 && (
          <select
            value={type}
            onChange={(e) => setType(e.target.value)}
            className="rounded border border-sky-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
          >
            <option value="all">All types</option>
            {types.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}
        {rarities.length > 0 && (
          <select
            value={rarity}
            onChange={(e) => setRarity(e.target.value)}
            className="rounded border border-sky-300 px-2 py-2 text-sm outline-none focus:border-blue-600"
          >
            <option value="all">All rarities</option>
            {rarities.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
        )}
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
      </div>

      {filtered.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No cards match.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {filtered.map((card) => {
            const hasStats =
              card.attack !== null || card.defence !== null || card.speed !== null;
            return (
              <li
                key={card.id}
                className="flex items-start justify-between gap-3 rounded border border-sky-200 bg-white px-3 py-2"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <CardNameHover
                      name={card.name}
                      image={card.image}
                      className="font-medium"
                    />
                    <span className="text-xs text-slate-500">
                      {[card.type, card.rarity, card.set].filter(Boolean).join(" · ")}
                    </span>
                  </div>
                  {hasStats && (
                    <div className="mt-1 text-xs text-slate-500">
                      {card.attack !== null && <>ATK {card.attack} </>}
                      {card.defence !== null && <>· DEF {card.defence} </>}
                      {card.speed !== null && <>· SPD {card.speed}</>}
                    </div>
                  )}
                  {card.rulesText && (
                    <p className="mt-1 max-w-md whitespace-pre-line text-xs text-slate-600">
                      {card.rulesText}
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {deckCardQuantities[card.id] > 0 && (
                    <span className="text-xs text-slate-500">
                      In deck ×{deckCardQuantities[card.id]}
                    </span>
                  )}
                  <form action={addCardAction}>
                    <input type="hidden" name="deckId" value={deckId} />
                    <input type="hidden" name="cardId" value={card.id} />
                    <button
                      type="submit"
                      className="rounded border border-sky-300 px-2 py-1 text-xs hover:bg-sky-50"
                    >
                      Add
                    </button>
                  </form>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
