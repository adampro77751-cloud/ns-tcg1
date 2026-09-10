"use client";

import { useActionState } from "react";
import {
  reserveOrderAction,
  type OrderFormState,
} from "@/lib/actions/order-actions";
import { MAX_ORDER_QUANTITY } from "@/lib/orders-constants";

const initialState: OrderFormState = { error: null };

export function ReservePackForm({
  packId,
  maxQuantity,
}: {
  packId: string;
  maxQuantity: number;
}) {
  const [state, formAction, pending] = useActionState(
    reserveOrderAction,
    initialState,
  );

  if (maxQuantity <= 0) {
    return (
      <p className="mt-3 text-sm font-semibold text-red-600">Out of stock</p>
    );
  }

  const cap = Math.min(MAX_ORDER_QUANTITY, maxQuantity);

  return (
    <form action={formAction} className="mt-3 flex flex-col gap-2">
      <input type="hidden" name="packId" value={packId} />
      <div className="flex items-center gap-2">
        <select
          name="quantity"
          defaultValue="1"
          className="rounded border border-sky-300 px-2 py-1.5 text-sm outline-none focus:border-blue-600"
        >
          {Array.from({ length: cap }, (_, i) => i + 1).map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
        <button
          type="submit"
          disabled={pending}
          className="flex-1 rounded-full bg-violet-600 px-4 py-1.5 text-sm font-bold text-white transition hover:bg-violet-700 disabled:opacity-60"
        >
          {pending ? "Reserving..." : "Reserve"}
        </button>
      </div>
      {state.error && <p className="text-xs text-red-600">{state.error}</p>}
    </form>
  );
}
