import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getDeckLegality } from "@/lib/decks";
import {
  deleteDeckAction,
  increaseCardAction,
  decreaseCardAction,
  removeCardAction,
} from "@/lib/actions/deck-actions";
import { RenameDeckForm } from "./rename-deck-form";
import { CardPicker } from "./card-picker";

export default async function DeckDetailPage({
  params,
  searchParams,
}: PageProps<"/decks/[id]">) {
  const { id } = await params;
  const search = await searchParams;
  const session = await auth();

  const deck = await prisma.deck.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      userId: true,
      user: { select: { username: true } },
      formatId: true,
      format: { select: { name: true } },
      cards: {
        orderBy: { card: { name: "asc" } },
        select: {
          quantity: true,
          card: {
            select: {
              id: true,
              name: true,
              set: true,
              type: true,
              rarity: true,
            },
          },
        },
      },
    },
  });

  if (!deck) notFound();

  const isOwner = session?.user?.id === deck.userId;
  const legality = await getDeckLegality(deck.id);
  const totalCards = deck.cards.reduce((s, c) => s + c.quantity, 0);

  const allCards = isOwner
    ? await prisma.card.findMany({
        orderBy: { name: "asc" },
        select: { id: true, name: true, set: true, type: true, rarity: true },
      })
    : [];

  const deckCardQuantities = new Map(
    deck.cards.map((dc) => [dc.card.id, dc.quantity]),
  );

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1">
          {isOwner ? (
            <RenameDeckForm deckId={deck.id} initialName={deck.name} />
          ) : (
            <h1 className="text-2xl font-bold tracking-tight">{deck.name}</h1>
          )}
          <p className="mt-1 text-sm text-zinc-500">
            {deck.format.name} · {totalCards} cards · by{" "}
            {deck.user.username}
          </p>
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
      </div>

      {search.error === "in-use" && (
        <p className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          This deck can&apos;t be deleted while it&apos;s attached to a match
          or event.
        </p>
      )}

      {!legality.legal && (
        <div className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-3">
          <h2 className="text-sm font-semibold text-red-800">Illegal</h2>
          <ul className="mt-1 list-disc pl-5 text-sm text-red-700">
            {legality.errors.map((err) => (
              <li key={err}>{err}</li>
            ))}
          </ul>
        </div>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-zinc-500">
        Cards ({totalCards})
      </h2>
      {deck.cards.length === 0 ? (
        <p className="mt-3 text-sm text-zinc-500">No cards in this deck yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-1.5">
          {deck.cards.map(({ card, quantity }) => (
            <li
              key={card.id}
              className="flex items-center justify-between rounded border border-zinc-200 px-3 py-2"
            >
              <div>
                <span className="font-medium">{card.name}</span>{" "}
                <span className="text-xs text-zinc-500">
                  {[card.type, card.set].filter(Boolean).join(" · ")}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-6 text-center text-sm font-medium">
                  ×{quantity}
                </span>
                {isOwner && (
                  <>
                    <form action={decreaseCardAction}>
                      <input type="hidden" name="deckId" value={deck.id} />
                      <input type="hidden" name="cardId" value={card.id} />
                      <button
                        type="submit"
                        className="h-7 w-7 rounded border border-zinc-300 text-sm hover:bg-zinc-50"
                        aria-label={`Decrease ${card.name}`}
                      >
                        −
                      </button>
                    </form>
                    <form action={increaseCardAction}>
                      <input type="hidden" name="deckId" value={deck.id} />
                      <input type="hidden" name="cardId" value={card.id} />
                      <button
                        type="submit"
                        className="h-7 w-7 rounded border border-zinc-300 text-sm hover:bg-zinc-50"
                        aria-label={`Increase ${card.name}`}
                      >
                        +
                      </button>
                    </form>
                    <form action={removeCardAction}>
                      <input type="hidden" name="deckId" value={deck.id} />
                      <input type="hidden" name="cardId" value={card.id} />
                      <button
                        type="submit"
                        className="rounded border border-zinc-300 px-2 py-1 text-xs text-zinc-600 hover:bg-zinc-50"
                      >
                        Remove
                      </button>
                    </form>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {isOwner && (
        <>
          <h2 className="mt-10 text-sm font-semibold uppercase tracking-wide text-zinc-500">
            Add cards
          </h2>
          <CardPicker
            deckId={deck.id}
            allCards={allCards}
            deckCardQuantities={Object.fromEntries(deckCardQuantities)}
            addCardAction={increaseCardAction}
          />

          <div className="mt-10 border-t border-zinc-200 pt-6">
            <form action={deleteDeckAction}>
              <input type="hidden" name="deckId" value={deck.id} />
              <button
                type="submit"
                className="rounded border border-red-300 px-3 py-1.5 text-sm text-red-700 hover:bg-red-50"
              >
                Delete deck
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}

