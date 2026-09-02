import Link from "next/link";
import { auth } from "@/auth";

export default async function Home() {
  const session = await auth();
  const profileHref = session?.user
    ? `/player/${session.user.username}`
    : "/login";

  return (
    <div className="flex flex-1 flex-col items-center justify-center px-4 py-24 text-center">
      <h1 className="text-5xl font-bold tracking-tight">NS TCG</h1>
      <p className="mt-4 text-lg text-slate-600">
        A fast, competitive trading card game.
      </p>
      <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
        <Link
          href="/play"
          className="rounded bg-blue-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          PLAY
        </Link>
        <Link
          href="/decks/new"
          className="rounded border border-sky-300 px-5 py-2.5 text-sm font-medium hover:bg-sky-50"
        >
          BUILD A DECK
        </Link>
        <Link
          href={profileHref}
          className="rounded border border-sky-300 px-5 py-2.5 text-sm font-medium hover:bg-sky-50"
        >
          MY PROFILE
        </Link>
      </div>
    </div>
  );
}
