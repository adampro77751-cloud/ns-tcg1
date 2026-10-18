import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ verify: vi.fn(), fulfill: vi.fn() }));
vi.mock("@/lib/stripe", () => ({ verifyStripeWebhook: mocks.verify, StripeConfigurationError: class extends Error {} }));
vi.mock("@/lib/shop", () => ({ fulfillShopCheckout: mocks.fulfill }));
import { POST } from "./route";

describe("Stripe purchase webhook", () => {
  beforeEach(() => vi.resetAllMocks());
  const request = () => new Request("https://example.com/api/stripe/webhook", {
    method: "POST", headers: { "stripe-signature": "signature" }, body: '{ "raw": true }',
  });

  it("preserves the raw body and passes verified successful sessions to fulfillment", async () => {
    mocks.verify.mockReturnValue({ type: "checkout.session.completed", data: { object: { id: "cs_test_purchase" } } });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.verify).toHaveBeenCalledWith('{ "raw": true }', "signature");
    expect(mocks.fulfill).toHaveBeenCalledWith("cs_test_purchase");
  });

  it("rejects unsigned or forged events without granting items", async () => {
    mocks.verify.mockImplementation(() => { throw new Error("bad signature"); });
    expect((await POST(request())).status).toBe(400);
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });

  it("asks Stripe to retry when fulfillment fails", async () => {
    mocks.verify.mockReturnValue({ type: "checkout.session.async_payment_succeeded", data: { object: { id: "cs_test_purchase" } } });
    mocks.fulfill.mockRejectedValue(new Error("database unavailable"));
    expect((await POST(request())).status).toBe(500);
  });

  it("ignores unrelated Stripe events", async () => {
    mocks.verify.mockReturnValue({ type: "payment_intent.created" });
    expect((await POST(request())).status).toBe(200);
    expect(mocks.fulfill).not.toHaveBeenCalled();
  });
});
