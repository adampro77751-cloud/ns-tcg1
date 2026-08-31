import { notFound } from "next/navigation";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";
import { getMatchDetails } from "@/lib/matches";
import {
  submitResultAction,
  confirmResultAction,
  disputeResultAction,
  cancelMatchAction,
} from "@/lib/actions/match-actions";
import { JoinMatchDeckForm } from "./join-match-deck-form";

const ERROR_MESSAGES: Record<string, string> = {
  "not-in-progress": "This match isn't in a state to report a result.",
  "invalid-winner": "Choose one of the two players as the winner.",
};

export default async function MatchDetailPage({
  params,
  searchParams,
}: PageProps<"/play/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const session = await auth();

  const match = await getMatchDetails(id);
  if (!match) notFound();

  const [creator, opponent] = match.players;
  const viewerPlayer = match.players.find(
    (p) => p.userId === session?.user?.id,
  );
  const isParticipant = Boolean(viewerPlayer);
  const errorParam = typeof search.error === "string" ? search.error : null;

  let joinDecks: { id: string; label: string }[] = [];
  let joinSprites: { id: string; label: string }[] = [];
  if (session?.user && !isParticipant && match.status === "WAITING") {
    const decks = await prisma.deck.findMany({
      where: { userId: session.user.id, formatId: match.formatId },
      select: { id: true, name: true },
    });
    const legality = await Promise.all(
      decks.map((d) => getDeckLegality(d.id)),
    );
    joinDecks = decks
      .filter((_, i) => legality[i].legal)
      .map((d) => ({ id: d.id, label: d.name }));

    const spriteInstances = await prisma.spriteInstance.findMany({
      where: { ownerId: session.user.id },
      select: {
        id: true,
        name: true,
        level: true,
        sprite: { select: { name: true, rarity: true } },
      },
      orderBy: [{ sprite: { name: "asc" } }, { obtainedAt: "asc" }],
    });
    joinSprites = spriteInstances.map((s) => ({
      id: s.id,
      label: `${s.name} — ${s.sprite.name}${s.sprite.rarity ? ` (${s.sprite.rarity})` : ""} — Level ${s.level}${s.level >= 5 ? " MAX" : ""}`,
    }));
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-12">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight">
          {match.format.name} match
        </h1>
        <span className="rounded bg-zinc-100 px-2 py-1 text-xs font-semibold uppercase text-zinc-600">
          {match.status.replace("_", " ")}
        </span>
      </div>
      <p className="mt-1 font-mono text-sm text-zinc-500">
        Join code: {match.joinCode}
      </p>
      <p className="mt-1 text-xs text-zinc-500">
        Starting hand: {match.format.startingHand} · Starting health:{" "}
        {match.format.startingHealth}
      </p>

      {errorParam && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {ERROR_MESSAGES[errorParam] ?? "Something went wrong."}
        </p>
      )}

      <div className="mt-6 grid grid-cols-[1fr_auto_1fr] items-center gap-4 rounded border border-zinc-200 p-6 text-center">
        <PlayerBlock label="Player 1" player={creator} />
        <span className="text-sm font-semibold text-zinc-400">VS</span>
        {opponent ? (
          <PlayerBlock label="Player 2" player={opponent} />
        ) : (
          <div className="text-sm text-zinc-400">Waiting for opponent...</div>
        )}
      </div>

      {match.status === "WAITING" && isParticipant && (
        <div className="mt-6 flex flex-col items-start gap-3">
          <p className="text-sm text-zinc-600">
            Share the join code above with your opponent.
          </p>
          <form action={cancelMatchAction}>
            <input type="hidden" name="matchId" value={match.id} />
            <button
              type="submit"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm text-zinc-600 hover:bg-zinc-50"
            >
              Cancel match
            </button>
          </form>
        </div>
      )}

      {match.status === "WAITING" && !isParticipant && session?.user && (
        <div className="mt-6">
          {joinDecks.length === 0 ? (
            <p className="text-sm text-zinc-500">
              You need a legal deck for {match.format.name} to join. Build
              one in{" "}
              <Link href="/decks/new" className="text-blue-600">
                Decks
              </Link>
              .
            </p>
          ) : (
            <JoinMatchDeckForm
              matchId={match.id}
              decks={joinDecks}
              sprites={joinSprites}
            />
          )}
        </div>
      )}

      {match.status === "WAITING" && !session?.user && (
        <p className="mt-6 text-sm text-zinc-600">
          <Link href="/login" className="text-blue-600">
            Log in
          </Link>{" "}
          to join this match.
        </p>
      )}

      {match.status === "IN_PROGRESS" && isParticipant && opponent && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Report result
          </h2>
          <p className="mt-1 text-sm text-zinc-600">
            Either player can submit the result. Your opponent will need to
            confirm it before it&apos;s final.
          </p>
          <div className="mt-3 flex gap-3">
            {match.players.map((p) => (
              <form key={p.userId} action={submitResultAction}>
                <input type="hidden" name="matchId" value={match.id} />
                <input type="hidden" name="winnerId" value={p.userId} />
                <button
                  type="submit"
                  className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
                >
                  {p.user.username} won
                </button>
              </form>
            ))}
          </div>
        </div>
      )}

      {match.status === "AWAITING_CONFIRMATION" && match.result && (
        <div className="mt-6 rounded border border-amber-200 bg-amber-50 px-4 py-4">
          <p className="text-sm text-amber-900">
            <strong>{match.result.submittedBy.username}</strong> reported
            that <strong>{match.result.winner.username}</strong> won.
          </p>
          {isParticipant &&
            session?.user?.id !== match.result.submittedById && (
              <div className="mt-3 flex gap-3">
                <form action={confirmResultAction}>
                  <input type="hidden" name="matchId" value={match.id} />
                  <button
                    type="submit"
                    className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                  >
                    Confirm
                  </button>
                </form>
                <form action={disputeResultAction}>
                  <input type="hidden" name="matchId" value={match.id} />
                  <button
                    type="submit"
                    className="rounded border border-zinc-300 px-3 py-1.5 text-sm hover:bg-zinc-50"
                  >
                    Dispute
                  </button>
                </form>
              </div>
            )}
          {isParticipant &&
            session?.user?.id === match.result.submittedById && (
              <p className="mt-2 text-xs text-amber-700">
                Waiting for your opponent to confirm.
              </p>
            )}
        </div>
      )}

      {match.status === "COMPLETED" && match.result && (
        <div className="mt-6 rounded border border-green-200 bg-green-50 px-4 py-4">
          <p className="text-sm text-green-900">
            <strong>{match.result.winner.username}</strong> won this match.
          </p>
        </div>
      )}

      {match.status === "CANCELLED" && (
        <p className="mt-6 text-sm text-zinc-500">This match was cancelled.</p>
      )}
    </div>
  );
}

function PlayerBlock({
  label,
  player,
}: {
  label: string;
  player: {
    user: { username: string };
    deck: { name: string };
    spriteInstance: {
      id: string;
      name: string;
      level: number;
      sprite: { name: string; rarity: string | null };
    } | null;
  };
}) {
  return (
    <div>
      <div className="text-xs text-zinc-400">{label}</div>
      <div className="font-semibold">{player.user.username}</div>
      <div className="text-xs text-zinc-500">{player.deck.name}</div>
      <div className="mt-1 text-xs text-zinc-500">
        {player.spriteInstance ? (
          <>
            {player.spriteInstance.name} · {player.spriteInstance.sprite.name}
            {player.spriteInstance.sprite.rarity
              ? ` · ${player.spriteInstance.sprite.rarity}`
              : ""}{" "}
            · Level {player.spriteInstance.level}
            {player.spriteInstance.level >= 5 ? " — MAX LEVEL" : ""}
          </>
        ) : (
          "No Sprite"
        )}
      </div>
    </div>
  );
}
