import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LegendarySlideshow } from "@/components/legendary-slideshow";

export default async function Home() {
  const session = await auth();
  const profileHref = session?.user
    ? `/player/${session.user.username}`
    : "/login";

  const legendaryCards = await prisma.card.findMany({
    where: { rarity: "Legendary", image: { not: null } },
    select: { id: true, name: true, image: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight">NS TCG</h1>
      <p className="mt-4 text-lg text-slate-600">
        A fast, competitive trading card game.
      </p>

      {legendaryCards.length > 0 && (
        <div className="mt-10">
          <LegendarySlideshow
            cards={legendaryCards.map((c) => ({
              id: c.id,
              name: c.name,
              image: c.image!,
            }))}
          />
        </div>
      )}

      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/play"
          className="rounded bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          PLAY
        </Link>
        <Link
          href="/decks/new"
          className="rounded border border-sky-300 px-5 py-2.5 text-sm font-medium hover:bg-sky-50"
        >
          BUILD A DECK
        </Link>
        <Link
          href={profileHref}
          className="rounded border border-sky-300 px-5 py-2.5 text-sm font-medium hover:bg-sky-50"
        >
          MY PROFILE
        </Link>
      </div>
    </div>
  );
}
