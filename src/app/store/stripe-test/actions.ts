"use server";

import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin";
import { createTestCheckout } from "@/lib/stripe-test-checkout";
import { describeStripeCheckoutError } from "@/lib/stripe-errors";

export async function startTestCheckout(_previous: { error: string | null }): Promise<{ error: string | null }> {
  void _previous;
  const session = await requireAdminAction();
  let url: string;
  try {
    url = await createTestCheckout(session.user.id);
  } catch (error) {
    return { error: describeStripeCheckoutError(error) };
  }
  redirect(url);
}
