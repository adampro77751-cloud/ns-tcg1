"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

// Manual fallback alongside AutoRefresh — same router.refresh() mechanism,
// just triggered on click instead of on a timer.
export function RefreshButton({ className }: { className?: string }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justRefreshed, setJustRefreshed] = useState(false);

  return (
    <button
      type="button"
      onClick={() => {
        startTransition(() => {
          router.refresh();
        });
        setJustRefreshed(true);
        setTimeout(() => setJustRefreshed(false), 1200);
      }}
      className={
        className ??
        "rounded border border-sky-300 px-3 py-1.5 text-sm hover:bg-sky-50"
      }
    >
      {isPending ? "Refreshing..." : justRefreshed ? "Refreshed" : "Refresh"}
    </button>
  );
}
