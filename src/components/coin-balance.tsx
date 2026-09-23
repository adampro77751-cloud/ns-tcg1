import Link from "next/link";
import { getCoinBalance } from "@/lib/coins";

// Small reusable Coin balance pill — used in the top nav and on the
// store/collection pages. A Server Component so the balance is always
// freshly read from the database (the source of truth is the ledger/
// User.coinBalance cache, never anything cached client-side), and links
// through to the pack store since that's the one place to spend Coins.
export async function CoinBalance({ userId, href = "/store/packs" }: { userId: string; href?: string }) {
  const balance = await getCoinBalance(userId);
  return (
    <Link
      href={href}
      title="Coins — spend them in the Pack Store"
      className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-bold text-amber-700 shadow-sm transition hover:bg-amber-100"
    >
      <span aria-hidden>🪙</span>
      {balance.toLocaleString()}
    </Link>
  );
}
