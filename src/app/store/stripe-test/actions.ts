"use server";

import { redirect } from "next/navigation";
import { requireAdminAction } from "@/lib/admin";
import { createTestCheckout } from "@/lib/stripe-test-checkout";
import { StripeConfigurationError } from "@/lib/stripe";

export async function startTestCheckout(_previous: { error: string | null }): Promise<{ error: string | null }> {
  void _previous;
  const session = await requireAdminAction();
  let url: string;
  try {
    url = await createTestCheckout(session.user.id);
  } catch (error) {
    return { error: error instanceof StripeConfigurationError ? error.message : "Stripe could not start checkout. Check the test key in Render and try again." };
  }
  redirect(url);
}
