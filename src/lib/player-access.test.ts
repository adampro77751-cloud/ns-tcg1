import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
import { requirePlayerAction, requirePlayerPage } from "./player-access";
import { requireAdminAction } from "./admin";

describe("public player access", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); });
  });

  it("allows a regular signed-in player into digital pages and actions", async () => {
    const session = { user: { id: "player", role: "USER" } };
    mocks.auth.mockResolvedValue(session);
    expect(await requirePlayerPage()).toBe(session);
    expect(await requirePlayerAction()).toBe(session);
  });

  it("still rejects anonymous play", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(requirePlayerPage()).rejects.toThrow("redirect:/login");
    await expect(requirePlayerAction()).rejects.toThrow("logged in");
  });

  it("does not grant regular players access to admin actions", async () => {
    mocks.auth.mockResolvedValue({ user: { id: "player", role: "USER" } });
    await expect(requireAdminAction()).rejects.toThrow("Unauthorized");
  });
});
