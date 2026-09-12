import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

// Anyone can VIEW this page (so the beta isn't invisible to normal
// players) but only ADMIN accounts get working links — the actual access
// boundary is enforced server-side on every route/action underneath this
// page (requireAdminPage/requireAdminAction), never here. A non-admin
// manually navigating to e.g. /play/digital/bot/new is still redirected
// away there, regardless of what this page renders.
export default async function DigitalPlayHomePage() {
  const session = await auth();
  const isAdmin = session?.user?.role === "ADMIN";

  const myMatches = isAdmin
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
        <span className="rounded-full bg-violet-100 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-violet-700">
          Beta
        </span>
      </div>
      <p className="mt-2 text-sm text-slate-500">
        {isAdmin
          ? "Private beta — admin accounts only. Play against another admin online, or against the V1 rules-based bot."
          : "Digital Play is currently in private beta, open to admin accounts only. Everyone will be able to play once the beta opens up."}
      </p>

      <div className="mt-8 grid gap-4 sm:grid-cols-2">
        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-sky-50 p-6">
          <h2 className="text-lg font-bold">Play Online</h2>
          <p className="mt-1 text-sm text-slate-600">
            Play against another player using a match code.
          </p>
          {isAdmin ? (
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
            <LockedNotice />
          )}
        </div>

        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-sky-50 p-6">
          <h2 className="text-lg font-bold">Play vs Bot</h2>
          <p className="mt-1 text-sm text-slate-600">
            Play against a computer-controlled opponent.
          </p>
          {isAdmin ? (
            <div className="mt-4">
              <Link
                href="/play/digital/bot/new"
                className="block rounded-full bg-violet-600 px-4 py-2 text-center text-sm font-bold text-white hover:bg-violet-700"
              >
                Start bot match
              </Link>
            </div>
          ) : (
            <LockedNotice />
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

function LockedNotice() {
  return (
    <div className="mt-4 rounded-full border border-slate-200 bg-slate-50 px-4 py-2 text-center text-sm font-semibold text-slate-400">
      🔒 Private Beta — Admin only
    </div>
  );
}
