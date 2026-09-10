import Link from "next/link";
import { auth } from "@/auth";
import { getPacks } from "@/lib/orders";
import { formatPrice, MAX_ORDER_QUANTITY } from "@/lib/orders-constants";
import { canManageOrders } from "@/lib/order-access";
import { ReservePackForm } from "./reserve-pack-form";

export default async function StorePage({
  searchParams,
}: PageProps<"/store">) {
  const search = await searchParams;
  const [session, packs, isOrderManager] = await Promise.all([
    auth(),
    getPacks(),
    canManageOrders(),
  ]);
  const justReserved = search.reserved === "1";

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Store</h1>
          <p className="mt-1 text-sm text-slate-500">
            Reserve your NS TCG packs ahead of release. This is a
            reservation only — no payment is taken here.
          </p>
        </div>
        {isOrderManager && (
          <Link
            href="/store/orders"
            className="rounded border border-sky-300 px-3 py-1.5 text-sm hover:bg-sky-50"
          >
            Manage orders
          </Link>
        )}
      </div>

      {justReserved && (
        <p className="mt-4 rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          Your pack has been reserved!
        </p>
      )}

      {!session?.user && (
        <p className="mt-6 text-sm text-slate-600">
          <Link href="/login" className="text-blue-600">
            Log in
          </Link>{" "}
          to reserve a pack.
        </p>
      )}

      <div className="mt-6 grid gap-6 sm:grid-cols-2">
        {packs.map((pack) => (
          <div
            key={pack.id}
            className="rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-sky-50 p-6 shadow-sm"
          >
            <h2 className="text-xl font-bold tracking-tight text-slate-900">
              {pack.name}
            </h2>
            <p className="mt-1 text-2xl font-extrabold text-violet-700">
              {formatPrice(pack.priceCents)}
            </p>
            <p className="mt-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {pack.stock > 0 ? `${pack.stock} left in stock` : "Out of stock"}
            </p>
            <p className="mt-1 text-xs text-slate-400">
              Max {MAX_ORDER_QUANTITY} per order
            </p>

            {session?.user && (
              <ReservePackForm packId={pack.id} maxQuantity={pack.stock} />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
