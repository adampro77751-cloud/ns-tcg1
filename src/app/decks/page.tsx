import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";

export default async function DecksPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const decks = await prisma.deck.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      updatedAt: true,
      format: { select: { name: true } },
      cards: { select: { quantity: true } },
    },
  });

  const legalityByDeck = await Promise.all(
    decks.map((deck) => getDeckLegality(deck.id)),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">My decks</h1>
        <Link
          href="/decks/new"
          className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
        >
          New deck
        </Link>
      </div>

      {decks.length === 0 ? (
        <p className="mt-6 text-sm text-slate-500">
          You haven&apos;t created any decks yet.
        </p>
      ) : (
        <ul className="mt-6 flex flex-col gap-2">
          {decks.map((deck, i) => {
            const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);
            const legality = legalityByDeck[i];
            return (
              <li key={deck.id}>
                <Link
                  href={`/decks/${deck.id}`}
                  className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 hover:border-slate-400"
                >
                  <div>
                    <div className="font-medium">{deck.name}</div>
                    <div className="text-xs text-slate-500">
                      {deck.format.name} · {totalCards} cards
                    </div>
                  </div>
                  <span
                    className={
                      "shrink-0 rounded px-2 py-1 text-xs font-semibold uppercase " +
                      (legality.legal
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-700")
                    }
                  >
                    {legality.legal ? "Legal" : "Illegal"}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
