import { redirect } from "next/navigation";

// The physical-pack preorder store has been taken offline in favor of the
// Coins-based Pack Store (/store/packs) — see that route. This page (and
// its homepage link) is removed, but the underlying Pack/Order data and
// the admin fulfillment page (/store/orders) are deliberately left
// untouched/reachable so existing reservations can still be processed.
// Reversible: restore this file's previous contents to bring the
// reservation flow back.
export default function StorePage() {
  redirect("/store/packs");
}
