import { describe, expect, it } from "vitest";
import Stripe from "stripe";
import { describeStripeCheckoutError } from "./stripe-errors";

describe("admin Stripe checkout diagnostics", () => {
  it("explains authentication failures without exposing even a partial key", () => {
    const error = new Stripe.errors.StripeAuthenticationError({ message: "Invalid API Key provided: sk_test_secret_example" });
    const result = describeStripeCheckoutError(error);
    expect(result).toContain("Stripe rejected the API key");
    expect(result).not.toContain("sk_test_");
  });

  it("distinguishes permissions and connection problems from key failures", () => {
    expect(describeStripeCheckoutError(new Stripe.errors.StripePermissionError({ message: "Forbidden" }))).toContain("permission");
    expect(describeStripeCheckoutError(new Stripe.errors.StripeConnectionError({ message: "Network" }))).toContain("connect to Stripe");
  });

  it("reports request errors and a Stripe log reference with credentials redacted", () => {
    const error = new Stripe.errors.StripeInvalidRequestError({
      message: "Unknown parameter: example. sk_test_hidden rk_test_hidden pk_test_hidden whsec_hidden",
      requestId: "req_example123",
    });
    const result = describeStripeCheckoutError(error);
    expect(result).toContain("Unknown parameter: example");
    expect(result).toContain("req_example123");
    expect(result).not.toMatch(/sk_test_|rk_test_|pk_test_|whsec_/);
  });

  it("does not expose unrecognized exceptions", () => {
    expect(describeStripeCheckoutError(new Error("private database details"))).not.toContain("private database");
  });
});
