import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireOrderManagerPage } from "@/lib/order-access";
import { formatPrice } from "@/lib/orders-constants";
import { markOrderDeliveredAction } from "@/lib/actions/order-actions";

export default async function OrdersPage() {
  await requireOrderManagerPage();

  const orders = await prisma.order.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      quantity: true,
      status: true,
      createdAt: true,
      deliveredAt: true,
      user: { select: { username: true } },
      pack: { select: { name: true, priceCents: true } },
      deliveredBy: { select: { username: true } },
    },
  });

  const reserved = orders.filter((o) => o.status === "RESERVED");
  const delivered = orders.filter((o) => o.status === "DELIVERED");

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-12">
      <Link href="/store" className="text-sm text-blue-600">
        ← Store
      </Link>
      <h1 className="mt-2 text-2xl font-bold tracking-tight">Orders</h1>
      <p className="mt-1 text-sm text-slate-500">
        {reserved.length} reserved · {delivered.length} delivered
      </p>

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Reserved
      </h2>
      {reserved.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No pending reservations.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {reserved.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3"
            >
              <div>
                <div className="font-medium">
                  {order.user.username} · {order.quantity}× {order.pack.name}
                </div>
                <div className="text-xs text-slate-500">
                  {formatPrice(order.pack.priceCents * order.quantity)} ·{" "}
                  {order.createdAt.toLocaleDateString()}
                </div>
              </div>
              <form action={markOrderDeliveredAction}>
                <input type="hidden" name="orderId" value={order.id} />
                <button
                  type="submit"
                  className="rounded bg-blue-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-blue-700"
                >
                  Mark delivered
                </button>
              </form>
            </li>
          ))}
        </ul>
      )}

      <h2 className="mt-8 text-sm font-semibold uppercase tracking-wide text-slate-500">
        Delivered
      </h2>
      {delivered.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">No delivered orders yet.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {delivered.map((order) => (
            <li
              key={order.id}
              className="flex items-center justify-between rounded border border-sky-200 bg-white px-4 py-3 text-sm"
            >
              <div>
                <span className="font-medium">{order.user.username}</span> ·{" "}
                {order.quantity}× {order.pack.name}
              </div>
              <div className="text-xs text-slate-500">
                Delivered {order.deliveredAt?.toLocaleDateString()}
                {order.deliveredBy ? ` by ${order.deliveredBy.username}` : ""}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
