import Link from "next/link";
import { requirePlayerPage } from "@/lib/player-access";
import { getDailyTasks } from "@/lib/daily-tasks";
import { getCoinBalance } from "@/lib/coins";
import { ClaimButton } from "./claim-button";

export default async function DailyTasksPage() {
  const session = await requirePlayerPage();
  const [{ day, tasks }, balance] = await Promise.all([getDailyTasks(session.user.id), getCoinBalance(session.user.id)]);
  const total = tasks.reduce((sum, task) => sum + task.reward, 0);
  const claimed = tasks.filter(task => task.claimed).reduce((sum, task) => sum + task.reward, 0);
  return <div className="mx-auto w-full max-w-4xl px-4 py-12">
    <div className="flex flex-wrap items-center justify-between gap-4">
      <h1 className="text-3xl font-black">Daily tasks</h1>
      <span className="rounded-full border border-amber-300 bg-amber-50 px-4 py-2 font-bold text-amber-800">🪙 {balance.toLocaleString()} Coins</span>
    </div>
    <p className="mt-3 text-slate-600">Easy goals, plenty of Coins. Earn up to {total.toLocaleString()} Coins every day — enough for 8 normal packs, with Coins to spare.</p>
    <p className="mt-2 text-sm text-slate-600">Resets daily at midnight UTC. Claim completed rewards before the reset. Today&apos;s progress counts even before you visit this page.</p>
    <div className="mt-6 rounded-2xl border border-amber-200 bg-amber-50 p-5">
      <p className="font-bold text-amber-900">{claimed.toLocaleString()} / {total.toLocaleString()} daily Coins claimed</p>
      <p className="mt-1 text-sm text-amber-800">Start with your free check-in gift, then play or open a pack to earn more.</p>
    </div>
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      {tasks.map(task => <section key={task.key} className="rounded-2xl border border-sky-200 bg-white p-5">
        <div className="flex items-start justify-between gap-3"><h2 className="text-lg font-bold">{task.name}</h2><span className="whitespace-nowrap font-bold text-amber-700">🪙 {task.reward.toLocaleString()}</span></div>
        <p className="mt-2 text-sm text-slate-600">{task.description}</p>
        <label className="mt-4 block text-sm font-semibold">Progress: {task.progress} / {task.target}<progress aria-label={task.name} value={task.progress} max={task.target} className="mt-2 block h-2 w-full accent-violet-600" /></label>
        <div className="mt-4">{task.claimed ? <p className="font-bold text-emerald-700">✓ Reward claimed</p> : task.progress >= task.target ? <ClaimButton taskKey={task.key} day={day} /> : <Link href={task.href} className="inline-block rounded-full border border-violet-300 px-5 py-2 text-sm font-bold text-violet-700">{task.activity === "packs" ? "Open a pack" : "Play a match"} →</Link>}</div>
      </section>)}
    </div>
  </div>;
}
