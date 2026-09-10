// Pure, DB-free constants/helpers shared between server code and client
// components (e.g. src/app/store/reserve-pack-form.tsx). Kept separate
// from src/lib/orders.ts, which imports Prisma — importing that from a
// client component would bundle the Postgres driver into client JS.

// Real, current limit — not a placeholder. Enforced server-side in
// reserveOrderAction, never trusted from client input.
export const MAX_ORDER_QUANTITY = 5;

export function formatPrice(cents: number) {
  if (cents % 100 === 0) return `£${cents / 100}`;
  return `£${(cents / 100).toFixed(2)}`;
}
