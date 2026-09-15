"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  playDigitalItemAction,
  playDigitalSpellAction,
  attackDigitalAction,
  resolveDefenseAction,
  endDigitalTurnAction,
  concedeDigitalMatchAction,
  activateTimeBombAction,
  activateStarDropAction,
  getSearchableDeckItemsAction,
  type SearchableDeckCard,
} from "@/lib/actions/digital-match-actions";
import type { VisibleGameState } from "@/lib/digital-engine/engine";
import type { LegalAction } from "@/lib/digital-engine/engine";
import { getTargetCandidateIds } from "@/lib/digital-engine/engine";
import { getRequiredTarget, getAttackTriggerTarget, type TargetRequirement } from "@/lib/digital-engine/abilities";
import { AutoRefresh } from "@/components/auto-refresh";
import { BotTurnDriver } from "./bot-turn-driver";

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

type SpriteDisplay = {
  id: string;
  name: string;
  level: number;
  spriteName: string;
  image: string | null;
  rarity: string | null;
};

type PlayFormAction = (formData: FormData) => void | Promise<void>;

type PendingPlay = { instanceId: string; action: PlayFormAction; requirement: TargetRequirement };

const CARD_SIZE = "w-24 sm:w-28 md:w-32";
const CARD_SIZE_FULLSCREEN = "w-32 sm:w-40 md:w-48 lg:w-56";

function CardFace({
  cardId,
  cardsById,
  onEnlarge,
  large,
  tired,
  selectable,
  onSelect,
}: {
  cardId: string;
  cardsById: Record<string, CardDisplay>;
  onEnlarge: (card: CardDisplay) => void;
  large?: boolean;
  tired?: boolean;
  selectable?: boolean;
  onSelect?: () => void;
}) {
  const size = large ? CARD_SIZE_FULLSCREEN : CARD_SIZE;
  const card = cardsById[cardId];
  if (!card) return <div className={`aspect-[5/7] ${size} rounded-lg bg-sky-100`} />;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={selectable && onSelect ? onSelect : () => onEnlarge(card)}
        className={`block aspect-[5/7] ${size} overflow-hidden rounded-lg border-2 bg-white shadow-lg transition hover:scale-105 ${
          selectable
            ? "border-emerald-400 ring-4 ring-emerald-300 animate-pulse"
            : tired
              ? "border-slate-400"
              : "border-sky-300"
        }`}
        style={tired && !selectable ? { transform: "rotate(20deg)" } : undefined}
        title={selectable ? `Target ${card.name}` : card.name}
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
      {tired && !selectable && (
        <span className="absolute -top-1.5 -right-1.5 rounded-full border border-white bg-slate-600 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
          TIRED
        </span>
      )}
    </div>
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

function SpriteBadge({ sprite, large }: { sprite: SpriteDisplay | undefined; large?: boolean }) {
  if (!sprite) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white/60 px-3 py-2 text-xs text-slate-400">
        No Sprite equipped
      </div>
    );
  }
  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-violet-300 bg-white px-3 py-2 shadow"
      title={`${sprite.spriteName}${sprite.rarity ? ` (${sprite.rarity})` : ""} — Level ${sprite.level}`}
    >
      <div className={`overflow-hidden rounded-full border border-violet-200 bg-violet-50 ${large ? "h-12 w-12" : "h-9 w-9"}`}>
        {sprite.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={sprite.image} alt={sprite.spriteName} className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center text-xs font-bold text-violet-400">S</span>
        )}
      </div>
      <div>
        <p className={`font-bold leading-tight ${large ? "text-sm" : "text-xs"}`}>{sprite.name}</p>
        <p className="text-[11px] leading-tight text-slate-500">
          {sprite.spriteName} · Lv {sprite.level}
        </p>
      </div>
    </div>
  );
}

function ZonePile({
  label,
  count,
  variant,
  onClick,
}: {
  label: string;
  count: number;
  variant: "deck" | "discard";
  onClick?: () => void;
}) {
  const base =
    variant === "deck"
      ? "border-slate-300 bg-gradient-to-br from-slate-500 to-slate-700 text-white"
      : "border-amber-300 bg-amber-50 text-amber-800 hover:bg-amber-100";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`flex flex-col items-center justify-center rounded-lg border-2 px-4 py-2 shadow ${base} ${
        onClick ? "cursor-pointer" : "cursor-default"
      }`}
    >
      <span className="text-[10px] font-bold uppercase tracking-wide">{label}</span>
      <span className="text-lg font-extrabold leading-tight">{count}</span>
    </button>
  );
}

// School ("search your deck for an Item card and put it under your
// control"): a real search-and-select picker over the CALLER'S OWN deck
// contents, fetched on demand via getSearchableDeckItemsAction — deck
// contents otherwise never reach the client at all (see getVisibleState).
function DeckSearchModal({
  matchId,
  instanceId,
  action,
  onClose,
  allowSkip,
}: {
  matchId: string;
  instanceId: string;
  action: PlayFormAction;
  onClose: () => void;
  /** Cathedral Pergrines' Dive Bomb is worded as "you MAY discard a card
   *  [and search]" — unlike School, the underlying action (the attack)
   *  must still go through even if there's nothing to find, or the
   *  player would never be able to attack once their deck ran out of
   *  Items. Adds a button that submits `action` with no targetId at all,
   *  letting the engine's own fallback (currently a no-op-safe "first
   *  Item found, or nothing") take over. */
  allowSkip?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<SearchableDeckCard[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    let cancelled = false;
    getSearchableDeckItemsAction(matchId)
      .then((result) => {
        if (!cancelled) setItems(result);
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't load your deck.");
      });
    return () => {
      cancelled = true;
    };
  }, [matchId]);

  const filtered = (items ?? []).filter((c) => c.name.toLowerCase().includes(query.toLowerCase()));

  async function submit(targetId: string | null) {
    const formData = new FormData();
    formData.set("matchId", matchId);
    formData.set("instanceId", instanceId);
    if (targetId) formData.set("targetId", targetId);
    onClose();
    await action(formData);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-4 border-white bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">Search your deck for an Item</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        {allowSkip && (
          <button
            type="button"
            onClick={() => submit(null)}
            className="mt-3 w-full rounded border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100"
          >
            Attack without searching
          </button>
        )}
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name..."
          autoFocus
          className="mt-3 w-full rounded border border-sky-300 px-3 py-2 text-sm outline-none focus:border-blue-600"
        />
        {error && <p className="mt-4 text-sm text-red-600">{error}</p>}
        {!items && !error && <p className="mt-4 text-sm text-slate-400">Loading your deck…</p>}
        {items && (
          <div className="mt-4 flex flex-wrap gap-3">
            {filtered.map((c) => (
              <button
                key={c.instanceId}
                type="button"
                onClick={() => submit(`deck:${c.instanceId}`)}
                className="flex w-28 flex-col items-center gap-1 text-center"
              >
                <div className="aspect-[5/7] w-28 overflow-hidden rounded-lg border-2 border-violet-300 bg-white shadow transition hover:scale-105">
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={c.image} alt={c.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-xs font-semibold text-slate-600">
                      {c.name}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold leading-tight">{c.name}</p>
                <p className="text-[11px] text-slate-500">
                  {c.attack !== null && `ATK ${c.attack} `}
                  {c.defence !== null && `DEF ${c.defence} `}
                  {c.speed !== null && `SPD ${c.speed}`}
                </p>
              </button>
            ))}
            {items.length === 0 && (
              <p className="text-sm text-slate-400">Your deck has no Item cards left to find.</p>
            )}
            {items.length > 0 && filtered.length === 0 && (
              <p className="text-sm text-slate-400">No match for "{query}".</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Old Book / Blast From The Past / Chemistry Lesson / Library all target
// the caller's OWN discard pile, which (unlike deck contents) is already
// fully visible to the client — no server round-trip needed to show it,
// just a real click-to-select picker instead of the old "most recently
// discarded" / "first Item found" auto-heuristics.
function DiscardPickerModal({
  matchId,
  instanceId,
  action,
  requirement,
  discard,
  cardsById,
  onClose,
}: {
  matchId: string;
  instanceId: string;
  action: PlayFormAction;
  requirement: Extract<TargetRequirement, { kind: "DISCARD_CARD" }>;
  discard: { instanceId: string; cardId: string }[];
  cardsById: Record<string, CardDisplay>;
  onClose: () => void;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  const eligible = discard.filter((c) => {
    if (requirement.filter === "ANY") return true;
    const wanted = requirement.filter === "ITEM" ? "Item" : "Spell";
    return cardsById[c.cardId]?.type === wanted;
  });

  async function submit(ids: string[]) {
    const formData = new FormData();
    formData.set("matchId", matchId);
    formData.set("instanceId", instanceId);
    if (ids.length > 0) formData.set("targetId", `discard:${ids.join(",")}`);
    onClose();
    await action(formData);
    router.refresh();
  }

  function toggle(id: string) {
    if (requirement.amount <= 1) {
      submit([id]);
      return;
    }
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= requirement.amount) return prev;
      return [...prev, id];
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-4 border-white bg-white p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold">
            Choose {requirement.amount > 1 ? `up to ${requirement.amount} cards` : "a card"} from your discard
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
          >
            ✕
          </button>
        </div>
        <div className="mt-4 flex flex-wrap gap-3">
          {eligible.map((c) => {
            const card = cardsById[c.cardId];
            const isSelected = selected.includes(c.instanceId);
            return (
              <button
                key={c.instanceId}
                type="button"
                onClick={() => toggle(c.instanceId)}
                className="flex w-28 flex-col items-center gap-1 text-center"
              >
                <div
                  className={`aspect-[5/7] w-28 overflow-hidden rounded-lg border-2 bg-white shadow transition hover:scale-105 ${
                    isSelected ? "border-emerald-400 ring-4 ring-emerald-300" : "border-amber-300"
                  }`}
                >
                  {card?.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={card.image} alt={card.name} className="h-full w-full object-contain" />
                  ) : (
                    <span className="flex h-full items-center justify-center p-1 text-xs font-semibold text-slate-600">
                      {card?.name ?? "Unknown"}
                    </span>
                  )}
                </div>
                <p className="text-xs font-semibold leading-tight">{card?.name ?? "Unknown"}</p>
              </button>
            );
          })}
          {eligible.length === 0 && (
            <p className="text-sm text-slate-400">Nothing eligible in your discard pile.</p>
          )}
        </div>
        {requirement.amount > 1 && (
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => submit(selected)}
            className="mt-4 w-full rounded bg-violet-600 px-3 py-2 text-xs font-bold text-white hover:bg-violet-700 disabled:opacity-40"
          >
            Confirm ({selected.length}/{requirement.amount})
          </button>
        )}
      </div>
    </div>
  );
}

export function Battlefield({
  matchId,
  visible,
  cardsById,
  spritesById,
  legalActions,
  isBotTurn,
  youUsername,
  opponentUsername,
}: {
  matchId: string;
  visible: VisibleGameState;
  cardsById: Record<string, CardDisplay>;
  spritesById: Record<string, SpriteDisplay>;
  legalActions: LegalAction[];
  isBotTurn: boolean;
  youUsername: string;
  opponentUsername: string;
}) {
  const router = useRouter();
  const [enlarged, setEnlarged] = useState<CardDisplay | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pendingPlay, setPendingPlay] = useState<PendingPlay | null>(null);
  const [deckSearch, setDeckSearch] = useState<{ instanceId: string; action: PlayFormAction; allowSkip?: boolean } | null>(
    null,
  );
  const [discardPick, setDiscardPick] = useState<{
    instanceId: string;
    action: PlayFormAction;
    requirement: Extract<TargetRequirement, { kind: "DISCARD_CARD" }>;
  } | null>(null);
  const [openDiscard, setOpenDiscard] = useState<0 | 1 | null>(null);
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

  const pending = visible.pendingCombat;
  const youAreDefending = pending?.defendingPlayerIndex === visible.viewerIndex;
  const youAreAttacking = pending?.attackingPlayerIndex === visible.viewerIndex;
  const attackerCardId = pending
    ? (visible.viewerIndex === pending.attackingPlayerIndex ? you : opponent).battlefield.find(
        (c) => c.instanceId === pending.attackerInstanceId,
      )?.cardId
    : undefined;
  const attackerName = attackerCardId ? cardsById[attackerCardId]?.name ?? "an Item" : "an Item";

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
  const defendableInstanceIds = new Set(
    legalActions.filter((a) => a.type === "DEFEND").map((a) => a.instanceId),
  );
  const canChooseNoDefender = legalActions.some((a) => a.type === "NO_DEFENDER");
  const canEndTurn = legalActions.some((a) => a.type === "END_TURN");

  // Cards' own real DB ids get embedded in log lines written server-side
  // (see engine.ts) instead of names, since the engine never carries
  // display names — this substitutes them back in for reading, using the
  // same cardsById the rest of this component already has.
  function humanizeLog(line: string): string {
    let out = line;
    for (const card of Object.values(cardsById)) {
      if (out.includes(card.id)) out = out.split(card.id).join(card.name);
    }
    return out;
  }

  // Some cards' ON_PLAY effects need a real target — a player, or an Item
  // on either battlefield — rather than the server auto-picking one. See
  // getRequiredTarget (abilities.ts): only ON_PLAY effects get a picker;
  // every other trigger still auto-resolves (no natural moment for a UI
  // prompt mid-resolution of some other action).
  //
  // Targeting is click-driven, not a dropdown: clicking "Play" arms
  // `pendingPlay`, which highlights every legal target directly on the
  // battlefield (a card, or a player's health total) — the next click on
  // one of those submits the play with that target.
  function targetCandidates(requirement: TargetRequirement) {
    // Shared with the server/Bot (engine.ts's getTargetCandidateIds) so the
    // UI can never highlight a target the Bot wouldn't also consider legal.
    const { playerTargetIds, itemInstanceIds } = getTargetCandidateIds(visible, visible.viewerIndex, requirement);
    return { playerTargetIds: new Set(playerTargetIds), itemInstanceIds: new Set(itemInstanceIds) };
  }

  const pendingCandidates = pendingPlay ? targetCandidates(pendingPlay.requirement) : null;

  async function submitTarget(targetId: string) {
    if (!pendingPlay) return;
    const { instanceId, action } = pendingPlay;
    setPendingPlay(null);
    const formData = new FormData();
    formData.set("matchId", matchId);
    formData.set("instanceId", instanceId);
    formData.set("targetId", targetId);
    await action(formData);
    router.refresh();
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

    if (requirement.kind === "DECK_ITEM") {
      return (
        <button
          type="button"
          onClick={() => setDeckSearch({ instanceId, action })}
          className="rounded bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700"
        >
          Play (search deck)
        </button>
      );
    }

    if (requirement.kind === "DISCARD_CARD") {
      return (
        <button
          type="button"
          onClick={() => setDiscardPick({ instanceId, action, requirement })}
          className="rounded bg-violet-600 px-3 py-1 text-xs font-bold text-white hover:bg-violet-700"
        >
          Play (choose from discard)
        </button>
      );
    }

    const isPicking = pendingPlay?.instanceId === instanceId;
    return (
      <button
        type="button"
        onClick={() => setPendingPlay(isPicking ? null : { instanceId, action, requirement })}
        className={`rounded px-3 py-1 text-xs font-bold text-white ${
          isPicking ? "bg-slate-500 hover:bg-slate-600" : "bg-violet-600 hover:bg-violet-700"
        }`}
      >
        {isPicking ? "Cancel targeting" : "Play (pick target)"}
      </button>
    );
  }

  function healthBadge(playerIndexForBadge: 0 | 1, health: number, sizeClasses: string) {
    const targetId = `player:${playerIndexForBadge}`;
    const isSelectable = Boolean(pendingCandidates?.playerTargetIds.has(targetId));
    if (isSelectable) {
      return (
        <button
          type="button"
          onClick={() => submitTarget(targetId)}
          className={`animate-pulse rounded-full border-2 border-emerald-400 bg-red-100 font-bold text-red-700 ring-4 ring-emerald-300 ${sizeClasses}`}
          title="Target this player"
        >
          ❤ {health}
        </button>
      );
    }
    return <span className={`rounded-full bg-red-100 font-bold text-red-700 ${sizeClasses}`}>❤ {health}</span>;
  }

  function renderSideRail(side: "you" | "opponent") {
    const isYou = side === "you";
    const player = isYou ? you : opponent;
    const playerIndexForSide = isYou ? visible.viewerIndex : opponentIndex;
    const sprite = player.spriteInstanceId ? spritesById[player.spriteInstanceId] : undefined;
    return (
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <SpriteBadge sprite={sprite} large={isFullscreen} />
        <ZonePile label="Deck" count={player.deckCount} variant="deck" />
        <ZonePile
          label="Discard"
          count={player.discard.length}
          variant="discard"
          onClick={() => setOpenDiscard(playerIndexForSide)}
        />
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
        <BotTurnDriver matchId={matchId} isBotTurn={isBotTurn} />

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

        {pendingPlay && (
          <div className="mt-4 flex items-center justify-between rounded border-2 border-emerald-400 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">
            <span>Choose a target — click a highlighted card or health total on the battlefield.</span>
            <button
              type="button"
              onClick={() => setPendingPlay(null)}
              className="rounded border border-emerald-400 bg-white px-3 py-1 text-xs font-bold text-emerald-700 hover:bg-emerald-100"
            >
              Cancel
            </button>
          </div>
        )}

        {pending && youAreAttacking && (
          <div className="mt-4 animate-pulse rounded border border-amber-300 bg-amber-50 px-4 py-3 text-center text-sm font-bold text-amber-800">
            WAITING FOR OPPONENT TO DEFEND — {attackerName} is attacking.
          </div>
        )}
        {pending && youAreDefending && (
          <div className="mt-4 rounded-xl border-2 border-red-300 bg-red-50 p-4 text-center shadow-lg">
            <p className="text-base font-extrabold text-red-800">CHOOSE A DEFENDER</p>
            <p className="mt-1 text-sm text-red-700">{opponentUsername}'s {attackerName} is attacking you.</p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-3">
              {you.battlefield
                .filter((c) => defendableInstanceIds.has(c.instanceId))
                .map((c) => (
                  <form key={c.instanceId} action={resolveDefenseAction}>
                    <input type="hidden" name="matchId" value={matchId} />
                    <input type="hidden" name="defenderInstanceId" value={c.instanceId} />
                    <button type="submit" className="flex flex-col items-center gap-1">
                      <CardFace cardId={c.cardId} cardsById={cardsById} onEnlarge={setEnlarged} large={isFullscreen} />
                      <span className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700">
                        Defend
                      </span>
                    </button>
                  </form>
                ))}
              {canChooseNoDefender && (
                <form action={resolveDefenseAction}>
                  <input type="hidden" name="matchId" value={matchId} />
                  <button
                    type="submit"
                    className="rounded-full border border-red-400 bg-white px-5 py-2.5 text-sm font-bold text-red-700 shadow hover:bg-red-50"
                  >
                    No Defender / Take Attack
                  </button>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Opponent */}
        <div className={`mt-4 rounded-2xl border border-sky-200 bg-white/95 shadow-xl backdrop-blur-sm ${isFullscreen ? "p-8" : "p-5"}`}>
          <div className="flex items-center justify-between">
            <span className={isFullscreen ? "text-2xl font-bold" : "text-lg font-bold"}>{opponentUsername}</span>
            {healthBadge(opponentIndex, opponent.health, isFullscreen ? "px-6 py-2 text-xl" : "px-4 py-1.5 text-base")}
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
              <CardFace
                key={c.instanceId}
                cardId={c.cardId}
                cardsById={cardsById}
                onEnlarge={setEnlarged}
                large={isFullscreen}
                tired={c.tired}
                selectable={pendingCandidates?.itemInstanceIds.has(c.instanceId)}
                onSelect={() => submitTarget(`item:${c.instanceId}`)}
              />
            ))}
            {opponent.battlefield.length === 0 && (
              <span className="text-xs text-slate-400">Empty battlefield</span>
            )}
          </div>
          {renderSideRail("opponent")}
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
                <CardFace
                  cardId={c.cardId}
                  cardsById={cardsById}
                  onEnlarge={setEnlarged}
                  large={isFullscreen}
                  tired={c.tired}
                  selectable={pendingCandidates?.itemInstanceIds.has(c.instanceId)}
                  onSelect={() => submitTarget(`item:${c.instanceId}`)}
                />
                {attackableInstanceIds.has(c.instanceId) &&
                  (getAttackTriggerTarget(cardsById[c.cardId]?.slug ?? "")?.kind === "DECK_ITEM" ? (
                    <button
                      type="button"
                      onClick={() => setDeckSearch({ instanceId: c.instanceId, action: attackDigitalAction, allowSkip: true })}
                      className="rounded bg-red-600 px-3 py-1 text-xs font-bold text-white hover:bg-red-700"
                    >
                      Attack (search deck)
                    </button>
                  ) : (
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
                  ))}
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
            {healthBadge(visible.viewerIndex, you.health, isFullscreen ? "px-6 py-2 text-xl" : "px-4 py-1.5 text-base")}
          </div>

          {renderSideRail("you")}
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

        <details className="mt-6 rounded border border-sky-200 bg-white/90 p-3 text-xs text-slate-600 shadow" open>
          <summary className="cursor-pointer font-semibold">Match log</summary>
          <ul className="mt-2 flex flex-col gap-0.5">
            {visible.log.map((line, i) => (
              <li key={i} className={i === visible.log.length - 1 ? "font-semibold text-violet-700" : undefined}>
                {humanizeLog(line)}
              </li>
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

      {deckSearch && (
        <DeckSearchModal
          matchId={matchId}
          instanceId={deckSearch.instanceId}
          action={deckSearch.action}
          allowSkip={deckSearch.allowSkip}
          onClose={() => setDeckSearch(null)}
        />
      )}

      {discardPick && (
        <DiscardPickerModal
          matchId={matchId}
          instanceId={discardPick.instanceId}
          action={discardPick.action}
          requirement={discardPick.requirement}
          discard={you.discard}
          cardsById={cardsById}
          onClose={() => setDiscardPick(null)}
        />
      )}

      {openDiscard !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpenDiscard(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-y-auto rounded-2xl border-4 border-white bg-white p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {openDiscard === visible.viewerIndex ? "Your discard pile" : `${opponentUsername}'s discard pile`}
              </h2>
              <button
                type="button"
                onClick={() => setOpenDiscard(null)}
                className="rounded-full px-2 py-1 text-sm font-bold text-slate-500 hover:bg-slate-100"
              >
                ✕
              </button>
            </div>
            <div className="mt-4 flex flex-wrap gap-3">
              {visible.players[openDiscard].discard.map((c) => {
                const card = cardsById[c.cardId];
                return (
                  <div key={c.instanceId} className="flex w-28 flex-col items-center gap-1 text-center">
                    <div className="aspect-[5/7] w-28 overflow-hidden rounded-lg border-2 border-amber-300 bg-white shadow">
                      {card?.image ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={card.image} alt={card.name} className="h-full w-full object-contain" />
                      ) : (
                        <span className="flex h-full items-center justify-center p-1 text-xs font-semibold text-slate-600">
                          {card?.name ?? "Unknown"}
                        </span>
                      )}
                    </div>
                    <p className="text-xs font-semibold leading-tight">{card?.name ?? "Unknown"}</p>
                    <p className="text-[11px] text-slate-500">
                      {card?.type}
                      {(card?.attack !== null || card?.defence !== null || card?.speed !== null) && card && (
                        <>
                          {" "}
                          {card.attack !== null && `ATK ${card.attack} `}
                          {card.defence !== null && `DEF ${card.defence} `}
                          {card.speed !== null && `SPD ${card.speed}`}
                        </>
                      )}
                    </p>
                  </div>
                );
              })}
              {visible.players[openDiscard].discard.length === 0 && (
                <p className="text-sm text-slate-400">Empty.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
