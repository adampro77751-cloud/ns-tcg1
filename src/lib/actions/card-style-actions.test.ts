import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), update: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { userCardStyle: { updateMany: mocks.update } } }));
import { setCardStyleAction } from "./card-style-actions";
import { GOLDEN_COINS_STYLE } from "../card-style-catalog";

describe("card style ownership", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "owner" } }); });
  const form = (equipped: string) => { const data = new FormData(); data.set("equipped", equipped); data.set("userId", "victim"); return data; };

  it("only equips a style already owned by the logged-in player", async () => {
    mocks.update.mockResolvedValue({ count: 1 });
    await setCardStyleAction(form("true"));
    expect(mocks.update).toHaveBeenCalledWith({ where: { userId: "owner", styleKey: GOLDEN_COINS_STYLE.key }, data: { equipped: true } });
  });

  it("cannot unlock a style by submitting an equip request", async () => {
    mocks.update.mockResolvedValue({ count: 0 });
    await expect(setCardStyleAction(form("true"))).rejects.toThrow("not unlocked");
  });

  it("rejects unauthenticated requests before any update", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(setCardStyleAction(form("true"))).rejects.toThrow("logged in");
    expect(mocks.update).not.toHaveBeenCalled();
  });
});
