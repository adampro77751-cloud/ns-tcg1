import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { LegendarySlideshow } from "@/components/legendary-slideshow";
import { NewsCard } from "@/components/news-card";
import { NEWS_ITEMS } from "@/lib/news";

export default async function Home() {
  const session = await auth();
  const profileHref = session?.user
    ? `/player/${session.user.username}`
    : "/login";
  const isAdmin = session?.user?.role === "ADMIN";

  const legendaryCards = await prisma.card.findMany({
    where: { rarity: "Legendary", image: { not: null } },
    select: { id: true, name: true, image: true },
    orderBy: { name: "asc" },
  });

  const featuredNews = NEWS_ITEMS.find((n) => n.featured);
  const otherNews = NEWS_ITEMS.filter((n) => !n.featured);

  return (
    <div className="flex flex-1 flex-col">
      {/* ============ HERO ============ */}
      <section className="relative overflow-hidden bg-gradient-to-br from-violet-700 via-blue-600 to-sky-400 px-4 py-24 text-center text-white sm:py-32">
        <div className="pointer-events-none absolute -left-24 -top-24 h-72 w-72 rounded-full bg-fuchsia-400/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 -right-24 h-80 w-80 rounded-full bg-sky-300/30 blur-3xl" />
        <div className="pointer-events-none absolute left-1/2 top-1/3 h-64 w-64 -translate-x-1/2 rounded-full bg-violet-300/20 blur-3xl" />

        <div className="relative mx-auto max-w-3xl">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/15 px-4 py-1.5 text-sm font-semibold text-white ring-1 ring-white/30 backdrop-blur-sm">
            🔥 NS TCG Releases Friday
          </span>

          <h1 className="mt-6 text-6xl font-black tracking-tight drop-shadow-lg sm:text-7xl md:text-8xl">
            NS TCG
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-lg text-sky-50 sm:text-xl">
            A fast, competitive trading card game.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/play"
              className="rounded-full bg-white px-7 py-3 text-sm font-bold uppercase tracking-wide text-violet-700 shadow-lg transition hover:scale-105 hover:shadow-xl"
            >
              Play
            </Link>
            <Link
              href="/decks/new"
              className="rounded-full border border-white/60 bg-white/10 px-7 py-3 text-sm font-bold uppercase tracking-wide text-white backdrop-blur-sm transition hover:scale-105 hover:bg-white/20"
            >
              Build a Deck
            </Link>
            <Link
              href={profileHref}
              className="rounded-full border border-white/60 bg-white/10 px-7 py-3 text-sm font-bold uppercase tracking-wide text-white backdrop-blur-sm transition hover:scale-105 hover:bg-white/20"
            >
              My Profile
            </Link>
            <div className="flex flex-col items-center gap-1.5">
              <Link
                href="/store"
                className="rounded-full border border-white/60 bg-white/10 px-7 py-3 text-sm font-bold uppercase tracking-wide text-white backdrop-blur-sm transition hover:scale-105 hover:bg-white/20"
              >
                Store
              </Link>
              <span className="text-xs font-medium text-sky-100">
                Pre-order NS TCG packs
              </span>
            </div>
            <div className="flex flex-col items-center gap-1.5">
              {isAdmin ? (
                <Link
                  href="/play/digital"
                  className="relative rounded-full border border-white/60 bg-white/10 px-7 py-3 text-sm font-bold uppercase tracking-wide text-white backdrop-blur-sm transition hover:scale-105 hover:bg-white/20"
                >
                  Digital Play
                  <span className="absolute -right-2 -top-2 rounded-full bg-fuchsia-500 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">
                    Beta
                  </span>
                </Link>
              ) : (
                <span
                  className="relative cursor-not-allowed rounded-full border border-white/30 bg-white/5 px-7 py-3 text-sm font-bold uppercase tracking-wide text-white/60"
                  title="Digital Play is currently in private beta"
                >
                  Digital Play
                  <span className="absolute -right-2 -top-2 rounded-full bg-fuchsia-500/70 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-white shadow">
                    Beta
                  </span>
                </span>
              )}
              <span className="text-xs font-medium text-sky-100">
                {isAdmin ? "Play NS TCG Online" : "Private Beta"}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ============ CARD SLIDESHOW ============ */}
      {legendaryCards.length > 0 && (
        <section className="bg-white px-4 py-20 sm:py-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-violet-600">
              Legendary Spotlight
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Meet the Legendary Cards
            </h2>
            <p className="mx-auto mt-3 max-w-md text-sm text-slate-500 sm:text-base">
              A rotating look at some of the rarest cards in NS TCG.
            </p>

            <div className="mt-12 flex justify-center">
              <LegendarySlideshow
                cards={legendaryCards.map((c) => ({
                  id: c.id,
                  name: c.name,
                  image: c.image!,
                }))}
              />
            </div>
          </div>
        </section>
      )}

      {/* ============ LATEST NEWS ============ */}
      <section className="bg-gradient-to-b from-sky-50 to-violet-50 px-4 py-20 sm:py-24">
        <div className="mx-auto max-w-3xl">
          <div className="text-center">
            <span className="text-xs font-bold uppercase tracking-widest text-violet-600">
              Stay Updated
            </span>
            <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Latest News
            </h2>
          </div>

          <div className="mt-10 flex flex-col gap-6">
            {featuredNews && <NewsCard item={featuredNews} featured />}
            {otherNews.length > 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                {otherNews.map((item) => (
                  <NewsCard key={item.id} item={item} />
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
