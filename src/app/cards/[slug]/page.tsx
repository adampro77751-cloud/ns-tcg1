import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getCardMetaDetail, type MetagameFilters } from "@/lib/metagame";

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-sky-200 bg-white px-4 py-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

// Metagame stats are always for "all time, all formats" on a card's own
// page — a dedicated filter bar here would just duplicate /metagame's,
// and this page is reached by clicking through from there.
const ALL_TIME_FILTERS: MetagameFilters = {
  formatId: null,
  cardType: null,
  rarity: null,
  time: "all",
};

export default async function CardDetailPage({
  params,
}: PageProps<"/cards/[slug]">) {
  const { slug } = await params;

  const card = await prisma.card.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      type: true,
      rarity: true,
      attack: true,
      defence: true,
      speed: true,
      rulesText: true,
      set: true,
      image: true,
    },
  });
  if (!card) notFound();

  const detail = await getCardMetaDetail(card.id, ALL_TIME_FILTERS);
  const hasStats =
    card.attack !== null || card.defence !== null || card.speed !== null;

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <Link href="/metagame" className="text-sm text-blue-600">
        ← Metagame
      </Link>

      <div className="mt-2 flex items-start gap-4">
        {card.image && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={card.image}
            alt={card.name}
            className="w-28 shrink-0 rounded-lg border border-sky-300 shadow"
          />
        )}
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{card.name}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {[card.type, card.rarity, card.set].filter(Boolean).join(" · ")}
          </p>
        </div>
      </div>

      {hasStats && (
        <div className="mt-4 text-sm text-slate-600">
          {card.attack !== null && <>ATK {card.attack} </>}
          {card.defence !== null && <>· DEF {card.defence} </>}
          {card.speed !== null && <>· SPD {card.speed}</>}
        </div>
      )}

      {card.rulesText && (
        <div className="mt-4 rounded border border-sky-200 bg-sky-50 px-4 py-3">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Rules text
          </h2>
          <p className="mt-1 whitespace-pre-line text-sm text-slate-800">
            {card.rulesText}
          </p>
        </div>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Metagame
      </h2>
      <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatTile
          label="Usage Rate"
          value={`${detail?.usage.usagePercent.toFixed(1) ?? "0.0"}%`}
        />
        <StatTile
          label="Decks Using It"
          value={String(detail?.usage.decks ?? 0)}
        />
        <StatTile
          label="Total Copies"
          value={String(detail?.usage.totalCopies ?? 0)}
        />
        <StatTile
          label="Average Copies"
          value={(detail?.usage.averageCopies ?? 0).toFixed(1)}
        />
        <StatTile
          label="Win Rate"
          value={`${detail?.winLoss.winRate.toFixed(1) ?? "0.0"}%`}
        />
        <StatTile label="Wins" value={String(detail?.winLoss.wins ?? 0)} />
        <StatTile label="Losses" value={String(detail?.winLoss.losses ?? 0)} />
      </div>
      <p className="mt-2 text-xs text-slate-500">
        {detail?.confirmedMatches ?? 0} confirmed match
        {detail?.confirmedMatches === 1 ? "" : "es"} with a recorded deck
        snapshot for this card.
      </p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Commonly Played With
      </h2>
      {!detail || detail.commonlyPlayedWith.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Not enough deck data yet to determine this.
        </p>
      ) : (
        <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {detail.commonlyPlayedWith.map((c) => (
            <li key={c.id}>
              <Link
                href={`/cards/${c.slug}`}
                className="flex items-center justify-between rounded border border-sky-200 bg-white px-3 py-2 text-sm hover:border-slate-400"
              >
                <span className="font-medium">{c.name}</span>
                <span className="text-xs text-slate-500">{c.decks}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
