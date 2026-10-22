import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ create: vi.fn(), grant: vi.fn(), signIn: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: { create: mocks.create } } }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn().mockResolvedValue("hashed") } }));
vi.mock("@/auth", () => ({ signIn: mocks.signIn }));
vi.mock("@/lib/starter-deck", () => ({ getStarterDeckGrant: mocks.grant }));
import { signupAction } from "./signup-actions";

function form() {
  const data = new FormData();
  data.set("username", "newplayer"); data.set("email", "new@example.com"); data.set("password", "password123");
  return data;
}
beforeEach(() => vi.resetAllMocks());
it("creates the account, owned cards and saved deck in one atomic write", async () => {
  const copies = [{ cardId: "pen", quantity: 3 }];
  mocks.grant.mockResolvedValue({ ownedCards: { create: copies }, decks: { create: { name: "Starter", formatId: "basic", cards: { create: copies } } } });
  await signupAction({ error: null }, form());
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({
    ownedCards: { create: copies }, decks: { create: { name: "Starter", formatId: "basic", cards: { create: copies } } },
    coinTransactions: expect.objectContaining({ create: expect.objectContaining({ type: "STARTER_GRANT" }) }),
  }) });
  expect(mocks.signIn).toHaveBeenCalled();
});
it("does not create a partial account when starter preparation fails", async () => {
  mocks.grant.mockRejectedValue(new Error("Missing cards"));
  expect((await signupAction({ error: null }, form())).error).toBeTruthy();
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.signIn).not.toHaveBeenCalled();
});
it("does not sign in or grant separately when the account write fails", async () => {
  mocks.grant.mockResolvedValue({});
  mocks.create.mockRejectedValue(new Error("Write failed"));
  expect((await signupAction({ error: null }, form())).error).toBeTruthy();
  expect(mocks.signIn).not.toHaveBeenCalled();
});
