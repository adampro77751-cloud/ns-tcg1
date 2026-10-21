"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { buyAndOpenPack, openEarnedPack, type PackOpeningResult } from "@/lib/packs";
import { InsufficientCoinsError } from "@/lib/coins";
import { buyHalloweenPack } from "@/lib/halloween-packs";

export async function buyHalloweenPackAction(formData: FormData): Promise<PackOpeningResult> {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");
  const result = await buyHalloweenPack(session.user.id, String(formData.get("requestKey") ?? ""));
  revalidatePath("/", "layout");
  return result;
}

// Called directly from the client store component (not a useActionState
// form — the caller needs the full pack-opening result, cards and all, to
// drive the reveal UI, not just a success/error string). Throws on
// failure; the client catches and shows the message. Every validation
// (login, Coins balance, pack contents) happens server-side inside
// buyAndOpenPack — this action trusts nothing from the client beyond
// which set to buy from.
export async function buyPackAction(formData: FormData): Promise<PackOpeningResult> {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");

  const setName = String(formData.get("setName") ?? "");
  if (!setName) throw new Error("Choose a set.");

  try {
    const result = await buyAndOpenPack(session.user.id, setName, String(formData.get("packKind") ?? "NORMAL"));
    revalidatePath("/store");
    revalidatePath("/store/packs");
    revalidatePath("/collection");
    revalidatePath("/decks");
    revalidatePath("/sprites");
    revalidatePath("/sprites/mine");
    revalidatePath(`/player/${session.user.username}`);
    return result;
  } catch (err) {
    if (err instanceof InsufficientCoinsError) {
      throw new Error("Not enough Coins for that pack.");
    }
    throw err;
  }
}

export async function openEarnedPackAction(formData: FormData): Promise<PackOpeningResult> {
  const session = await auth();
  if (!session?.user) throw new Error("You must be logged in.");
  const result = await openEarnedPack(session.user.id, String(formData.get("earnedPackId") ?? ""));
  revalidatePath("/", "layout");
  return result;
}
