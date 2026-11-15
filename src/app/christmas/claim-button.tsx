"use client";

import { useActionState } from "react";
import { claimChristmasAction } from "@/lib/actions/christmas-actions";

export function ChristmasClaimButton({ day }: { day: number }) {
  const [state, action, pending] = useActionState(claimChristmasAction, {});
  return <form action={action} className="mt-4">
    <input type="hidden" name="day" value={day} />
    <button disabled={pending} className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-50">{pending ? "Opening..." : "Open gift"}</button>
    <p aria-live="polite" className="mt-2 text-xs">{state.error ?? state.success}</p>
  </form>;
}
