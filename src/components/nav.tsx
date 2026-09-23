import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/lib/actions/auth-actions";
import { NavLinks } from "./nav-links";
import { CoinBalance } from "./coin-balance";

const links = [
  { href: "/play", label: "Play" },
  { href: "/decks", label: "Decks" },
  { href: "/collection", label: "Collection" },
  { href: "/store/packs", label: "Packs" },
  { href: "/sprites", label: "Sprites" },
  { href: "/metagame", label: "Metagame" },
  { href: "/players", label: "Players" },
  { href: "/rules", label: "Rules" },
];

export async function Nav() {
  const session = await auth();

  return (
    <header className="relative border-b border-sky-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-blue-700">
            NS TCG
          </Link>
          <NavLinks links={links} isAdmin={session?.user?.role === "ADMIN"} />
        </div>
        <div>
          {session?.user ? (
            <form action={logoutAction} className="flex items-center gap-3">
              <CoinBalance userId={session.user.id} />
              <Link
                href={`/player/${session.user.username}`}
                className="text-sm text-slate-600 hover:text-blue-600"
              >
                {session.user.username}
              </Link>
              <button
                type="submit"
                className="rounded border border-sky-300 px-3 py-1.5 text-sm hover:bg-sky-50"
              >
                Log out
              </button>
            </form>
          ) : (
            <Link
              href="/login"
              className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
            >
              Log in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
