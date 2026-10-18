import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Stripe from "stripe";
import { getStripe, getStripeMode, getShopPaymentMode, getStripeAppOrigin, verifyStripeWebhook } from "./stripe";

// Deliberately fake credentials. Signature checks run locally without API requests.
const secret = "whsec_local_unit_test";
const client = new Stripe("sk_test_local_unit_test");

describe("Stripe mode configuration", () => {
  beforeEach(() => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_test_local_unit_test");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    vi.stubEnv("APP_URL", "");
    vi.stubEnv("RENDER_EXTERNAL_URL", "");
  });
  afterEach(() => vi.unstubAllEnvs());

  it("accepts secret/restricted keys in both modes and rejects missing or public keys", () => {
    expect(getStripe()).toBeInstanceOf(Stripe);
    for (const mode of ["test", "live"]) for (const prefix of ["sk", "rk"]) {
      vi.stubEnv("STRIPE_SECRET_KEY", `${prefix}_${mode}_local_unit_test`);
      expect(getStripeMode()).toBe(mode);
      expect(getStripe()).toBeInstanceOf(Stripe);
    }
    for (const value of ["", "pk_test_fake", "pk_live_fake"]) {
      vi.stubEnv("STRIPE_SECRET_KEY", value);
      expect(getStripe).toThrow("secret or restricted key");
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

  it("rejects signed live-mode events when configured with a test key", () => {
    const payload = JSON.stringify({ id: "evt_live", livemode: true });
    const signature = client.webhooks.generateTestHeaderString({ payload, secret });
    expect(() => verifyStripeWebhook(payload, signature)).toThrow("mode does not match");
  });

  it("verifies live events only in live mode and rejects test events there", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_local_unit_test");
    for (const live of [true, false]) {
      const payload = JSON.stringify({ id: "evt_check", livemode: live });
      const signature = client.webhooks.generateTestHeaderString({ payload, secret });
      if (live) expect(verifyStripeWebhook(payload, signature).livemode).toBe(true);
      else expect(() => verifyStripeWebhook(payload, signature)).toThrow("mode does not match");
    }
  });

  it("keeps live checkout unavailable until a webhook secret is configured", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "sk_live_local_unit_test");
    vi.stubEnv("APP_URL", "https://example.com");
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "");
    expect(getShopPaymentMode()).toBeNull();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", secret);
    expect(getShopPaymentMode()).toBe("live");
  });
});
