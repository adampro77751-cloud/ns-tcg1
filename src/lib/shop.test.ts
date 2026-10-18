import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  createSession: vi.fn(), retrieve: vi.fn(), createPurchase: vi.fn(), updatePurchase: vi.fn(), findPurchase: vi.fn(),
  claim: vi.fn(), packs: vi.fn(), credit: vi.fn(), transaction: vi.fn(), cards: vi.fn(),
}));
vi.mock("./prisma", () => ({ prisma: {
  shopPurchase: { create: mocks.createPurchase, update: mocks.updatePurchase, findUnique: mocks.findPurchase },
  card: { findMany: mocks.cards }, $transaction: mocks.transaction,
} }));
vi.mock("./stripe", () => ({ getStripe: () => ({ checkout: { sessions: { create: mocks.createSession, retrieve: mocks.retrieve } } }),
  getStripeAppOrigin: () => "https://example.com" }));
vi.mock("./coins", () => ({ creditCoins: mocks.credit }));
import { createShopCheckout, fulfillShopCheckout } from "./shop";
import { SHOP_PRODUCTS, getShopProduct, PHYSICAL_SALES_ENABLED, PHYSICAL_MINIMUM_PENCE } from "./shop-products";

const purchase = { id: "purchase", userId: "player", stripeSessionId: "cs_test_purchase", productId: "coins-5000",
  productName: "5,000 Coins", amountPence: 100, coins: 5000, packs: 0, packKind: "NORMAL", setName: null };
const paid = { id: "cs_test_purchase", livemode: false, mode: "payment", client_reference_id: "player",
  metadata: { purpose: "ns-tcg-shop", purchaseId: "purchase" }, currency: "gbp", amount_total: 100,
  line_items: { data: [{ quantity: 1, amount_total: 100 }] }, status: "complete", payment_status: "paid" };

describe("shop purchases", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.createPurchase.mockResolvedValue(purchase);
    mocks.createSession.mockResolvedValue({ id: paid.id, livemode: false, url: "https://checkout.stripe.com/test" });
    mocks.findPurchase.mockResolvedValue(purchase);
    mocks.retrieve.mockResolvedValue(paid);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.transaction.mockImplementation((callback) => callback({ shopPurchase: { updateMany: mocks.claim }, earnedPack: { createMany: mocks.packs } }));
  });

  it("uses exactly the requested eight bundles and GBP prices; physical packs cannot be bought", () => {
    expect(SHOP_PRODUCTS.map((p) => [p.id, p.pricePence])).toEqual([
      ["normal-6", 100], ["normal-12", 175], ["normal-24", 325], ["shiny-6", 200],
      ["coins-5000", 100], ["coins-10000", 200], ["coins-20000", 375], ["coins-50000", 450],
    ]);
    expect(PHYSICAL_SALES_ENABLED).toBe(false);
    expect(PHYSICAL_MINIMUM_PENCE).toBe(150);
    expect(() => getShopProduct("physical-normal")).toThrow();
  });

  it("creates a checkout with server prices, account ownership and Managed Payments disabled", async () => {
    await createShopCheckout("player", "coins-5000", "");
    expect(mocks.createPurchase).toHaveBeenCalledWith({ data: expect.objectContaining({ userId: "player", amountPence: 100, coins: 5000 }) });
    expect(mocks.createSession).toHaveBeenCalledWith(expect.objectContaining({
      mode: "payment", managed_payments: { enabled: false }, client_reference_id: "player",
      line_items: [expect.objectContaining({ quantity: 1, price_data: expect.objectContaining({ currency: "gbp", unit_amount: 100 }) })],
    }), { idempotencyKey: "shop-purchase" });
    expect(mocks.credit).not.toHaveBeenCalled();
  });

  it("refuses packs from an unavailable set before opening checkout", async () => {
    mocks.cards.mockResolvedValue([]);
    await expect(createShopCheckout("player", "normal-6", "Missing")).rejects.toThrow("not available");
    expect(mocks.createSession).not.toHaveBeenCalled();
  });

  it("grants a paid coin purchase only once, even when fulfillment is retried", async () => {
    mocks.claim.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 });
    expect((await fulfillShopCheckout(paid.id, "player"))?.fulfilled).toBe(true);
    expect((await fulfillShopCheckout(paid.id, "player"))?.fulfilled).toBe(true);
    expect(mocks.credit).toHaveBeenCalledTimes(1);
    expect(mocks.credit).toHaveBeenCalledWith(expect.anything(), "player", 5000, "STRIPE_PURCHASE", expect.anything());
  });

  it("recovers a paid session if its ID was not saved before the server restarted", async () => {
    mocks.findPurchase.mockResolvedValueOnce(null).mockResolvedValueOnce({ ...purchase, stripeSessionId: null });
    expect((await fulfillShopCheckout(paid.id))?.fulfilled).toBe(true);
    expect(mocks.findPurchase).toHaveBeenLastCalledWith({ where: { id: "purchase" } });
    expect(mocks.claim).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ stripeSessionId: paid.id }) }));
    expect(mocks.credit).toHaveBeenCalledTimes(1);
  });

  it("saves paid shiny packs to the correct user's unopened packs", async () => {
    mocks.findPurchase.mockResolvedValue({ ...purchase, packs: 6, coins: 0, packKind: "SHINY", setName: "1st Edition", amountPence: 200 });
    mocks.retrieve.mockResolvedValue({ ...paid, amount_total: 200, line_items: { data: [{ quantity: 1, amount_total: 200 }] } });
    await fulfillShopCheckout(paid.id);
    expect(mocks.packs.mock.calls[0][0].data).toHaveLength(6);
    expect(mocks.packs.mock.calls[0][0].data[0]).toEqual({ userId: "player", purchaseId: "purchase", number: 0, setName: "1st Edition", packKind: "SHINY" });
    expect(mocks.credit).not.toHaveBeenCalled();
  });

  it("does not grant an unpaid purchase", async () => {
    mocks.retrieve.mockResolvedValue({ ...paid, payment_status: "unpaid" });
    expect((await fulfillShopCheckout(paid.id))?.fulfilled).toBe(false);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it.each([{ amount_total: 1 }, { currency: "usd" }, { livemode: true }, { client_reference_id: "other" },
    { metadata: { purpose: "ns-tcg-shop", purchaseId: "other" } }, { line_items: { data: [] } }])("rejects mismatched payment data", async (changes) => {
    mocks.retrieve.mockResolvedValue({ ...paid, ...changes });
    await expect(fulfillShopCheckout(paid.id)).rejects.toThrow("does not match");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not reveal or fulfill another user's purchase from the return page", async () => {
    await expect(fulfillShopCheckout(paid.id, "other")).rejects.toThrow("not found");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("ignores the standalone test checkout because it has no purchased entitlement", async () => {
    mocks.retrieve.mockResolvedValue({ ...paid, metadata: { purpose: "ns-tcg-test-checkout" } });
    expect(await fulfillShopCheckout(paid.id)).toBeNull();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
