import Stripe from "stripe";
import { StripeConfigurationError } from "./stripe";

function redactSecrets(message: string): string {
  return message.replace(/\b(?:[spr]k_(?:test|live)_|whsec_)[A-Za-z0-9_*.-]+/g, "[hidden key]").slice(0, 600);
}

// This diagnostic is only returned by the admin-only checkout action.
// Authentication errors can include a partial API key; never return those messages.
export function describeStripeCheckoutError(error: unknown): string {
  if (error instanceof StripeConfigurationError) return error.message;
  if (!(error instanceof Stripe.errors.StripeError)) {
    return "Checkout could not start. Please try again. If it keeps failing, check the Render service logs.";
  }
  const reference = error.requestId && /^req_[A-Za-z0-9]+$/.test(error.requestId)
    ? ` Stripe request: ${error.requestId}.` : "";
  switch (error.type) {
    case "StripeAuthenticationError":
      return "Stripe rejected the API key. In Render, replace STRIPE_SECRET_KEY with the full active secret key from your Stripe sandbox, then save and deploy. Use the secret key, not the publishable key." + reference;
    case "StripePermissionError":
      return "This Stripe key does not have permission to create Checkout Sessions. Update its permissions in Stripe or use your sandbox secret key, then save and deploy in Render." + reference;
    case "StripeConnectionError":
      return "The server could not connect to Stripe. Try again in a moment." + reference;
    case "StripeRateLimitError":
      return "Stripe received too many requests. Wait a moment and try again." + reference;
    case "StripeInvalidRequestError":
      return `Stripe could not create checkout: ${redactSecrets(error.message)}` + reference;
    default:
      return "Stripe is temporarily unable to start checkout. Try again in a moment." + reference;
  }
}
