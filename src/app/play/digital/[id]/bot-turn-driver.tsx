"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { advanceBotTurnAction } from "@/lib/actions/digital-match-actions";

// Drives the Bot's turn one visible step at a time instead of letting the
// whole turn resolve instantly the moment it becomes the Bot's turn. Ticks
// advanceBotTurnAction (one action) on a short delay, then refreshes the
// page's server data to show that single action having landed, and keeps
// going for as long as it's still genuinely the Bot's move — so a human
// watching can actually follow what the Bot is doing, action by action,
// including any triggered abilities that fire along the way (see the
// match log, which now narrates every trigger).
export function BotTurnDriver({
  matchId,
  isBotTurn,
  tickMs = 80,
}: {
  matchId: string;
  /** Whether the Bot has something to do right now — either it's the
   *  Bot's own active turn with nothing pending, or the Bot is the
   *  defending player in a pending combat. */
  isBotTurn: boolean;
  tickMs?: number;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;
  const [isTicking, setIsTicking] = useState(false);

  useEffect(() => {
    if (!isBotTurn) return;
    let cancelled = false;
    setIsTicking(true);

    const timer = setTimeout(async () => {
      if (cancelled) return;
      try {
        await advanceBotTurnAction(matchId);
      } finally {
        if (!cancelled) routerRef.current.refresh();
      }
    }, tickMs);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [matchId, isBotTurn, tickMs]);

  useEffect(() => {
    if (!isBotTurn) setIsTicking(false);
  }, [isBotTurn]);

  if (!isBotTurn) return null;

  return (
    <div className="mt-4 flex items-center justify-center gap-2 rounded-full border border-violet-300 bg-violet-50 px-4 py-2 text-sm font-semibold text-violet-700">
      <span className={isTicking ? "animate-pulse" : ""}>🤖 Bot is playing…</span>
    </div>
  );
}
