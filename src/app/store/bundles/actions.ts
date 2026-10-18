"use server";

import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin";
import { createShopCheckout } from "@/lib/shop";
import { describeStripeCheckoutError } from "@/lib/stripe-errors";
import { ShopSelectionError } from "@/lib/shop-products";

export async function buyBundleAction(previous: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  void previous;
  // Sandbox purchases are limited to admins until live payments are configured.
  const session = await requireAdminAction();
  let url: string;
  try {
    url = await createShopCheckout(session.user.id, String(form.get("productId") ?? ""), String(form.get("setName") ?? ""));
  } catch (error) {
    return { error: error instanceof ShopSelectionError ? error.message : describeStripeCheckoutError(error) };
  }
  redirect(url);
}
