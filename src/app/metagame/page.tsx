import Link from "next/link";
import {
  DEFAULT_MIN_MATCHES,
  getFilterOptions,
  getHighestWinRateCards,
  getMetaOverview,
  getMostPlayedCards,
  getMostPlayedCommanders,
  type MetagameFilters,
} from "@/lib/metagame";
import type { TimeWindow } from "@/lib/metagame-logic";

function OverviewTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-sky-200 bg-white px-4 py-3">
      <div className="text-xl font-semibold">{value}</div>
      <div className="text-xs text-slate-500">{label}</div>
    </div>
  );
}

function parseFilters(search: Record<string, string | string[] | undefined>): MetagameFilters {
  const get = (key: string) => {
    const v = search[key];
    return typeof v === "string" && v.length > 0 ? v : null;
  };
  const time = get("time");
  return {
    formatId: get("format"),
    cardType: get("type"),
    rarity: get("rarity"),
    time: time === "30" || time === "90" ? (time as TimeWindow) : "all",
  };
}

export default async function MetagamePage({
  searchParams,
}: PageProps<"/metagame">) {
  const search = await searchParams;
  const filters = parseFilters(search);

  const [filterOptions, overview, mostPlayed, highestWinRate] = await Promise.all([
    getFilterOptions(),
    getMetaOverview(filters),
    getMostPlayedCards(filters, 20),
    getHighestWinRateCards(filters, DEFAULT_MIN_MATCHES, 20),
  ]);

  const hasCommanders = filterOptions.cardTypes.includes("Commander");
  const commanders = hasCommanders
    ? await getMostPlayedCommanders(filters, 10)
    : { commanders: [] };

  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Metagame</h1>
      <p className="mt-1 text-sm text-slate-500">
        What&apos;s actually being played, derived live from saved decks and
        confirmed match results.
      </p>

      <form className="mt-6 flex flex-wrap gap-2 rounded border border-sky-200 bg-white p-3">
        <select
          name="format"
          defaultValue={filters.formatId ?? ""}
          className="rounded border border-sky-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600"
        >
          <option value="">All formats</option>
          {filterOptions.formats.map((f) => (
            <option key={f.id} value={f.id}>
              {f.name}
            </option>
          ))}
        </select>
        <select
          name="type"
          defaultValue={filters.cardType ?? ""}
          className="rounded border border-sky-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600"
        >
          <option value="">All card types</option>
          {filterOptions.cardTypes.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="rarity"
          defaultValue={filters.rarity ?? ""}
          className="rounded border border-sky-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600"
        >
          <option value="">All rarities</option>
          {filterOptions.rarities.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select
          name="time"
          defaultValue={filters.time}
          className="rounded border border-sky-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600"
        >
          <option value="all">All time</option>
          <option value="30">Last 30 days</option>
          <option value="90">Last 90 days</option>
        </select>
        <button
          type="submit"
          className="rounded bg-blue-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          Apply filters
        </button>
        {(filters.formatId || filters.cardType || filters.rarity || filters.time !== "all") && (
          <Link
            href="/metagame"
            className="rounded border border-sky-300 px-4 py-1.5 text-sm hover:bg-sky-50"
          >
            Reset
          </Link>
        )}
      </form>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-5">
        <OverviewTile label="Cards Tracked" value={String(overview.cardsTracked)} />
        <OverviewTile label="Decks Analysed" value={String(overview.decksAnalysed)} />
        <OverviewTile
          label="Confirmed Matches Analysed"
          value={String(overview.confirmedMatchesAnalysed)}
        />
        <OverviewTile
          label="Most Played Card"
          value={overview.mostPlayedCard?.name ?? "—"}
        />
        <OverviewTile
          label="Highest Win Rate Card"
          value={overview.highestWinRateCard?.name ?? "—"}
        />
      </div>

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Most Played Cards
      </h2>
      {mostPlayed.cards.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          No decks match the current filters.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {mostPlayed.cards.map((card, i) => (
            <li key={card.id}>
              <Link
                href={`/cards/${card.slug}`}
                className="block rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">
                    #{i + 1} {card.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {[card.rarity, card.type].filter(Boolean).join(" • ")}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                  <span>Used in {card.usagePercent.toFixed(1)}% of decks</span>
                  <span>Decks: {card.decks}</span>
                  <span>Average copies: {card.averageCopies.toFixed(1)}</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Highest Win Rate
      </h2>
      <p className="mt-1 text-xs text-slate-500">
        Requires at least {DEFAULT_MIN_MATCHES} confirmed matches, derived
        only from matches whose deck contents were recorded at match time —
        never from a deck&apos;s current (and possibly since-edited) card
        list.
      </p>
      {highestWinRate.cards.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Not enough confirmed match data yet for any card to reach the
          minimum sample size.
        </p>
      ) : (
        <ol className="mt-3 flex flex-col gap-2">
          {highestWinRate.cards.map((card, i) => (
            <li key={card.id}>
              <Link
                href={`/cards/${card.slug}`}
                className="block rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
              >
                <div className="flex items-baseline justify-between">
                  <span className="font-semibold">
                    #{i + 1} {card.name}
                  </span>
                  <span className="text-xs text-slate-500">
                    {[card.rarity, card.type].filter(Boolean).join(" • ")}
                  </span>
                </div>
                <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                  <span className="font-medium text-green-700">
                    Win rate: {card.winRate.toFixed(1)}%
                  </span>
                  <span>
                    {card.wins}W-{card.losses}L
                  </span>
                  <span>Matches: {card.wins + card.losses}</span>
                  <span>Deck usage: {card.usagePercent.toFixed(1)}%</span>
                </div>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {hasCommanders && (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Most Played Commanders
          </h2>
          {commanders.commanders.length === 0 ? (
            <p className="mt-3 text-sm text-slate-500">
              No decks with a Commander match the current filters.
            </p>
          ) : (
            <ol className="mt-3 flex flex-col gap-2">
              {commanders.commanders.map((c, i) => (
                <li key={c.id}>
                  <Link
                    href={`/cards/${c.slug}`}
                    className="block rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
                  >
                    <div className="flex items-baseline justify-between">
                      <span className="font-semibold">
                        #{i + 1} {c.name}
                      </span>
                      <span className="text-xs text-slate-500">{c.rarity}</span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-slate-600">
                      <span>Used in {c.usagePercent.toFixed(1)}% of decks</span>
                      <span>Decks: {c.decks}</span>
                      {c.winRate !== undefined && (
                        <span className="font-medium text-green-700">
                          Win rate: {c.winRate.toFixed(1)}% ({c.wins}W-{c.losses}L)
                        </span>
                      )}
                    </div>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </div>
  );
}
