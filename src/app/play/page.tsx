import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";
import { StartMatchForm } from "./start-match-form";
import { JoinMatchForm } from "./join-match-form";

export default async function PlayPage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const decks = await prisma.deck.findMany({
    where: { userId: session.user.id },
    orderBy: { updatedAt: "desc" },
    select: { id: true, name: true, format: { select: { name: true } } },
  });
  const legalityByDeck = await Promise.all(
    decks.map((deck) => getDeckLegality(deck.id)),
  );
  const legalDecks = decks
    .filter((_, i) => legalityByDeck[i].legal)
    .map((deck) => ({
      id: deck.id,
      label: `${deck.name} (${deck.format.name})`,
    }));

  const openMatches = await prisma.match.findMany({
    where: {
      players: { some: { userId: session.user.id } },
      status: { in: ["WAITING", "IN_PROGRESS", "AWAITING_CONFIRMATION"] },
    },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      joinCode: true,
      status: true,
      format: { select: { name: true } },
    },
  });

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <h1 className="text-2xl font-bold tracking-tight">Play</h1>

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        <div className="rounded border border-zinc-200 p-4">
          <h2 className="font-semibold">Start a match</h2>
          <StartMatchForm decks={legalDecks} />
        </div>
        <div className="rounded border border-zinc-200 p-4">
          <h2 className="font-semibold">Join a match</h2>
          <JoinMatchForm />
        </div>
      </div>

      {openMatches.length > 0 && (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Your open matches
          </h2>
          <ul className="mt-3 flex flex-col gap-2">
            {openMatches.map((match) => (
              <li key={match.id}>
                <Link
                  href={`/play/${match.id}`}
                  className="flex items-center justify-between rounded border border-zinc-200 px-4 py-3 hover:border-zinc-400"
                >
                  <span>
                    {match.format.name} ·{" "}
                    <span className="font-mono">{match.joinCode}</span>
                  </span>
                  <span className="text-xs text-zinc-500">
                    {match.status.replace("_", " ")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
