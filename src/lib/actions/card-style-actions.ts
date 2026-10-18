"use server";

import { revalidatePath } from "next/cache";
import { requirePlayerAction } from "@/lib/player-access";
import { prisma } from "@/lib/prisma";
import { GOLDEN_COINS_STYLE } from "@/lib/card-style-catalog";

export async function setCardStyleAction(form: FormData) {
  const session = await requirePlayerAction();
  const equipped = form.get("equipped");
  if (equipped !== "true" && equipped !== "false") throw new Error("Choose a card style.");
  const result = await prisma.userCardStyle.updateMany({
    where: { userId: session.user.id, styleKey: GOLDEN_COINS_STYLE.key }, data: { equipped: equipped === "true" },
  });
  if (!result.count) throw new Error("You have not unlocked this card style.");
  revalidatePath("/collection");
  revalidatePath("/decks", "layout");
  revalidatePath("/play/digital/[id]", "page");
}
