"use client";

import { useCallback, useEffect, useState } from "react";

type SlideCard = {
  id: string;
  name: string;
  image: string;
};

const INTERVAL_MS = 4000;

export function LegendarySlideshow({ cards }: { cards: SlideCard[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (cards.length <= 1 || paused) return;
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % cards.length);
    }, INTERVAL_MS);
    return () => clearInterval(timer);
  }, [cards.length, paused]);

  const goTo = useCallback(
    (i: number) => setIndex(((i % cards.length) + cards.length) % cards.length),
    [cards.length],
  );

  if (cards.length === 0) return null;

  const current = cards[index];

  return (
    <div
      className="flex flex-col items-center"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="relative">
        {/* Purple/blue glow behind the card */}
        <div className="absolute -inset-6 -z-10 rounded-[2rem] bg-gradient-to-br from-violet-500/40 via-blue-400/30 to-sky-300/30 blur-2xl" />

        <div className="relative aspect-[5/7] w-56 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-2xl ring-1 ring-violet-200 sm:w-72 md:w-80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            key={current.id}
            src={current.image}
            alt={current.name}
            className="h-full w-full animate-[ns-fade-in_0.5s_ease] object-contain"
          />
        </div>

        {cards.length > 1 && (
          <>
            <button
              type="button"
              aria-label="Previous card"
              onClick={() => goTo(index - 1)}
              className="absolute left-0 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-violet-200 bg-white/90 text-violet-700 shadow-md transition hover:scale-110 hover:bg-white"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="Next card"
              onClick={() => goTo(index + 1)}
              className="absolute right-0 top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-10 w-10 items-center justify-center rounded-full border border-violet-200 bg-white/90 text-violet-700 shadow-md transition hover:scale-110 hover:bg-white"
            >
              ›
            </button>
          </>
        )}
      </div>

      <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-violet-700">
        Legendary — {current.name}
      </p>

      {cards.length > 1 && (
        <div className="mt-3 flex gap-2">
          {cards.map((c, i) => (
            <button
              key={c.id}
              type="button"
              aria-label={`Show ${c.name}`}
              onClick={() => goTo(i)}
              className={
                "h-2 w-2 rounded-full transition-all " +
                (i === index
                  ? "w-6 bg-gradient-to-r from-violet-600 to-blue-500"
                  : "bg-sky-200 hover:bg-sky-300")
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}
