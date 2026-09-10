"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { MAX_ORDER_QUANTITY } from "@/lib/orders-constants";
import { requireOrderManagerAction } from "@/lib/order-access";

export type OrderFormState = {
  error: string | null;
};

// Reservation only — no real payment is taken. Stock is decremented
// atomically (compare-and-set: only succeeds if enough stock is still
// available at the moment this runs), the same pattern already used for
// Match join, so two people reserving the last few units at once can never
// both succeed and drive stock negative.
export async function reserveOrderAction(
  _prevState: OrderFormState,
  formData: FormData,
): Promise<OrderFormState> {
  const session = await auth();
  if (!session?.user) redirect("/login");

  const packId = String(formData.get("packId") ?? "");
  const quantityRaw = Number(formData.get("quantity"));
  const quantity = Number.isInteger(quantityRaw) ? quantityRaw : 0;

  if (quantity < 1 || quantity > MAX_ORDER_QUANTITY) {
    return { error: `Choose a quantity between 1 and ${MAX_ORDER_QUANTITY}.` };
  }

  try {
    await prisma.$transaction(async (tx) => {
      const result = await tx.pack.updateMany({
        where: { id: packId, stock: { gte: quantity } },
        data: { stock: { decrement: quantity } },
      });
      if (result.count === 0) {
        throw new Error("Not enough stock left for that quantity.");
      }
      await tx.order.create({
        data: { userId: session.user.id, packId, quantity },
      });
    });
  } catch (err) {
    return { error: (err as Error).message || "Couldn't reserve that pack." };
  }

  revalidatePath("/store");
  redirect("/store?reserved=1");
}

export async function markOrderDeliveredAction(formData: FormData) {
  const session = await requireOrderManagerAction();

  const orderId = String(formData.get("orderId") ?? "");

  // Compare-and-set: only a still-RESERVED order can be marked delivered,
  // and only once — this can't double-fire even if clicked twice quickly.
  await prisma.order.updateMany({
    where: { id: orderId, status: "RESERVED" },
    data: {
      status: "DELIVERED",
      deliveredAt: new Date(),
      deliveredById: session.user.id,
    },
  });

  revalidatePath("/store/orders");
}
