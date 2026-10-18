import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlayerPage } from "@/lib/player-access";
import { prisma } from "@/lib/prisma";
import { countDraftCards, getDraftStandings, type DraftState } from "@/lib/draft-logic";
import { DraftPickForm, DraftDeckForm, ResumeDraftForm } from "../draft-forms";
import { getDraftPrize } from "@/lib/draft-rewards";

export default async function DraftPodPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requirePlayerPage();
  const { id } = await params;
  const pod = await prisma.draftPod.findFirst({
    where: { id, userId: session.user.id },
    include: { matches: { orderBy: { draftRound: "desc" }, select: { id: true, status: true, draftRound: true, draftOpponentSeat: true } } },
  });
  if (!pod) notFound();
  const state = pod.state as unknown as DraftState;
  // Only the current pack and the HUMAN's picks leave the server. Other
  // seats' pools, unopened packs and deck contents stay private.
  const ids = [...(state.packs[0] ?? []), ...state.pools[0]];
  const cards = await prisma.card.findMany({
    where: { id: { in: [...new Set(ids)] } },
    select: { id: true, name: true, type: true, image: true, rarity: true, attack: true, defence: true, speed: true, rulesText: true },
  });
  const byId = new Map(cards.map((card) => [card.id, card]));
  const pool = countDraftCards(state.pools[0]).map((row) => ({ ...byId.get(row.cardId)!, quantity: row.quantity }));
  const latest = pod.matches[0];
  const standings = getDraftStandings(state.results);
  const prize = pod.reward as { place: number; coins: number; packs: number } | null;
  const seatName = (seat: number) => seat === 0 ? session.user.username : `Bot ${seat}`;

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link href="/play/digital/draft" className="text-sm text-blue-600">← Your drafts</Link>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-widest text-violet-600">{pod.setName} · Six-player pod</p>
          <h1 className="mt-1 text-3xl font-black tracking-tight">
            {pod.status === "DRAFTING" ? `Pack ${state.pack + 1} · Pick ${state.pick + 1}`
              : pod.status === "BUILDING" ? "Build your draft deck" : pod.status === "COMPLETED" ? "Draft complete" : `Round ${(latest?.draftRound ?? 0) + 1} of 5`}
          </h1>
        </div>
        <Link href="/collection" className="rounded-full border border-sky-200 px-4 py-2 text-sm font-semibold">{state.pools[0].length} picks kept in your collection</Link>
      </div>

      {pod.status === "DRAFTING" && <section className="mt-6">
        <p className="mb-4 text-sm font-semibold text-violet-600">Passing {state.pack % 2 === 0 ? "left →" : "← right"} · You + five drafting bots</p>
        <DraftPickForm key={pod.version} podId={pod.id} version={pod.version} cards={state.packs[0].map((cardId) => byId.get(cardId)!)} />
      </section>}

      {pod.status === "BUILDING" && <DraftDeckForm podId={pod.id} version={pod.version} pool={pool} />}

      {(pod.status === "PLAYING" || pod.status === "COMPLETED") && <>
        {pod.status === "PLAYING" && latest && <div className="mt-6 rounded-2xl border border-violet-200 bg-violet-50 p-6">
          <h2 className="text-lg font-bold">You vs Bot {latest.draftOpponentSeat}</h2>
          <p className="mt-2 text-sm text-slate-600">Your opponent is from this pod and uses a deck built from its own draft picks. Your next match is created automatically when this one ends.</p>
          {latest.status === "IN_PROGRESS" ? <Link href={`/play/digital/${latest.id}`} className="mt-4 inline-block rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white">Play round {(latest.draftRound ?? 0) + 1}</Link>
            : <ResumeDraftForm podId={pod.id} />}
        </div>}
        {pod.status === "COMPLETED" && <p className="mt-6 rounded-xl bg-violet-50 p-5 font-semibold text-violet-800">You finished all five rounds with {standings.find((row) => row.seat === 0)?.wins} wins. All 30 draft picks are yours to keep.</p>}
        {pod.status === "COMPLETED" && prize && <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="text-lg font-bold">Place {prize.place} · Prizes awarded</h2>
          <p className="mt-2 text-sm">{prize.coins.toLocaleString()} Coins added to your balance · {prize.packs} reward pack{prize.packs === 1 ? "" : "s"} earned.</p>
          {prize.packs > 0 && <Link href="/store/packs" className="mt-3 inline-block font-semibold text-violet-700 underline">Open your reward packs →</Link>}
        </section>}
        <section className="mt-8">
          <h2 className="text-lg font-bold">Pod standings</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-sky-200">
            <table className="w-full text-left text-sm"><thead className="bg-sky-50"><tr>
              <th className="p-3">Place</th><th className="p-3">Player</th><th className="p-3">Wins</th><th className="p-3">Losses</th><th className="p-3">Draws</th><th className="p-3">Points</th>
            </tr></thead><tbody>{standings.map((row) => <tr key={row.seat} className={row.seat === 0 ? "bg-violet-50 font-semibold" : "border-t border-sky-100"}>
              <td className="p-3">{getDraftPrize(state.results, row.seat).place}</td><td className="p-3">{seatName(row.seat)}</td><td className="p-3">{row.wins}</td><td className="p-3">{row.losses}</td><td className="p-3">{row.draws}</td><td className="p-3">{row.points}</td>
            </tr>)}</tbody></table>
          </div>
          <p className="mt-2 text-xs text-slate-500">Win: 3 points · Draw: 1 point. Tied records share a placing. Bot-only games use the same battle engine; games stalled beyond 100 turns or 1,000 decisions are draws.</p>
        </section>
        <section className="mt-8"><h2 className="text-lg font-bold">Pod matches</h2>
          <ul className="mt-3 grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{[...state.results].sort((a, b) => a.round - b.round).map((result) => <li key={`${result.round}-${result.seats.join("-")}`} className="rounded-lg border border-sky-200 p-3">
            <p className="text-xs text-slate-500">Round {result.round + 1}</p>
            <p className="mt-1 font-semibold">{result.seats.map(seatName).join(" vs ")}</p>
            <p className="mt-1 text-slate-600">{result.winner === null ? "Draw" : `${seatName(result.winner)} won`}</p>
          </li>)}</ul>
        </section>
      </>}

      {pod.status !== "BUILDING" && pool.length > 0 && <section className="mt-8">
        <h2 className="text-lg font-bold">Your draft pool</h2>
        <ul className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2 lg:grid-cols-3">{pool.map((card) => <li key={card.id} className="rounded-lg border border-sky-200 px-3 py-2">
          <Link href={`/collection`} className="font-medium">{card.quantity}× {card.name}</Link><span className="ml-2 text-xs text-slate-500">{card.type}</span>
        </li>)}</ul>
      </section>}
    </div>
  );
}
