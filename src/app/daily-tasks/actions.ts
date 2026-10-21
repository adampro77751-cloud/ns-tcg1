"use server";

import { revalidatePath } from "next/cache";
import { requirePlayerAction } from "@/lib/player-access";
import { claimDailyTask } from "@/lib/daily-tasks";

export async function claimDailyTaskAction(_previous: { error?: string; success?: string }, formData: FormData) {
  const session = await requirePlayerAction();
  const result = await claimDailyTask(session.user.id, String(formData.get("taskKey") ?? ""), String(formData.get("day") ?? ""));
  revalidatePath("/", "layout");
  return result;
}
