import { getStripe, getStripeAppOrigin, getStripeMode, StripeConfigurationError } from "./stripe";

const PURPOSE = "ns-tcg-test-checkout";

export async function createTestCheckout(userId: string): Promise<string> {
  if (getStripeMode() !== "test") throw new StripeConfigurationError("The demo checkout is disabled with live keys. Use the bundle store for real purchases.");
  const origin = getStripeAppOrigin();
  const session = await getStripe().checkout.sessions.create({
    mode: "payment",
    // Account defaults can enable Managed Payments, which requires product
    // tax classification. This demonstration sells no product.
    managed_payments: { enabled: false },
    client_reference_id: userId,
    metadata: { purpose: PURPOSE },
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "gbp", unit_amount: 100,
        product_data: { name: "NS TCG test payment", description: "Test only. No Coins, cards or packs are purchased." },
      },
    }],
    success_url: `${origin}/store/stripe-test?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store/stripe-test?cancelled=1`,
  });
  if (session.livemode || !session.url) throw new Error("Unable to start a test checkout.");
  return session.url;
}

export async function getTestCheckoutStatus(userId: string, sessionId: string): Promise<"paid" | "pending"> {
  if (getStripeMode() !== "test") throw new Error("Test checkout is disabled in live mode.");
  if (!/^cs_test_[A-Za-z0-9_]+$/.test(sessionId) || sessionId.length > 255) throw new Error("Invalid test session.");
  const session = await getStripe().checkout.sessions.retrieve(sessionId);
  if (session.livemode || session.client_reference_id !== userId || session.metadata?.purpose !== PURPOSE ||
      session.mode !== "payment" || session.currency !== "gbp" || session.amount_total !== 100) {
    throw new Error("Test checkout not found.");
  }
  return session.status === "complete" && session.payment_status === "paid" ? "paid" : "pending";
}
