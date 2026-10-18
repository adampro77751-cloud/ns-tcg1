import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), mode: vi.fn(), checkout: vi.fn(), redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/stripe", () => ({ getStripeMode: mocks.mode, StripeConfigurationError: class extends Error {} }));
vi.mock("@/lib/shop", () => ({ createShopCheckout: mocks.checkout }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { buyBundleAction } from "./actions";

describe("customer access to bundle checkout", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "player", role: "USER" } });
    mocks.mode.mockReturnValue("live");
    mocks.checkout.mockResolvedValue("https://checkout.stripe.com/live");
    mocks.redirect.mockImplementation(() => { throw new Error("redirect"); });
  });
  const form = () => { const data = new FormData(); data.set("productId", "coins-5000"); return data; };

  it("allows a logged-in customer to buy in live mode", async () => {
    await expect(buyBundleAction({ error: null }, form())).rejects.toThrow("redirect");
    expect(mocks.checkout).toHaveBeenCalledWith("player", "coins-5000", "");
    expect(mocks.redirect).toHaveBeenCalledWith("https://checkout.stripe.com/live");
  });

  it("blocks a non-admin from minting items through test payments", async () => {
    mocks.mode.mockReturnValue("test");
    expect((await buyBundleAction({ error: null }, form())).error).toContain("limited to admins");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("requires login before creating any checkout", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(buyBundleAction({ error: null }, form())).rejects.toThrow("redirect");
    expect(mocks.redirect).toHaveBeenCalledWith("/login");
    expect(mocks.checkout).not.toHaveBeenCalled();
  });

  it("does not show infrastructure diagnostics to ordinary customers", async () => {
    mocks.checkout.mockRejectedValue(new Error("private internal details"));
    const result = await buyBundleAction({ error: null }, form());
    expect(result.error).toContain("temporarily unavailable");
    expect(result.error).not.toContain("private");
  });
});
