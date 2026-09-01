"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// Periodically calls router.refresh() to re-fetch this route's server data
// in place — no full page reload, so scroll position, open forms, and any
// text the user is typing are left untouched (only the server-rendered
// data changes). Polling pauses whenever the tab isn't visible and stops
// entirely when `enabled` is false (e.g. once a match/event reaches a
// terminal status), so nothing keeps hitting the database in the
// background.
export function AutoRefresh({
  intervalMs = 7000,
  enabled = true,
}: {
  intervalMs?: number;
  enabled?: boolean;
}) {
  const router = useRouter();
  const routerRef = useRef(router);
  routerRef.current = router;

  useEffect(() => {
    if (!enabled) return;

    let timer: ReturnType<typeof setInterval> | null = null;

    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => {
        if (document.visibilityState === "visible") {
          routerRef.current.refresh();
        }
      }, intervalMs);
    };

    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        stop();
      } else {
        start();
      }
    };

    if (document.visibilityState === "visible") start();
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stop();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [enabled, intervalMs]);

  return null;
}
