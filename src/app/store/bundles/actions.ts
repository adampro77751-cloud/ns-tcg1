"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { getStripeMode } from "@/lib/stripe";
import { createShopCheckout } from "@/lib/shop";
import { describeStripeCheckoutError } from "@/lib/stripe-errors";
import { ShopSelectionError } from "@/lib/shop-products";

export async function buyBundleAction(previous: { error: string | null }, form: FormData): Promise<{ error: string | null }> {
  void previous;
  const session = await auth();
  if (!session?.user) redirect("/login");
  let url: string;
  try {
    if (getStripeMode() === "test" && session.user.role !== "ADMIN") {
      return { error: "Sandbox purchases are limited to admins." };
    }
    url = await createShopCheckout(session.user.id, String(form.get("productId") ?? ""), String(form.get("setName") ?? ""));
  } catch (error) {
    return { error: error instanceof ShopSelectionError ? error.message : session.user.role === "ADMIN"
      ? describeStripeCheckoutError(error) : "Checkout is temporarily unavailable. Please try again later." };
  }
  redirect(url);
}
