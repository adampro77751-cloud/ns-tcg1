import { verifyStripeWebhook, StripeConfigurationError } from "@/lib/stripe";
import { fulfillShopCheckout } from "@/lib/shop";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let event;
  try {
    event = verifyStripeWebhook(await request.text(), request.headers.get("stripe-signature"));
  } catch (error) {
    return Response.json({ error: error instanceof StripeConfigurationError ? "Webhook is not configured." : "Invalid webhook signature." },
      { status: error instanceof StripeConfigurationError ? 503 : 400 });
  }
  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    try { await fulfillShopCheckout(event.data.object.id); }
    catch { return Response.json({ error: "Purchase could not be fulfilled. Retry this event." }, { status: 500 }); }
  }
  return Response.json({ received: true });
}
