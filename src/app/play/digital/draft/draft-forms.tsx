"use client";

import { useActionState, useState } from "react";
import Image from "next/image";
import { enterDraftAction, pickDraftAction, startDraftAction, resumeDraftAction } from "@/lib/actions/draft-actions";
import { DRAFT_ENTRY_COST } from "@/lib/economy-constants";
import { DRAFT_MIN_DECK, DRAFT_MAX_DECK } from "@/lib/draft-logic";

export type DraftCardDisplay = {
  id: string; name: string; image: string | null; type: string | null;
  rarity: string | null; attack: number | null; defence: number | null;
  speed: number | null; rulesText: string | null;
};

const initial = { error: null };
const button = "rounded-full bg-violet-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50";

export function DraftEntryForm({ sets, balance }: { sets: { name: string }[]; balance: number }) {
  const [state, action, pending] = useActionState(enterDraftAction, initial);
  return (
    <form action={action} className="mt-6 flex flex-col items-start gap-4">
      <fieldset className="w-full"><legend className="text-sm font-semibold">Draft mode</legend>
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          <label className="rounded-xl border border-sky-200 bg-white p-4"><input type="radio" name="mode" value="casual" defaultChecked className="mr-2 accent-violet-600" /><strong>Casual bot draft</strong><span className="mt-1 block text-sm text-slate-600">Relaxed play with no rank changes.</span></label>
          <label className="rounded-xl border border-violet-300 bg-white p-4"><input type="radio" name="mode" value="ranked" className="mr-2 accent-violet-600" /><strong>Ranked bot draft</strong><span className="mt-1 block text-sm text-slate-600">Climb the ladder against increasingly skilled bots.</span></label>
        </div>
      </fieldset>
      <label className="w-full text-sm font-semibold">Draft set
        <select name="setName" required className="mt-2 block w-full rounded-lg border border-sky-200 bg-white p-3">
          {sets.map((set) => <option key={set.name} value={set.name}>{set.name}</option>)}
        </select>
      </label>
      <p className="text-sm text-slate-600">Your balance: <strong>{balance.toLocaleString()} Coins</strong></p>
      {balance < DRAFT_ENTRY_COST && <p className="text-sm text-amber-700">You need {DRAFT_ENTRY_COST.toLocaleString()} Coins to enter.</p>}
      {state.error && <p role="alert" className="text-sm text-red-600">{state.error}</p>}
      <button className={button} disabled={pending || !sets.length || balance < DRAFT_ENTRY_COST}>
        {pending ? "Creating your pod…" : `Enter draft · ${DRAFT_ENTRY_COST.toLocaleString()} Coins`}
      </button>
    </form>
  );
}

function CardFace({ card }: { card: DraftCardDisplay }) {
  return (
    <>
      <div className="relative aspect-[5/7] overflow-hidden rounded-lg bg-gradient-to-br from-violet-100 to-sky-100">
        {card.image ? <Image src={card.image} alt={card.name} fill sizes="(max-width: 640px) 45vw, 220px" unoptimized className="object-contain" />
          : <span className="flex h-full items-center justify-center p-3 text-center text-lg font-bold text-violet-800">{card.name}</span>}
      </div>
      <span className="mt-2 block font-bold">{card.name}</span>
      <span className="block text-xs text-slate-500">{card.type} · {card.rarity}</span>
      {card.attack !== null && <span className="mt-1 block text-xs">ATK {card.attack} · DEF {card.defence ?? 0} · SPD {card.speed ?? 0}</span>}
      {card.rulesText && <span className="mt-2 block text-xs text-slate-600">{card.rulesText}</span>}
    </>
  );
}

export function DraftPickForm({ podId, version, cards }: { podId: string; version: number; cards: DraftCardDisplay[] }) {
  const [state, action, pending] = useActionState(pickDraftAction, initial);
  return (
    <form action={action}>
      <input type="hidden" name="podId" value={podId} />
      <input type="hidden" name="version" value={version} />
      {state.error && <p role="alert" className="my-3 text-sm text-red-600">{state.error}</p>}
      <fieldset disabled={pending} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <legend className="mb-4 text-sm text-slate-600">{pending ? "Saving your pick and passing packs…" : "Pick one card. The five bots pick too, then everyone passes their pack."}</legend>
        {cards.map((card, index) => (
          <button key={`${version}-${index}`} type="submit" name="index" value={index}
            aria-label={`Draft ${card.name}`} className="rounded-xl border border-sky-200 bg-white p-3 text-left text-sm transition hover:border-violet-500 hover:shadow-md disabled:opacity-50">
            <CardFace card={card} />
            <span className="mt-3 block rounded-full bg-violet-50 py-2 text-center text-xs font-bold text-violet-700">Pick & keep</span>
          </button>
        ))}
      </fieldset>
    </form>
  );
}

export function DraftDeckForm({ podId, version, pool }: {
  podId: string; version: number; pool: (DraftCardDisplay & { quantity: number })[];
}) {
  const [counts, setCounts] = useState<Record<string, number>>(() => Object.fromEntries(pool.map((card) => [card.id, card.quantity])));
  const [state, action, pending] = useActionState(startDraftAction, initial);
  const deck = pool.flatMap((card) => Array.from({ length: counts[card.id] ?? 0 }, () => card.id));
  const valid = deck.length >= DRAFT_MIN_DECK && deck.length <= DRAFT_MAX_DECK;
  return (
    <form action={action} className="mt-5">
      <input type="hidden" name="podId" value={podId} />
      <input type="hidden" name="version" value={version} />
      <input type="hidden" name="deck" value={JSON.stringify(deck)} />
      <div className="sticky top-0 z-10 mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-violet-200 bg-white/95 p-4 shadow-sm">
        <p className="font-bold">{deck.length} cards selected <span className="text-sm font-normal text-slate-500">· choose {DRAFT_MIN_DECK}–{DRAFT_MAX_DECK}</span></p>
        <button className={button} disabled={pending || !valid}>{pending ? "Seating your first match…" : "Lock deck & start round 1"}</button>
      </div>
      <p className="mb-4 text-sm text-slate-600">Use only cards from this draft. All your picks are already in your collection. Your deck stays locked for all five rounds; there is no copy limit beyond what you drafted. Sprites are not used.</p>
      {state.error && <p role="alert" className="mb-4 text-sm text-red-600">{state.error}</p>}
      <fieldset disabled={pending} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <legend className="sr-only">Choose cards for your draft deck</legend>
        {pool.map((card) => <div key={card.id} className="rounded-xl border border-sky-200 bg-white p-3 text-sm">
          <CardFace card={card} />
          <label className="mt-3 block text-xs font-semibold">In deck (drafted {card.quantity})
            <input aria-label={`${card.name} copies in deck`} type="number" min={0} max={card.quantity}
              value={counts[card.id] ?? 0} onChange={(event) => setCounts({ ...counts, [card.id]: Math.max(0, Math.min(card.quantity, Math.floor(Number(event.target.value) || 0))) })}
              className="mt-1 w-full rounded border border-sky-200 px-2 py-2 text-sm" />
          </label>
        </div>)}
      </fieldset>
    </form>
  );
}

export function ResumeDraftForm({ podId }: { podId: string }) {
  const [state, action, pending] = useActionState(resumeDraftAction, initial);
  return <form action={action} className="mt-4">
    <input type="hidden" name="podId" value={podId} />
    {state.error && <p role="alert" className="mb-3 text-sm text-red-600">{state.error}</p>}
    <button className={button} disabled={pending}>{pending ? "Updating pod…" : "Continue draft"}</button>
  </form>;
}
