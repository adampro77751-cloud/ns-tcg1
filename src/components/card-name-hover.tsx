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
        <span className="pointer-events-none absolute left-1/2 top-full z-50 mt-2 aspect-[5/7] w-64 -translate-x-1/2 overflow-hidden rounded-2xl border-4 border-white bg-white shadow-2xl ring-1 ring-violet-200 sm:w-80">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={name} className="h-full w-full object-contain" />
        </span>
      )}
    </span>
  );
}
