// Server-side Stripe setup. Import only from server routes/actions.
// Test checkout lives in stripe-test-checkout.ts. Purchase fulfillment is separate.
import Stripe from "stripe";

export class StripeConfigurationError extends Error {}

export function getStripe(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  if (!key || !/^(sk|rk)_test_/.test(key)) {
    throw new StripeConfigurationError("Set STRIPE_SECRET_KEY to a Stripe test-mode secret or restricted key.");
  }
  return new Stripe(key, { maxNetworkRetries: 2 });
}

export function getStripeAppOrigin(): string {
  const value = process.env.APP_URL || process.env.RENDER_EXTERNAL_URL;
  if (!value) throw new StripeConfigurationError("Set APP_URL to your application's public URL.");
  let url: URL;
  try { url = new URL(value); }
  catch { throw new StripeConfigurationError("APP_URL must be a valid absolute URL."); }
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (url.username || url.password || (url.protocol !== "https:" && !(local && url.protocol === "http:"))) {
    throw new StripeConfigurationError("APP_URL must use HTTPS (HTTP is allowed for localhost).");
  }
  return url.origin;
}

// Pass request.text() unchanged: parsing and re-serializing JSON invalidates signatures.
export function verifyStripeWebhook(payload: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret?.startsWith("whsec_")) {
    throw new StripeConfigurationError("Set STRIPE_WEBHOOK_SECRET to the endpoint's signing secret.");
  }
  if (!signature) throw new Error("Missing Stripe webhook signature.");
  const event = getStripe().webhooks.constructEvent(payload, signature, secret);
  if (event.livemode) throw new Error("Live Stripe events are disabled during test-mode setup.");
  return event;
}
