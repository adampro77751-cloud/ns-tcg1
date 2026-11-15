import Link from "next/link";
import { requirePlayerPage } from "@/lib/player-access";
import { prisma } from "@/lib/prisma";
import { CHRISTMAS_REWARDS, christmasStatus } from "@/lib/christmas-catalog";
import { ChristmasClaimButton } from "./claim-button";
import { AutoRefresh } from "@/components/auto-refresh";

export default async function ChristmasPage() {
  const session = await requirePlayerPage();
  const status = christmasStatus();
  // Before launch the page is a teaser; no doors or reward details are released.
  const claims = status.phase === "active" ? await prisma.christmasClaim.findMany({ where: { userId: session.user.id, year: 2026 }, select: { day: true } }) : [];
  return <main className="mx-auto max-w-6xl px-4 py-12">
    <AutoRefresh intervalMs={60000} />
    <header className="rounded-3xl bg-gradient-to-br from-emerald-950 via-emerald-900 to-red-950 p-8 text-white sm:p-12">
      <p className="text-xs font-bold uppercase tracking-[0.25em] text-amber-200">Christmas 2026</p>
      <h1 className="mt-3 text-4xl font-black sm:text-5xl">25 days of Christmas gifts</h1>
      <p className="mt-4 max-w-xl text-emerald-100">Unwrap Coins, packs and exclusive Christmas skins. The gifts grow every day, ending with a special Christmas card on December 25.</p>
      <p className="mt-5 font-semibold text-amber-200">{status.phase === "upcoming" ? "Opens December 1, 2026 at 00:00 GMT" : status.phase === "ended" ? "The 2026 calendar has ended. Merry Christmas!" : "A new door opens every day at 00:00 GMT."}</p>
    </header>
    {status.phase === "active" && <>
      <p className="my-6 text-sm text-slate-600">{claims.length}/25 gifts collected. Missed a day? Earlier doors stay open until December 31 at 23:59 GMT. <Link className="underline" href="/store/packs">Open your packs</Link> or <Link className="underline" href="/collection">view your collection</Link>.</p>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">{CHRISTMAS_REWARDS.map(reward => {
        const claimed = claims.some(claim => claim.day === reward.day);
        const unlocked = reward.day <= status.unlockedDay;
        return <section key={reward.day} className={`rounded-2xl border p-5 ${reward.day === 25 ? "border-amber-400 bg-amber-50" : "border-emerald-200 bg-white"}`}>
          <p className="text-xs font-bold uppercase text-emerald-700">December {reward.day}</p>
          <h2 className="mt-2 text-2xl font-black">{reward.day === 25 ? "Christmas finale" : `Gift ${reward.day}`}</h2>
          <p className="mt-3 font-semibold">{reward.coins.toLocaleString()} Coins</p>
          {reward.packs > 0 && <p className="mt-1 text-sm">+ {reward.packs} unopened {reward.packs === 1 ? "pack" : "packs"}</p>}
          {reward.style && <p className="mt-1 text-sm font-semibold text-red-800">+ {reward.style.name} skin</p>}
          {reward.finalCard && <p className="mt-1 text-sm font-semibold text-red-800">+ Christmas day exclusive Spell</p>}
          {claimed ? <p className="mt-4 font-bold text-emerald-700">Gift collected</p> : unlocked ? <ChristmasClaimButton day={reward.day} /> : <p className="mt-4 text-sm text-slate-500">Opens December {reward.day}, 00:00 GMT</p>}
        </section>;
      })}</div>
    </>}
  </main>;
}
