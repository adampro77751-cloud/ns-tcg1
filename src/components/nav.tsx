import Link from "next/link";
import { auth } from "@/auth";
import { logoutAction } from "@/lib/actions/auth-actions";

const links = [
  { href: "/play", label: "Play" },
  { href: "/decks", label: "Decks" },
  { href: "/sprites", label: "Sprites" },
  { href: "/events", label: "Events" },
  { href: "/metagame", label: "Metagame" },
  { href: "/players", label: "Players" },
  { href: "/formats", label: "Formats" },
  { href: "/rules", label: "Rules" },
];

export async function Nav() {
  const session = await auth();

  return (
    <header className="border-b border-sky-200 bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
        <div className="flex items-center gap-8">
          <Link href="/" className="text-lg font-bold tracking-tight text-blue-700">
            NS TCG
          </Link>
          <nav className="flex items-center gap-5 text-sm text-slate-600">
            {links.map((link) => (
              <Link key={link.href} href={link.href} className="hover:text-blue-600">
                {link.label}
              </Link>
            ))}
            {session?.user && (
              <Link
                href={`/player/${session.user.username}`}
                className="hover:text-blue-600"
              >
                Profile
              </Link>
            )}
            {session?.user?.role === "ADMIN" && (
              <Link href="/admin" className="hover:text-blue-600">
                Admin
              </Link>
            )}
          </nav>
        </div>
        <div>
          {session?.user ? (
            <form action={logoutAction} className="flex items-center gap-3">
              <span className="text-sm text-slate-600">
                {session.user.username}
              </span>
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
