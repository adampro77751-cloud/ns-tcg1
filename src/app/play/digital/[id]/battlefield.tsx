"use client";

import { useEffect, useRef, useState } from "react";
import {
  playDigitalItemAction,
  playDigitalSpellAction,
  attackDigitalAction,
  endDigitalTurnAction,
  concedeDigitalMatchAction,
  activateTimeBombAction,
  activateStarDropAction,
} from "@/lib/actions/digital-match-actions";
import type { VisibleGameState } from "@/lib/digital-engine/engine";
import type { LegalAction } from "@/lib/digital-engine/engine";
import { getRequiredTarget, type TargetRequirement } from "@/lib/digital-engine/abilities";
import { AutoRefresh } from "@/components/auto-refresh";

type CardDisplay = {
  id: string;
  slug: string;
  name: string;
  type: string | null;
  rarity: string | null;
  attack: number | null;
  defence: number | null;
  speed: number | null;
  image: string | null;
};

type PlayFormAction = (formData: FormData) => void | Promise<void>;

const CARD_SIZE = "w-24 sm:w-28 md:w-32";
const CARD_SIZE_FULLSCREEN = "w-32 sm:w-40 md:w-48 lg:w-56";

function CardFace({
  cardId,
  cardsById,
  onEnlarge,
  large,
}: {
  cardId: string;
  cardsById: Record<string, CardDisplay>;
  onEnlarge: (card: CardDisplay) => void;
  large?: boolean;
}) {
  const size = large ? CARD_SIZE_FULLSCREEN : CARD_SIZE;
  const card = cardsById[cardId];
  if (!card) return <div className={`aspect-[5/7] ${size} rounded-lg bg-sky-100`} />;
  return (
    <button
      type="button"
      onClick={() => onEnlarge(card)}
      className={`block aspect-[5/7] ${size} overflow-hidden rounded-lg border-2 border-sky-300 bg-white shadow-lg transition hover:scale-105`}
      title={card.name}
    >
      {card.image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.image} alt={card.name} className="h-full w-full object-contain" />
      ) : (
        <span className={`flex h-full items-center justify-center p-1 text-center font-semibold text-slate-600 ${large ? "text-base" : "text-xs"}`}>
          {card.name}
        </span>
      )}
    </button>
  );
}

function CardBack({ large }: { large?: boolean }) {
  const size = large ? CARD_SIZE_FULLSCREEN : CARD_SIZE;
  return (
    <div
      className={`aspect-[5/7] ${size} rounded-lg border-2 border-violet-300 bg-gradient-to-br from-violet-600 to-blue-500 shadow-lg`}
    />
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
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [targetPickerInstanceId, setTargetPickerInstanceId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(Boolean(document.fullscreenElement) && document.fullscreenElement === containerRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      containerRef.current?.requestFullscreen().catch(() => {});
    }
  }

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
  const activatableInstanceIds = new Set(
    legalActions.filter((a) => a.type === "ACTIVATE_TIME_BOMB").map((a) => a.instanceId),
  );
  const starDropInstanceIds = new Set(
    legalActions.filter((a) => a.type === "ACTIVATE_STAR_DROP").map((a) => a.instanceId),
  );
  const canEndTurn = legalActions.some((a) => a.type === "END_TURN");

  // Some cards' ON_PLAY effects need a real target — a player, or an Item
  // on either battlefield — rather than the server auto-picking one. See
  // getRequiredTarget (abilities.ts): only ON_PLAY effects get a picker;
  // every other trigger still auto-resolves (no natural moment for a UI
  // prompt mid-resolution of some other action).
  function targetCandidates(requirement: TargetRequirement) {
    if (!requirement) return { players: [], items: [] as { instanceId: string; cardId: string; label: string }[] };
    const ownItems = you.battlefield.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId }));
    const oppItems = opponent.battlefield.map((c) => ({ instanceId: c.instanceId, cardId: c.cardId }));
    if (requirement.kind === "ANY_TARGET") {
      return {
        players: [
          { targetId: `player:${visible.viewerIndex}`, label: `${youUsername} (you)` },
          { targetId: `player:${opponentIndex}`, label: opponentUsername },
        ],
        items: [...ownItems, ...oppItems],
      };
    }
    if (requirement.scope === "OWN_ITEM") return { players: [], items: ownItems };
    if (requirement.scope === "OPPONENT_ITEM") return { players: [], items: oppItems };
    return { players: [], items: [...ownItems, ...oppItems] };
  }

  function renderPlayControl(instanceId: string, cardId: string, action: PlayFormAction) {
    const requirement = getRequiredTarget(cardsById[cardId]?.slug ?? "");
    if (!requirement) {
      return (
        <form action={action}>
          <input type="hidden" name="matchId" value={matchId} />
          <input type="hidden" name="instanceId" value={instanceId} />
          <button
            type="submit"
            className="rounded bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700"
          >
            Play
          </button>
        </form>
      );
    }

    const isOpen = targetPickerInstanceId === instanceId;
    const { players, items } = targetCandidates(requirement);

    return (
      <div className="relative">
        <button
          type="button"
          onClick={() => setTargetPickerInstanceId(isOpen ? null : instanceId)}
          className="rounded bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700"
        >
          Play (choose target)
        </button>
        {isOpen && (
          <div className="absolute left-1/2 top-full z-40 mt-2 w-64 -translate-x-1/2 rounded-xl border border-violet-200 bg-white p-3 text-left shadow-2xl">
            <p className="mb-2 text-xs font-semibold text-slate-600">Choose a target:</p>
            <div className="flex flex-col gap-1.5">
              {players.map((p) => (
                <form key={p.targetId} action={action}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="instanceId" value={instanceId} />
                  <input type="hidden" name="targetId" value={p.targetId} />
                  <button
                    type="submit"
                    className="w-full rounded border border-sky-200 bg-sky-50 px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-sky-100"
                  >
                    {p.label}
                  </button>
                </form>
              ))}
              {items.map((it) => (
                <form key={it.instanceId} action={action}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <input type="hidden" name="instanceId" value={instanceId} />
                  <input type="hidden" name="targetId" value={`item:${it.instanceId}`} />
                  <button
                    type="submit"
                    className="w-full rounded border border-sky-200 bg-white px-2 py-1.5 text-left text-xs font-semibold text-slate-700 hover:bg-sky-50"
                  >
                    {cardsById[it.cardId]?.name ?? "Unknown card"}
                  </button>
                </form>
              ))}
              {players.length === 0 && items.length === 0 && (
                <p className="text-xs text-slate-400">No legal targets available.</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setTargetPickerInstanceId(null)}
              className="mt-2 w-full rounded border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-50"
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={
        "ns-concrete-floor " +
        (isFullscreen
          ? "h-screen w-screen overflow-y-auto px-6 py-6"
          : "w-full px-4 py-8")
      }
    >
      <div className={isFullscreen ? "mx-auto max-w-[1600px]" : "mx-auto max-w-5xl"}>
        <AutoRefresh intervalMs={3000} />

        <div className="flex items-center justify-between">
          <div
            className={`flex items-center gap-3 rounded-full bg-white/90 shadow text-slate-700 ${
              isFullscreen ? "px-6 py-2.5 text-lg" : "px-4 py-1.5 text-sm"
            }`}
          >
            <span>Turn {visible.turnNumber}</span>
            <span className={isYourTurn ? "font-bold text-violet-700" : "text-slate-400"}>
              {isYourTurn ? "Your turn" : `${opponentUsername}'s turn`}
            </span>
          </div>
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`rounded-full border border-white/60 bg-white/90 font-semibold text-slate-700 shadow hover:bg-white ${
              isFullscreen ? "px-6 py-2.5 text-lg" : "px-4 py-1.5 text-sm"
            }`}
          >
            {isFullscreen ? "⤢ Exit Fullscreen" : "⛶ Fullscreen"}
          </button>
        </div>

        {visible.phase === "COMPLETE" && (
          <div className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-center text-sm text-green-800">
            Match over — refresh to see the result.
          </div>
        )}

        {/* Opponent */}
        <div className={`mt-4 rounded-2xl border border-sky-200 bg-white/95 shadow-xl backdrop-blur-sm ${isFullscreen ? "p-8" : "p-5"}`}>
          <div className="flex items-center justify-between">
            <span className={isFullscreen ? "text-2xl font-bold" : "text-lg font-bold"}>{opponentUsername}</span>
            <span
              className={`rounded-full bg-red-100 font-bold text-red-700 ${
                isFullscreen ? "px-6 py-2 text-xl" : "px-4 py-1.5 text-base"
              }`}
            >
              ❤ {opponent.health}
            </span>
          </div>
          {opponent.handRevealedToOpponent && (
            <p className="mt-2 text-xs font-semibold text-amber-700">
              School Computers revealed this hand — visible until end of turn.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {opponent.hand.map((c) =>
              "hidden" in c ? (
                <CardBack key={c.instanceId} large={isFullscreen} />
              ) : (
                <CardFace key={c.instanceId} cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} large={isFullscreen} />
              ),
            )}
            {opponent.hand.length === 0 && (
              <span className="text-xs text-slate-400">No cards in hand</span>
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            {opponent.battlefield.map((c) => (
              <CardFace key={c.instanceId} cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} large={isFullscreen} />
            ))}
            {opponent.battlefield.length === 0 && (
              <span className="text-xs text-slate-400">Empty battlefield</span>
            )}
          </div>
        </div>

        <div className="my-4 border-t-4 border-dashed border-white/50" />

        {/* You */}
        <div
          className={`rounded-2xl border border-violet-200 bg-gradient-to-br from-white/95 to-sky-50/95 shadow-xl backdrop-blur-sm ${
            isFullscreen ? "p-8" : "p-5"
          }`}
        >
          <div className="flex flex-wrap items-center gap-3">
            {you.battlefield.map((c) => (
              <div key={c.instanceId} className="flex flex-col items-center gap-1.5">
                <div className={c.tired ? "opacity-50" : ""}>
                  <CardFace cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} large={isFullscreen} />
                </div>
                {attackableInstanceIds.has(c.instanceId) && (
                  <form action={attackDigitalAction}>
                    <input type="hidden" name="matchId" value={matchId} />
                    <input type="hidden" name="instanceId" value={c.instanceId} />
                    <button
                      type="submit"
                      className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700"
                    >
                      Attack
                    </button>
                  </form>
                )}
                {activatableInstanceIds.has(c.instanceId) && (
                  <form action={activateTimeBombAction}>
                    <input type="hidden" name="matchId" value={matchId} />
                    <input type="hidden" name="instanceId" value={c.instanceId} />
                    <button
                      type="submit"
                      className="rounded bg-amber-600 px-3 py-1 text-xs font-bold text-white hover:bg-amber-700"
                    >
                      Detonate (win)
                    </button>
                  </form>
                )}
                {starDropInstanceIds.has(c.instanceId) && (
                  <form action={activateStarDropAction}>
                    <input type="hidden" name="matchId" value={matchId} />
                    <input type="hidden" name="instanceId" value={c.instanceId} />
                    <button
                      type="submit"
                      className="rounded bg-teal-600 px-3 py-1 text-xs font-bold text-white hover:bg-teal-700"
                    >
                      Discard: Draw
                    </button>
                  </form>
                )}
              </div>
            ))}
            {you.battlefield.length === 0 && (
              <span className="text-xs text-slate-400">Empty battlefield</span>
            )}
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {you.hand.map((c) =>
              "hidden" in c ? null : (
                <div key={c.instanceId} className="flex flex-col items-center gap-1.5">
                  <CardFace cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} large={isFullscreen} />
                  {playableInstanceIds.has(c.instanceId) &&
                    renderPlayControl(
                      c.instanceId,
                      c.cardId,
                      cardsById[c.cardId]?.type === "Spell" ? playDigitalSpellAction : playDigitalItemAction,
                    )}
                </div>
              ),
            )}
            {you.hand.length === 0 && <span className="text-xs text-slate-400">Empty hand</span>}
          </div>

          {you.discard.some((c) => playableInstanceIds.has(c.instanceId)) && (
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-lg border border-dashed border-violet-300 bg-violet-50/60 p-2">
              <span className="w-full text-xs font-semibold text-violet-700">Playable from discard (Art):</span>
              {you.discard
                .filter((c) => playableInstanceIds.has(c.instanceId))
                .map((c) => (
                  <div key={c.instanceId} className="flex flex-col items-center gap-1.5">
                    <CardFace cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} large={isFullscreen} />
                    {renderPlayControl(c.instanceId, c.cardId, playDigitalSpellAction)}
                  </div>
                ))}
            </div>
          )}

          <div className="mt-5 flex items-center justify-between">
            <span className={isFullscreen ? "text-2xl font-bold" : "text-lg font-bold"}>{youUsername} (you)</span>
            <span
              className={`rounded-full bg-red-100 font-bold text-red-700 ${
                isFullscreen ? "px-6 py-2 text-xl" : "px-4 py-1.5 text-base"
              }`}
            >
              ❤ {you.health}
            </span>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          {canEndTurn && (
            <form action={endDigitalTurnAction}>
              <input type="hidden" name="matchId" value={matchId} />
              <button
                type="submit"
                className={`rounded-full bg-blue-600 font-bold text-white shadow hover:bg-blue-700 ${
                  isFullscreen ? "px-8 py-3.5 text-base" : "px-6 py-2.5 text-sm"
                }`}
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
              className={`rounded-full border border-red-300 bg-white/90 font-bold text-red-700 shadow hover:bg-red-50 ${
                isFullscreen ? "px-8 py-3.5 text-base" : "px-6 py-2.5 text-sm"
              }`}
            >
              Concede
            </button>
          </form>
        </div>

        <details className="mt-6 rounded border border-sky-200 bg-white/90 p-3 text-xs text-slate-600 shadow">
          <summary className="cursor-pointer font-semibold">Match log</summary>
          <ul className="mt-2 flex flex-col gap-0.5">
            {visible.log.map((line, i) => (
              <li key={i}>{line}</li>
            ))}
          </ul>
        </details>
      </div>

      {enlarged && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setEnlarged(null)}
        >
          <div className="max-w-sm rounded-2xl border-4 border-white bg-white p-3 shadow-2xl">
            {enlarged.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={enlarged.image} alt={enlarged.name} className="w-full rounded-xl" />
            ) : (
              <p className="p-8 text-center font-semibold">{enlarged.name}</p>
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
