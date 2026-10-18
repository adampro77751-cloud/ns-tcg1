import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { getStripe, getStripeAppOrigin, verifyStripeWebhook } from "./stripe";

// Deliberately fake credentials. Signature checks run locally without API requests.
const secret = "whsec_local_unit_test";
const client = new Stripe("sk_test_local_unit_test");

describe("Stripe test-mode setup", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_unit_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts test keys and rejects missing or live credentials without revealing them", () => {
    expect(getStripe()).toBeInstanceOf(Stripe);
    for (const value of ["", "pk_test_fake", "sk_live_fake"]) {
      vi.stubEnv("STRIPE_SECRET_KEY", value);
      expect(getStripe).toThrow("test-mode secret or restricted key");
    }
  });

  it("uses the configured origin or Render URL and supports local development", () => {
    vi.stubEnv("RENDER_EXTERNAL_URL", "https://example.onrender.com");
    expect(getStripeAppOrigin()).toBe("https://example.onrender.com");
    vi.stubEnv("APP_URL", "http://localhost:3000/path");
    expect(getStripeAppOrigin()).toBe("http://localhost:3000");
  });

  it("rejects missing, malformed, insecure and credential-bearing URLs", () => {
    for (const value of ["", "invalid", "http://example.com", "https://user:password@example.com", "ftp://localhost"]) {
      vi.stubEnv("APP_URL", value);
      expect(getStripeAppOrigin).toThrow();
    }
  });

  it("verifies authentic signatures and rejects modified or unsigned payloads", () => {
    const payload = JSON.stringify({ id: "evt_test", type: "checkout.session.completed", livemode: false });
    const signature = client.webhooks.generateTestHeaderString({ payload, secret });
    expect(verifyStripeWebhook(payload, signature).id).toBe("evt_test");
    expect(() => verifyStripeWebhook(payload + " ", signature)).toThrow();
    expect(() => verifyStripeWebhook(payload, null)).toThrow("Missing");
    const wrong = client.webhooks.generateTestHeaderString({ payload, secret: "whsec_wrong" });
    expect(() => verifyStripeWebhook(payload, wrong)).toThrow();
  });

  it("rejects signed live-mode events", () => {
    const payload = JSON.stringify({ id: "evt_live", livemode: true });
    const signature = client.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => verifyStripeWebhook(payload, signature)).toThrow("Live Stripe events are disabled");
  });
});
