"use client";

import { useActionState } from "react";
import { claimDailyTaskAction } from "./actions";

export function ClaimButton({ taskKey, day }: { taskKey: string; day: string }) {
  const [state, action, pending] = useActionState(claimDailyTaskAction, {});
  return <form action={action}>
    <input type="hidden" name="taskKey" value={taskKey} />
    <input type="hidden" name="day" value={day} />
    <button disabled={pending} className="rounded-full bg-violet-600 px-5 py-2 text-sm font-bold text-white hover:bg-violet-700 disabled:opacity-50">{pending ? "Claiming…" : "Claim Coins"}</button>
    <p role="status" className="mt-2 text-sm">{state.error ?? state.success}</p>
  </form>;
}
