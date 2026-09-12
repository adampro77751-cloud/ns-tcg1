"use client";

import { useState } from "react";
import {
  playDigitalItemAction,
  playDigitalSpellAction,
  attackDigitalAction,
  endDigitalTurnAction,
  concedeDigitalMatchAction,
} from "@/lib/actions/digital-match-actions";
import type { VisibleGameState } from "@/lib/digital-engine/engine";
import type { LegalAction } from "@/lib/digital-engine/engine";
import { AutoRefresh } from "@/components/auto-refresh";

type CardDisplay = {
  id: string;
  name: string;
  type: string | null;
  rarity: string | null;
  attack: number | null;
  defence: number | null;
  speed: number | null;
  image: string | null;
};

function CardFace({
  cardId,
  cardsById,
  onEnlarge,
}: {
  cardId: string;
  cardsById: Record<string, CardDisplay>;
  onEnlarge: (card: CardDisplay) => void;
}) {
  const card = cardsById[cardId];
  if (!card) return <div className="aspect-[5/7] w-16 rounded bg-sky-100" />;
  return (
    <button
      type="button"
      onClick={() => onEnlarge(card)}
      className="block aspect-[5/7] w-16 overflow-hidden rounded border border-sky-300 bg-white shadow sm:w-20"
      title={card.name}
    >
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt={card.name} className="h-full w-full object-contain" />
      ) : (
        <span className="flex h-full items-center justify-center p-1 text-center text-[9px] font-semibold text-slate-600">
          {card.name}
        </span>
      )}
    </button>
  );
}

function CardBack() {
  return (
    <div className="aspect-[5/7] w-16 rounded border-2 border-violet-300 bg-gradient-to-br from-violet-600 to-blue-500 shadow sm:w-20" />
  );
}

export function Battlefield({
  matchId,
  visible,
  cardsById,
  legalActions,
  youUsername,
  opponentUsername,
}: {
  matchId: string;
  visible: VisibleGameState;
  cardsById: Record<string, CardDisplay>;
  legalActions: LegalAction[];
  youUsername: string;
  opponentUsername: string;
}) {
  const [enlarged, setEnlarged] = useState<CardDisplay | null>(null);

  const you = visible.players[visible.viewerIndex];
  const opponentIndex = visible.viewerIndex === 0 ? 1 : 0;
  const opponent = visible.players[opponentIndex];
  const isYourTurn = visible.activePlayerIndex === visible.viewerIndex;

  const playableInstanceIds = new Set(
    legalActions
      .filter((a) => a.type === "PLAY_ITEM" || a.type === "PLAY_SPELL")
      .map((a) => a.instanceId),
  );
  const attackableInstanceIds = new Set(
    legalActions.filter((a) => a.type === "ATTACK").map((a) => a.instanceId),
  );
  const canEndTurn = legalActions.some((a) => a.type === "END_TURN");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-6">
      <AutoRefresh intervalMs={3000} />

      {visible.phase === "COMPLETE" && (
        <div className="mb-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-800">
          Match over — refresh to see the result.
        </div>
      )}

      <div className="flex items-center justify-between text-sm text-slate-600">
        <span>Turn {visible.turnNumber}</span>
        <span className={isYourTurn ? "font-bold text-violet-700" : "text-slate-400"}>
          {isYourTurn ? "Your turn" : `${opponentUsername}'s turn`}
        </span>
      </div>

      {/* Opponent */}
      <div className="mt-4 rounded-2xl border border-sky-200 bg-white p-4">
        <div className="flex items-center justify-between">
          <span className="font-bold">{opponentUsername}</span>
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
            ❤ {opponent.health}
          </span>
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {opponent.hand.map((c) => (
            <CardBack key={c.instanceId} />
          ))}
          {opponent.hand.length === 0 && (
            <span className="text-xs text-slate-400">No cards in hand</span>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {opponent.battlefield.map((c) => (
            <CardFace key={c.instanceId} cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} />
          ))}
          {opponent.battlefield.length === 0 && (
            <span className="text-xs text-slate-400">Empty battlefield</span>
          )}
        </div>
      </div>

      <div className="my-3 border-t-2 border-dashed border-violet-200" />

      {/* You */}
      <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-sky-50 p-4">
        <div className="flex flex-wrap items-center gap-2">
          {you.battlefield.map((c) => (
            <div key={c.instanceId} className="flex flex-col items-center gap-1">
              <div className={c.tired ? "opacity-50" : ""}>
                <CardFace cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} />
              </div>
              {attackableInstanceIds.has(c.instanceId) && (
                <form action={attackDigitalAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="instanceId" value={c.instanceId} />
                  <button
                    type="submit"
                    className="rounded bg-red-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-red-700"
                  >
                    Attack
                  </button>
                </form>
              )}
            </div>
          ))}
          {you.battlefield.length === 0 && (
            <span className="text-xs text-slate-400">Empty battlefield</span>
          )}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {you.hand.map((c) =>
            "hidden" in c ? null : (
              <div key={c.instanceId} className="flex flex-col items-center gap-1">
                <CardFace cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} />
                {playableInstanceIds.has(c.instanceId) && (
                  <form
                    action={
                      cardsById[c.cardId]?.type === "Spell" ? playDigitalSpellAction : playDigitalItemAction
                    }
                  >
                    <input type="hidden" name="matchId" value={matchId} />
                    <input type="hidden" name="instanceId" value={c.instanceId} />
                    <button
                      type="submit"
                      className="rounded bg-violet-600 px-2 py-0.5 text-[10px] font-bold text-white hover:bg-violet-700"
                    >
                      Play
                    </button>
                  </form>
                )}
              </div>
            ),
          )}
          {you.hand.length === 0 && <span className="text-xs text-slate-400">Empty hand</span>}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="font-bold">{youUsername} (you)</span>
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm font-bold text-red-700">
            ❤ {you.health}
          </span>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {canEndTurn && (
          <form action={endDigitalTurnAction}>
            <input type="hidden" name="matchId" value={matchId} />
            <button
              type="submit"
              className="rounded-full bg-blue-600 px-5 py-2 text-sm font-bold text-white hover:bg-blue-700"
            >
              End Turn
            </button>
          </form>
        )}
        <form
          action={concedeDigitalMatchAction}
          onSubmit={(e) => {
            if (!confirm("Concede this match?")) e.preventDefault();
          }}
        >
          <input type="hidden" name="matchId" value={matchId} />
          <button
            type="submit"
            className="rounded-full border border-red-300 px-5 py-2 text-sm font-bold text-red-700 hover:bg-red-50"
          >
            Concede
          </button>
        </form>
      </div>

      <details className="mt-6 rounded border border-sky-200 bg-white p-3 text-xs text-slate-600">
        <summary className="cursor-pointer font-semibold">Match log</summary>
        <ul className="mt-2 flex flex-col gap-0.5">
          {visible.log.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </details>

      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEnlarged(null)}
        >
          <div className="max-w-xs rounded-2xl border-4 border-white bg-white p-2 shadow-2xl">
            {enlarged.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enlarged.image} alt={enlarged.name} className="w-full rounded-xl" />
            ) : (
              <p className="p-6 text-center font-semibold">{enlarged.name}</p>
            )}
            <p className="mt-2 text-center text-sm font-semibold">
              {enlarged.name}
              {(enlarged.attack !== null || enlarged.defence !== null || enlarged.speed !== null) && (
                <span className="block text-xs font-normal text-slate-500">
                  {enlarged.attack !== null && `ATK ${enlarged.attack} `}
                  {enlarged.defence !== null && `· DEF ${enlarged.defence} `}
                  {enlarged.speed !== null && `· SPD ${enlarged.speed}`}
                </span>
              )}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
