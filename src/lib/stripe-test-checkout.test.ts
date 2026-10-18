import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ create: vi.fn(), retrieve: vi.fn() }));
vi.mock("./stripe", () => ({
  getStripe: () => ({ checkout: { sessions: mocks } }),
  getStripeAppOrigin: () => "https://example.com",
}));
import { createTestCheckout, getTestCheckoutStatus } from "./stripe-test-checkout";

describe("Stripe trial checkout", () => {
  beforeEach(() => vi.resetAllMocks());

  it("creates a fixed £1 payment bound to the logged-in user", async () => {
    mocks.create.mockResolvedValue({ livemode: false, url: "https://checkout.stripe.com/test" });
    expect(await createTestCheckout("player")).toBe("https://checkout.stripe.com/test");
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment", client_reference_id: "player",
      metadata: { purpose: "ns-tcg-test-checkout" },
      line_items: [expect.objectContaining({ quantity: 1, price_data: expect.objectContaining({ currency: "gbp", unit_amount: 100 }) })],
      success_url: "https://example.com/store/stripe-test?session_id={CHECKOUT_SESSION_ID}",
      cancel_url: "https://example.com/store/stripe-test?cancelled=1",
    }));
    expect(mocks.create.mock.calls[0][0]).not.toHaveProperty("allowed_payment_method_types");
  });

  it.each([{ livemode: true, url: "https://checkout.stripe.com/live" }, { livemode: false, url: null }])("refuses unusable checkout sessions", async (session) => {
    mocks.create.mockResolvedValue(session);
    await expect(createTestCheckout("player")).rejects.toThrow();
  });

  const paid = { livemode: false, client_reference_id: "player", metadata: { purpose: "ns-tcg-test-checkout" },
    mode: "payment", currency: "gbp", amount_total: 100, status: "complete", payment_status: "paid" };

  it("confirms paid status by retrieving the session from Stripe", async () => {
    mocks.retrieve.mockResolvedValue(paid);
    expect(await getTestCheckoutStatus("player", "cs_test_trial")).toBe("paid");
    expect(mocks.retrieve).toHaveBeenCalledWith("cs_test_trial");
  });

  it.each([{ payment_status: "unpaid" }, { status: "open" }])("never reports an incomplete payment as paid", async (changes) => {
    mocks.retrieve.mockResolvedValue({ ...paid, ...changes });
    expect(await getTestCheckoutStatus("player", "cs_test_trial")).toBe("pending");
  });

  it.each([{ client_reference_id: "other" }, { livemode: true }, { metadata: {} }, { amount_total: 200 }, { currency: "usd" }])("rejects another user's payment or an unrelated session", async (changes) => {
    mocks.retrieve.mockResolvedValue({ ...paid, ...changes });
    await expect(getTestCheckoutStatus("player", "cs_test_trial")).rejects.toThrow("not found");
  });

  it("rejects live or malformed IDs before calling Stripe", async () => {
    await expect(getTestCheckoutStatus("player", "cs_live_trial")).rejects.toThrow("Invalid");
    expect(mocks.retrieve).not.toHaveBeenCalled();
  });
});
