"use client";

import { useEffect, useState } from "react";

type SlideCard = {
  id: string;
  name: string;
  image: string;
};

const INTERVAL_MS = 3500;

export function LegendarySlideshow({ cards }: { cards: SlideCard[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (cards.length <= 1) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % cards.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [cards.length]);

  if (cards.length === 0) return null;

  const current = cards[index];

  return (
    <div className="flex flex-col items-center">
      <div className="relative h-72 w-52 overflow-hidden rounded-xl border border-sky-300 bg-white shadow-lg sm:h-80 sm:w-56">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={current.id}
          src={current.image}
          alt={current.name}
          className="h-full w-full object-cover"
        />
      </div>
      <p className="mt-3 text-xs font-semibold uppercase tracking-wide text-amber-700">
        Legendary — {current.name}
      </p>
      {cards.length > 1 && (
        <div className="mt-2 flex gap-1.5">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Show ${c.name}`}
              onClick={() => setIndex(i)}
              className={
                "h-1.5 w-1.5 rounded-full transition-colors " +
                (i === index ? "bg-blue-600" : "bg-sky-200")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
