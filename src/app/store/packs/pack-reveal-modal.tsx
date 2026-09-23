"use client";

import { useState } from "react";
import { RARITY_COLORS, type CanonicalRarity } from "@/lib/card-rarity";
import type { GeneratedPackCard } from "@/lib/packs";

// Arena-style one-at-a-time pack reveal: a big face-down card the player
// taps to flip, advancing through all PACK_SIZE cards, then a summary
// grid of everything they got. Purely a display of a result the server
// already committed (the pack was bought/opened before this ever opens —
// see PackStoreClient) — this never re-requests or re-rolls anything.
export function PackRevealModal({
  setName,
  cards,
  onClose,
}: {
  setName: string;
  cards: GeneratedPackCard[];
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const done = index >= cards.length;
  const current = cards[index];

  function reveal() {
    if (done) return;
    if (!flipped) {
      setFlipped(true);
      return;
    }
    if (index + 1 >= cards.length) {
      setIndex(index + 1); // move past the end -> summary screen
    } else {
      setIndex(index + 1);
      setFlipped(false);
    }
  }

  const rarityMeta = (rarity: CanonicalRarity | null) => (rarity ? RARITY_COLORS[rarity] : null);

  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-violet-950/95 via-blue-950/95 to-slate-950/95 p-4">
      <p className="text-xs font-bold uppercase tracking-[0.3em] text-violet-300">NS TCG · {setName} Pack</p>

      {!done && current && (
        <div className="mt-6 flex flex-col items-center">
          <button
            type="button"
            onClick={reveal}
            className="group relative flex aspect-[5/7] w-56 items-center justify-center overflow-hidden rounded-2xl border-4 shadow-2xl transition duration-300 sm:w-64"
            style={{ borderColor: flipped ? undefined : "#a78bfa" }}
          >
            {!flipped ? (
              <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-violet-700 via-blue-700 to-sky-500">
                <span className="text-5xl font-black text-white/90 drop-shadow">NS</span>
              </div>
            ) : (
              <CardFace card={current} />
            )}
          </button>
          <p className="mt-4 animate-pulse text-sm font-semibold text-white/80">
            {flipped ? "Tap to continue" : "Tap to reveal"}
          </p>
          <p className="mt-1 text-xs text-white/50">
            Card {index + 1} of {cards.length}
          </p>
        </div>
      )}

      {done && (
        <div className="mt-6 flex w-full max-w-3xl flex-col items-center">
          <h2 className="text-2xl font-extrabold text-white">Your new cards!</h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {cards.map((card, i) => {
              const meta = rarityMeta(card.rarity);
              return (
                <div
                  key={`${card.id}-${i}`}
                  className={`flex flex-col items-center gap-1 rounded-xl border-2 bg-white/5 p-2 text-center ${
                    meta ? meta.border : "border-white/20"
                  } ${card.rarity === "Legendary" || card.rarity === "Mythic" ? `shadow-lg ${meta?.gradient ? "" : ""}` : ""}`}
                >
                  <div className="aspect-[5/7] w-full overflow-hidden rounded-lg bg-white/10">
                    {card.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={card.image} alt={card.name} className="h-full w-full object-contain" />
                    ) : (
                      <span className="flex h-full items-center justify-center p-1 text-xs font-semibold text-white/70">
                        {card.name}
                      </span>
                    )}
                  </div>
                  <p className="w-full truncate text-[11px] font-semibold text-white">{card.name}</p>
                  {card.rarity && (
                    <span className={`text-[10px] font-bold uppercase tracking-wide ${meta?.text ?? "text-white/60"}`}>
                      {card.rarity}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="mt-8 rounded-full bg-white px-8 py-3 text-sm font-bold uppercase tracking-wide text-violet-700 shadow-lg transition hover:scale-105"
          >
            Done
          </button>
        </div>
      )}
    </div>
  );
}

function CardFace({ card }: { card: GeneratedPackCard }) {
  const meta = card.rarity ? RARITY_COLORS[card.rarity] : null;
  const special = card.rarity === "Legendary" || card.rarity === "Mythic";
  return (
    <div
      className={`relative flex h-full w-full flex-col items-center justify-center bg-white ${
        special ? "animate-[pulse_1.6s_ease-in-out_1]" : ""
      }`}
    >
      {special && (
        <div
          className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${meta?.gradient} opacity-25 blur-xl`}
        />
      )}
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt={card.name} className="relative h-full w-full object-contain" />
      ) : (
        <span className="relative p-4 text-center text-lg font-bold text-slate-700">{card.name}</span>
      )}
      <div
        className={`absolute inset-x-0 bottom-0 flex flex-col items-center gap-0.5 bg-white/95 px-2 py-2 ${
          meta ? meta.text : "text-slate-600"
        }`}
      >
        <span className="text-sm font-bold text-slate-900">{card.name}</span>
        {card.rarity && <span className="text-xs font-extrabold uppercase tracking-widest">{card.rarity}</span>}
      </div>
    </div>
  );
}
