"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type FormState = {
  error: string | null;
};

const createDeckSchema = z.object({
  name: z.string().trim().min(1, "Enter a deck name.").max(60),
  formatId: z.string().min(1, "Choose a format."),
});

export async function createDeckAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const parsed = createDeckSchema.safeParse({
    name: formData.get("name"),
    formatId: formData.get("formatId"),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input." };
  }

  const format = await prisma.format.findUnique({
    where: { id: parsed.data.formatId, isActive: true },
    select: { id: true },
  });
  if (!format) return { error: "Choose a valid format." };

  const deck = await prisma.deck.create({
    data: {
      name: parsed.data.name,
      formatId: format.id,
      userId: session.user.id,
    },
  });

  redirect(`/decks/${deck.id}`);
}

async function requireOwnedDeck(deckId: string, userId: string) {
  const deck = await prisma.deck.findUnique({
    where: { id: deckId },
    select: { id: true, userId: true },
  });
  if (!deck || deck.userId !== userId) {
    throw new Error("Deck not found.");
  }
  return deck;
}

export async function renameDeckAction(
  _prevState: FormState,
  formData: FormData,
): Promise<FormState> {
  const session = await auth();
  if (!session?.user) return { error: "You must be logged in." };

  const deckId = String(formData.get("deckId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return { error: "Enter a deck name." };
  if (name.length > 60) return { error: "Deck name is too long." };

  try {
    await requireOwnedDeck(deckId, session.user.id);
  } catch {
    return { error: "You don't own this deck." };
  }

  await prisma.deck.update({ where: { id: deckId }, data: { name } });
  revalidatePath(`/decks/${deckId}`);
  revalidatePath("/decks");
  return { error: null };
}

export async function deleteDeckAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const deckId = String(formData.get("deckId") ?? "");
  await requireOwnedDeck(deckId, session.user.id);

  try {
    await prisma.deck.delete({ where: { id: deckId } });
  } catch {
    // Most likely a foreign key restriction because this deck is attached
    // to a match or event — surface that instead of a raw DB error.
    redirect(`/decks/${deckId}?error=in-use`);
  }

  revalidatePath("/decks");
  redirect("/decks");
}

async function mutateDeckCard(
  deckId: string,
  cardId: string,
  userId: string,
  mutate: (currentQuantity: number) => number,
) {
  await requireOwnedDeck(deckId, userId);

  const card = await prisma.card.findUnique({
    where: { id: cardId },
    select: { id: true },
  });
  if (!card) throw new Error("Card not found.");

  const existing = await prisma.deckCard.findUnique({
    where: { deckId_cardId: { deckId, cardId } },
    select: { quantity: true },
  });

  const nextQuantity = mutate(existing?.quantity ?? 0);

  if (nextQuantity <= 0) {
    if (existing) {
      await prisma.deckCard.delete({
        where: { deckId_cardId: { deckId, cardId } },
      });
    }
  } else if (existing) {
    await prisma.deckCard.update({
      where: { deckId_cardId: { deckId, cardId } },
      data: { quantity: nextQuantity },
    });
  } else {
    await prisma.deckCard.create({
      data: { deckId, cardId, quantity: nextQuantity },
    });
  }

  revalidatePath(`/decks/${deckId}`);
}

export async function increaseCardAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const deckId = String(formData.get("deckId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  await mutateDeckCard(deckId, cardId, session.user.id, (q) => q + 1);
}

export async function decreaseCardAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const deckId = String(formData.get("deckId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  await mutateDeckCard(deckId, cardId, session.user.id, (q) => q - 1);
}

export async function removeCardAction(formData: FormData) {
  const session = await auth();
  if (!session?.user) redirect("/login");
  const deckId = String(formData.get("deckId") ?? "");
  const cardId = String(formData.get("cardId") ?? "");
  await mutateDeckCard(deckId, cardId, session.user.id, () => 0);
}
