import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), equip: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/card-styles", () => ({ setOwnedArtStyle: mocks.equip }));
import { setCardStyleAction } from "./card-style-actions";
import { GOLDEN_COINS_STYLE } from "../card-style-catalog";

describe("card style ownership", () => {
  beforeEach(() => { vi.resetAllMocks(); mocks.auth.mockResolvedValue({ user: { id: "owner" } }); });
  const form = (equipped: string) => { const data = new FormData(); data.set("equipped", equipped); data.set("userId", "victim"); return data; };

  it("only equips a style already owned by the logged-in player", async () => {
    await setCardStyleAction(form("true"));
    expect(mocks.equip).toHaveBeenCalledWith("owner", GOLDEN_COINS_STYLE.key, true);
  });

  it("cannot unlock a style by submitting an equip request", async () => {
    mocks.equip.mockRejectedValue(new Error("You have not unlocked this art style."));
    await expect(setCardStyleAction(form("true"))).rejects.toThrow("not unlocked");
  });

  it("rejects unauthenticated requests before any update", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(setCardStyleAction(form("true"))).rejects.toThrow("logged in");
    expect(mocks.equip).not.toHaveBeenCalled();
  });

  it("passes an explicitly selected Halloween Sprite style through ownership validation", async () => {
    const data = form("false"); data.set("styleKey", "devil-sprite-halloween-2026");
    await setCardStyleAction(data);
    expect(mocks.equip).toHaveBeenCalledWith("owner", "devil-sprite-halloween-2026", false);
  });

  it("rejects invalid equipment values", async () => {
    await expect(setCardStyleAction(form("yes"))).rejects.toThrow("Choose a card style");
    expect(mocks.equip).not.toHaveBeenCalled();
  });
});
