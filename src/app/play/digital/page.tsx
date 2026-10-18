import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// The lobby is public; playing requires login. Routes and actions also
// validate ownership and match participation before granting access.
export default async function DigitalPlayHomePage() {
  const session = await auth();
  const canPlay = !!session?.user;

  const myMatches = canPlay
    ? await prisma.digitalMatch.findMany({
        where: {
          status: { in: ["WAITING", "READY", "IN_PROGRESS"] },
          players: { some: { userId: session!.user.id } },
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          mode: true,
          status: true,
          joinCode: true,
          format: { select: { name: true } },
        },
      })
    : [];

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="flex items-center gap-2">
        <h1 className="text-3xl font-bold tracking-tight">NS TCG Digital Play</h1>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        Play online with another player, challenge the bot, or draft a new deck. Sign in to start playing.
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-amber-200 bg-gradient-to-br from-amber-50 to-violet-50 p-6 sm:col-span-2">
          <h2 className="text-lg font-bold">Bot Draft · 2,000 Coins</h2>
          <p className="mt-1 text-sm text-slate-600">Join a pod of six. Draft with five bots, keep your picks, and play five automatically paired rounds.</p>
          {canPlay ? <Link href="/play/digital/draft" className="mt-4 inline-block rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700">Draft & play</Link> : <LoginNotice />}
        </div>
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-sky-50 p-6">
          <h2 className="text-lg font-bold">Play Online</h2>
          <p className="mt-1 text-sm text-slate-600">
            Play against another player using a match code.
          </p>
          {canPlay ? (
            <div className="mt-4 flex flex-col gap-2">
              <Link
                href="/play/digital/online/new"
                className="rounded-full bg-violet-600 px-4 py-2 text-center text-sm font-bold text-white hover:bg-violet-700"
              >
                Create match
              </Link>
              <Link
                href="/play/digital/online/join"
                className="rounded-full border border-violet-300 px-4 py-2 text-center text-sm font-bold text-violet-700 hover:bg-violet-50"
              >
                Join with code
              </Link>
            </div>
          ) : (
            <LoginNotice />
          )}
        </div>

        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-sky-50 p-6">
          <h2 className="text-lg font-bold">Play vs Bot</h2>
          <p className="mt-1 text-sm text-slate-600">
            Play against a computer-controlled opponent.
          </p>
          {canPlay ? (
            <div className="mt-4">
              <Link
                href="/play/digital/bot/new"
                className="block rounded-full bg-violet-600 px-4 py-2 text-center text-sm font-bold text-white hover:bg-violet-700"
              >
                Start bot match
              </Link>
            </div>
          ) : (
            <LoginNotice />
          )}
        </div>
      </div>

      {myMatches.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-slate-500">
            Your matches
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {myMatches.map((m) => (
              <li key={m.id}>
                <Link
                  href={`/play/digital/${m.id}`}
                  className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
                >
                  <span>
                    {m.format.name} · {m.mode === "BOT" ? "vs Bot" : `Code ${m.joinCode}`}
                  </span>
                  <span className="text-xs text-slate-500">{m.status.replace("_", " ")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function LoginNotice() {
  return (
    <Link href="/login" className="mt-4 block rounded-full border border-violet-300 px-4 py-2 text-center text-sm font-semibold text-violet-700">Sign in to play</Link>
  );
}
