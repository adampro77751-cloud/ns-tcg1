import Link from "next/link";
import Image from "next/image";
import { RANKED_REWARDS } from "@/lib/ranked-reward-catalog";
import { DIAMOND_RANK_STYLE } from "@/lib/card-style-catalog";
import { claimRankedRewardsAction } from "@/lib/actions/draft-actions";
import { requirePlayerPage } from "@/lib/player-access";
import { prisma } from "@/lib/prisma";
import { listAvailableSets } from "@/lib/packs";
import { getCoinBalance } from "@/lib/coins";
import { DraftEntryForm } from "./draft-forms";
import { DRAFT_PRIZES } from "@/lib/draft-rewards";
import { DRAFT_RANKS, getDraftRank } from "@/lib/draft-rank";

export default async function DraftHomePage() {
  const session = await requirePlayerPage();
  const [sets, balance, pods, player] = await Promise.all([
    listAvailableSets(), getCoinBalance(session.user.id),
    prisma.draftPod.findMany({
      where: { userId: session.user.id }, orderBy: { createdAt: "desc" }, take: 20,
      select: { id: true, setName: true, status: true, activeUserId: true, ranked: true },
    }),
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { draftRankPoints: true, draftRewardPoints: true } }),
  ]);
  const rank = getDraftRank(player.draftRankPoints);
  const nextRank = DRAFT_RANKS.find(tier => tier.points > player.draftRankPoints);
  const active = pods.find((pod) => pod.activeUserId !== null);
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link href="/play/digital" className="text-sm text-blue-600">← Digital Play</Link>
      <section className="mt-6 rounded-2xl border border-violet-300 bg-violet-50 p-6">
        <p className="text-sm font-bold text-violet-700">Your ranked draft standing</p>
        <h2 className="mt-1 text-2xl font-black">{rank.name} · {player.draftRankPoints.toLocaleString()} RP</h2>
        <p className="mt-2 text-sm text-slate-600">{nextRank ? `${nextRank.points - player.draftRankPoints} RP to ${nextRank.name}.` : "You reached the highest tier. Keep building your RP!"} {rank.description}</p>
        <p className="mt-3 text-sm text-slate-600">Finish a ranked pod to update your rank: +60 RP per win, +10 per draw, −30 per loss, with a minimum of 0 RP. Difficulty is fixed when you enter. Entry fees and prizes are the same in both modes.</p>
        <ol className="mt-4 flex flex-wrap gap-2">{DRAFT_RANKS.map(tier => <li key={tier.name} className={`rounded-full border px-3 py-1 text-xs font-bold ${rank.name === tier.name ? "border-violet-600 bg-violet-600 text-white" : "border-violet-200 bg-white text-violet-800"}`}>{tier.name} · {tier.points.toLocaleString()}+ RP</li>)}</ol>
      </section>
      <section className="mt-6 overflow-hidden rounded-2xl border border-cyan-300 bg-gradient-to-br from-slate-950 to-blue-950 p-6 text-white">
        <p className="text-xs font-bold uppercase tracking-widest text-cyan-300">Rank up. Cash in.</p>
        <h2 className="mt-2 text-2xl font-black">185,000 Coins on the road to Diamond</h2>
        <p className="mt-2 text-sm text-sky-100">First-time rank rewards stack on top of draft prizes and arrive automatically when you finish a ranked pod. Each tier pays once, and rewards stay yours if your rank drops.</p>
        <div className="mt-5 grid gap-6 sm:grid-cols-[1fr_160px]">
          <div>
            <ul className="space-y-3">{RANKED_REWARDS.map(reward => <li key={reward.name} className="rounded-xl border border-white/20 bg-white/5 p-3">
              <div className="flex justify-between gap-2"><strong>{reward.name} · {reward.points.toLocaleString()} RP</strong><span className="text-xs text-cyan-200">{player.draftRewardPoints >= reward.points ? "Reward received" : "First-time reward"}</span></div>
              <p className="mt-1 text-lg font-bold text-amber-300">{reward.coins.toLocaleString()} Coins</p>
              {reward.name === "Diamond" && <p className="mt-1 text-sm text-sky-100">+ The Final Bell · Diamond Rank permanent card style</p>}
            </li>)}</ul>
            <form action={claimRankedRewardsAction} className="mt-4"><button className="rounded-full bg-cyan-300 px-4 py-2 text-sm font-bold text-slate-950">Collect any past rank rewards</button></form>
            <p className="mt-2 text-xs text-sky-200">Already climbed before rewards arrived? Your previous highest rank counts too.</p>
          </div>
          <div><Image src={DIAMOND_RANK_STYLE.image} alt="The Final Bell exclusive Diamond Rank card style" width={212} height={297} className="w-full rounded-xl" /><p className="mt-3 text-center text-sm font-bold text-cyan-200">Exclusive to Diamond</p><p className="mt-1 text-center text-xs text-sky-100">Unlocks permanently and equips automatically. Manage it in Collection.</p></div>
        </div>
      </section>
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
            <span>{pod.setName} · {pod.ranked ? "Ranked" : "Casual"}</span><span className="text-slate-500">{pod.status.toLowerCase()}</span>
          </Link>
        </li>)}</ul>
      </section>}
    </div>
  );
}
