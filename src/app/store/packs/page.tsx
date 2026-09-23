import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { listAvailableSets } from "@/lib/packs";
import { getCoinBalance } from "@/lib/coins";
import { PACK_COST } from "@/lib/economy-constants";
import { PackStoreClient } from "./pack-store-client";

export default async function PackStorePage() {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const [sets, coinBalance] = await Promise.all([listAvailableSets(), getCoinBalance(session.user.id)]);

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-12">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">🪙 Pack Store</h1>
          <p className="mt-1 text-sm text-slate-500">
            Spend Coins on packs from any NS TCG set — {PACK_COST.toLocaleString()} Coins for 10 cards. No real-money
            payments yet — Coins only.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-amber-300 bg-amber-50 px-4 py-2 text-lg font-extrabold text-amber-700">
          🪙 {coinBalance.toLocaleString()}
        </div>
      </div>

      <PackStoreClient sets={sets} coinBalance={coinBalance} />
    </div>
  );
}
