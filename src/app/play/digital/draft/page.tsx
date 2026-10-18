import Link from "next/link";
import { requirePlayerPage } from "@/lib/player-access";
import { prisma } from "@/lib/prisma";
import { listAvailableSets } from "@/lib/packs";
import { getCoinBalance } from "@/lib/coins";
import { DraftEntryForm } from "./draft-forms";
import { DRAFT_PRIZES } from "@/lib/draft-rewards";

export default async function DraftHomePage() {
  const session = await requirePlayerPage();
  const [sets, balance, pods] = await Promise.all([
    listAvailableSets(), getCoinBalance(session.user.id),
    prisma.draftPod.findMany({
      where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, setName: true, status: true, activeUserId: true },
    }),
  ]);
  const active = pods.find((pod) => pod.activeUserId !== null);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link href="/play/digital" className="text-sm text-blue-600">← Digital Play</Link>
      <div className="mt-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-sky-50 p-6 sm:p-8">
        <p className="text-xs font-bold uppercase tracking-widest text-violet-600">Six seats · One pod</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight">Bot Draft</h1>
        <p className="mt-3 text-slate-600">Draft with five bots, build a deck from your picks, then play everyone in your pod.</p>
        <ol className="mt-5 list-inside list-decimal space-y-2 text-sm text-slate-600">
          <li>Enter for <strong>2,000 Coins</strong>. Resume your pod any time at no extra cost.</li>
          <li>Three 10-card packs per seat. Pick one card at a time; pass left, right, then left.</li>
          <li>Keep all 30 cards you pick, including picks from packs passed to you.</li>
          <li>Build a 20–30-card deck from this draft only. Drafted duplicates are allowed; no Sprites.</li>
          <li>Five automatic rounds. Play each bot once while the other bots play their matches.</li>
        </ol>
        {active ? <div className="mt-6">
          <p className="mb-3 text-sm text-slate-600">You already have a draft in progress. Your picks and entry are saved.</p>
          <Link href={`/play/digital/draft/${active.id}`} className="inline-block rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white">Resume draft · {active.setName}</Link>
        </div> : <DraftEntryForm sets={sets} balance={balance} />}
      </div>
      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-5">
        <h2 className="text-lg font-bold">Draft prizes</h2>
        <p className="mt-2 text-sm text-slate-600">Finish all five rounds to earn your prize automatically. Coins go to your balance; packs from this draft’s set are saved in the Pack Store. Tied records share the same placing and prize.</p>
        <table className="mt-4 w-full text-left text-sm"><thead><tr><th className="py-2">Place</th><th>Coins</th><th>Packs</th></tr></thead>
          <tbody>{DRAFT_PRIZES.map((prize) => <tr key={prize.place} className="border-t border-amber-200"><td className="py-2">{prize.place}</td><td>{prize.coins.toLocaleString()}</td><td>{prize.packs}</td></tr>)}</tbody>
        </table>
      </section>
      {pods.length > 0 && <section className="mt-8">
        <h2 className="font-bold">Your drafts</h2>
        <ul className="mt-3 space-y-2">{pods.map((pod) => <li key={pod.id}>
          <Link href={`/play/digital/draft/${pod.id}`} className="flex items-center justify-between rounded-lg border border-sky-200 px-4 py-3 text-sm hover:bg-sky-50">
            <span>{pod.setName}</span><span className="text-slate-500">{pod.status.toLowerCase()}</span>
          </Link>
        </li>)}</ul>
      </section>}
    </div>
  );
}
