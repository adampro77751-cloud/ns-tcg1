"use server";

import { revalidatePath } from "next/cache";
import { requirePlayerAction } from "@/lib/player-access";
import { setOwnedArtStyle } from "@/lib/card-styles";
import { GOLDEN_COINS_STYLE } from "@/lib/card-style-catalog";

export async function setCardStyleAction(form: FormData) {
  const session = await requirePlayerAction();
  const equipped = form.get("equipped");
  if (equipped !== "true" && equipped !== "false") throw new Error("Choose a card style.");
  await setOwnedArtStyle(session.user.id, String(form.get("styleKey") ?? GOLDEN_COINS_STYLE.key), equipped === "true");
  revalidatePath("/", "layout");
}
