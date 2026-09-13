import { notFound } from "next/navigation";
import Link from "next/link";
import { requireAdminPage } from "@/lib/admin";
import { prisma } from "@/lib/prisma";
import {
  getDecksWithLegality,
  getOwnedSpriteOptions,
  getCardDisplayMap,
  getSpriteDisplayMap,
} from "@/lib/digital-play";
import { getVisibleState, getLegalActions } from "@/lib/digital-engine/engine";
import type { DigitalGameState } from "@/lib/digital-engine/types";
import {
  joinOnlineMatchAction,
  readyDigitalMatchAction,
} from "@/lib/actions/digital-match-actions";
import { AutoRefresh } from "@/components/auto-refresh";
import { DigitalCreateForm } from "../digital-create-form";
import { Battlefield } from "./battlefield";

export default async function DigitalMatchPage({ params }: PageProps<"/play/digital/[id]">) {
  const session = await requireAdminPage();
  const { id } = await params;

  const match = await prisma.digitalMatch.findUnique({
    where: { id },
    select: {
      id: true,
      mode: true,
      status: true,
      joinCode: true,
      formatId: true,
      state: true,
      winnerId: true,
      format: { select: { name: true } },
      players: {
        orderBy: { joinedAt: "asc" },
        select: {
          id: true,
          userId: true,
          isBot: true,
          ready: true,
          user: { select: { username: true } },
        },
      },
    },
  });
  if (!match) notFound();

  const viewerPlayerIndex = match.players.findIndex((p) => p.userId === session.user.id);
  const isParticipant = viewerPlayerIndex !== -1;

  // --- WAITING: only the creator is in (ONLINE only) ---
  if (match.status === "WAITING") {
    if (isParticipant) {
      return (
        <div className="mx-auto w-full max-w-md px-4 py-12">
          <AutoRefresh intervalMs={4000} />
          <h1 className="text-2xl font-bold tracking-tight">Waiting for opponent…</h1>
          <p className="mt-2 text-sm text-slate-500">Share this code with your opponent:</p>
          <p className="mt-3 rounded border border-violet-200 bg-violet-50 px-4 py-3 text-center font-mono text-2xl tracking-widest text-violet-700">
            {match.joinCode}
          </p>
        </div>
      );
    }
    if (match.players.length >= 2) notFound();

    const decks = await getDecksWithLegality(session.user.id, match.formatId);
    const spriteOptions = await getOwnedSpriteOptions(session.user.id);

    return (
      <div className="mx-auto w-full max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold tracking-tight">Join Digital Match</h1>
        <p className="mt-1 text-sm text-slate-500">
          Format: {match.format.name}. Choose a legal deck and your Sprite.
        </p>
        <DigitalCreateForm
          hiddenFields={{ matchId: match.id }}
          decks={decks}
          spriteOptions={spriteOptions}
          action={joinOnlineMatchAction}
          submitLabel="Join match"
        />
      </div>
    );
  }

  // --- READY: both present, waiting for Ready clicks ---
  if (match.status === "READY") {
    if (!isParticipant) notFound();
    const me = match.players[viewerPlayerIndex];
    const opponent = match.players.find((p) => p.userId !== session.user.id);

    return (
      <div className="mx-auto w-full max-w-md px-4 py-12">
        <AutoRefresh intervalMs={3000} />
        <h1 className="text-2xl font-bold tracking-tight">{match.format.name} match</h1>
        <ul className="mt-4 flex flex-col gap-2">
          <li className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3">
            <span>{session.user.username} (you)</span>
            <span className={me.ready ? "text-green-700" : "text-slate-400"}>
              {me.ready ? "Ready" : "Not ready"}
            </span>
          </li>
          <li className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3">
            <span>{opponent?.user?.username ?? "Opponent"}</span>
            <span className={opponent?.ready ? "text-green-700" : "text-slate-400"}>
              {opponent?.ready ? "Ready" : "Not ready"}
            </span>
          </li>
        </ul>
        {!me.ready && (
          <form action={readyDigitalMatchAction} className="mt-6">
            <input type="hidden" name="matchId" value={match.id} />
            <button
              type="submit"
              className="rounded-full bg-violet-600 px-6 py-2.5 text-sm font-bold text-white hover:bg-violet-700"
            >
              Ready
            </button>
          </form>
        )}
      </div>
    );
  }

  // --- COMPLETED ---
  if (match.status === "COMPLETED") {
    if (!isParticipant) notFound();
    const iWon = match.winnerId === session.user.id;
    return (
      <div className="mx-auto w-full max-w-md px-4 py-12 text-center">
        <h1 className="text-3xl font-extrabold tracking-tight">
          {match.winnerId ? (iWon ? "Victory!" : "Defeat") : "Match ended"}
        </h1>
        <Link href="/play/digital" className="mt-6 inline-block text-blue-600">
          ← Digital Play
        </Link>
      </div>
    );
  }

  // --- IN_PROGRESS ---
  if (!isParticipant || !match.state) notFound();
  const state = match.state as unknown as DigitalGameState;
  const playerIndex = viewerPlayerIndex as 0 | 1;
  const visible = getVisibleState(state, playerIndex);

  const allVisibleCardIds = [
    ...visible.players[0].hand.filter((c): c is Extract<typeof c, { cardId: string }> => "cardId" in c).map((c) => c.cardId),
    ...visible.players[1].hand.filter((c): c is Extract<typeof c, { cardId: string }> => "cardId" in c).map((c) => c.cardId),
    ...visible.players[0].battlefield.map((c) => c.cardId),
    ...visible.players[1].battlefield.map((c) => c.cardId),
    ...visible.players[0].discard.map((c) => c.cardId),
    ...visible.players[1].discard.map((c) => c.cardId),
  ];
  const cardsById = await getCardDisplayMap(allVisibleCardIds);
  const engineCardsById = new Map(
    Array.from(cardsById.entries()).map(([id, c]) => [
      id,
      { id: c.id, slug: c.slug, type: c.type, attack: c.attack, defence: c.defence, speed: c.speed },
    ]),
  );
  const legalActions = getLegalActions(state, playerIndex, engineCardsById);

  const opponentUsername =
    match.players.find((p) => p.userId !== session.user.id)?.user?.username ??
    (match.players.find((p) => p.isBot) ? "Bot" : "Opponent");

  const spritesById = await getSpriteDisplayMap([
    visible.players[0].spriteInstanceId,
    visible.players[1].spriteInstanceId,
  ]);

  const botIndex = match.players.findIndex((p) => p.isBot);
  const isBotTurn =
    botIndex !== -1 &&
    ((state.pendingCombat === null && state.activePlayerIndex === botIndex) ||
      state.pendingCombat?.defendingPlayerIndex === botIndex);

  return (
    <Battlefield
      matchId={match.id}
      visible={visible}
      cardsById={Object.fromEntries(cardsById)}
      spritesById={Object.fromEntries(spritesById)}
      legalActions={legalActions}
      isBotTurn={isBotTurn}
      youUsername={session.user.username}
      opponentUsername={opponentUsername}
    />
  );
}
