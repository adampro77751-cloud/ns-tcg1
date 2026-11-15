"use server";

import { revalidatePath } from "next/cache";
import { requirePlayerAction } from "@/lib/player-access";
import { claimChristmasReward } from "@/lib/christmas";

export async function claimChristmasAction(_previous: { error?: string; success?: string }, form: FormData): Promise<{ error?: string; success?: string }> {
  const session = await requirePlayerAction();
  try {
    const result = await claimChristmasReward(session.user.id, Number(form.get("day")));
    for (const path of ["/christmas", "/collection", "/store/packs"]) revalidatePath(path);
    revalidatePath("/", "layout");
    return result;
  } catch {
    return { error: "This reward is not ready yet. Please try again later. Your door remains unclaimed." };
  }
}
