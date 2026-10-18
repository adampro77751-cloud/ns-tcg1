// Server-side Stripe setup. Import only from server routes/actions.
// Test checkout lives in stripe-test-checkout.ts. Purchase fulfillment is separate.
import Stripe from "stripe";

export class StripeConfigurationError extends Error {}

export function getStripeMode(): "test" | "live" {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  const mode = key?.match(/^(?:sk|rk)_(test|live)_/u)?.[1];
  if (mode !== "test" && mode !== "live") {
    throw new StripeConfigurationError("Set STRIPE_SECRET_KEY to a Stripe secret or restricted key for test or live mode.");
  }
  return mode;
}

export function getStripe(): Stripe {
  getStripeMode();
  const key = process.env.STRIPE_SECRET_KEY!.trim();
  return new Stripe(key, { maxNetworkRetries: 2 });
}

export function getStripeWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret?.startsWith("whsec_")) {
    throw new StripeConfigurationError("Set STRIPE_WEBHOOK_SECRET to the endpoint's signing secret.");
  }
  return secret;
}

export function getShopPaymentMode(): "test" | "live" | null {
  try {
    const mode = getStripeMode();
    getStripeAppOrigin();
    if (mode === "live") getStripeWebhookSecret();
    return mode;
  } catch { return null; }
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
  const secret = getStripeWebhookSecret();
  if (!signature) throw new Error("Missing Stripe webhook signature.");
  const event = getStripe().webhooks.constructEvent(payload, signature, secret);
  if (event.livemode !== (getStripeMode() === "live")) throw new Error("Stripe event mode does not match the configured key.");
  return event;
}
