"use client";

import { useState } from "react";

// Hovering a card's name shows its card art in a floating preview. Cards
// without a confirmed image (image is null) just render as plain text —
// no placeholder/invented art.
export function CardNameHover({
  name,
  image,
  className,
}: {
  name: string;
  image: string | null;
  className?: string;
}) {
  const [hover, setHover] = useState(false);

  if (!image) {
    return <span className={className}>{name}</span>;
  }

  return (
    <span
      className={"relative inline-block cursor-help " + (className ?? "")}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      {name}
      {hover && (
        // Opens upward (anchored to the bottom of the trigger) rather than
        // downward — a card near the bottom of a long list would otherwise
        // push this ~320px-tall preview off-screen/behind other content.
        <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 aspect-[5/7] w-64 -translate-x-1/2 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-2xl ring-1 ring-violet-200 sm:w-80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={name} className="h-full w-full object-contain" />
        </span>
      )}
    </span>
  );
}
