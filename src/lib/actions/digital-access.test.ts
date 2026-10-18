import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ auth: vi.fn(), findMatch: vi.fn(), ready: vi.fn(), transaction: vi.fn(), enterDraft: vi.fn(), redirect: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("next/navigation", () => ({ redirect: mocks.redirect }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  digitalMatch: { findUnique: mocks.findMatch }, digitalMatchPlayer: { updateMany: mocks.ready }, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/draft", () => ({ enterDraft: mocks.enterDraft, pickCardInDraft: vi.fn(), startDraftMatches: vi.fn(), advanceDraftAfterMatch: vi.fn() }));
import { findDigitalMatchByCodeAction, concedeDigitalMatchAction, readyDigitalMatchAction } from "./digital-match-actions";
import { enterDraftAction } from "./draft-actions";

describe("digital actions for regular players", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "player", role: "USER" } });
    mocks.redirect.mockImplementation((path) => { throw new Error(`redirect:${path}`); });
  });

  it("lets a regular player find an online match by code", async () => {
    mocks.findMatch.mockResolvedValue({ id: "online" });
    const form = new FormData(); form.set("code", "ABC123");
    await expect(findDigitalMatchByCodeAction({ error: null }, form)).rejects.toThrow("redirect:/play/digital/online");
    expect(mocks.findMatch).toHaveBeenCalled();
  });

  it("lets a regular player enter a paid draft through the existing draft service", async () => {
    mocks.enterDraft.mockResolvedValue("pod");
    const form = new FormData(); form.set("setName", "1st Edition");
    await expect(enterDraftAction({ error: null }, form)).rejects.toThrow("redirect:/play/digital/draft/pod");
    expect(mocks.enterDraft).toHaveBeenCalledWith("player", "1st Edition");
  });

  it("does not let a player concede someone else's game", async () => {
    mocks.findMatch.mockResolvedValue({ id: "other", status: "IN_PROGRESS", state: {}, players: [{ userId: "other" }, { userId: "opponent" }] });
    const form = new FormData(); form.set("matchId", "other");
    await expect(concedeDigitalMatchAction(form)).rejects.toThrow("not part of this match");
  });

  it("does not let an outsider ready or start someone else's match", async () => {
    mocks.ready.mockResolvedValue({ count: 0 });
    const form = new FormData(); form.set("matchId", "other");
    await expect(readyDigitalMatchAction(form)).rejects.toThrow("cannot ready");
    expect(mocks.ready).toHaveBeenCalledWith(expect.objectContaining({ where: {
      matchId: "other", userId: "player", match: { status: "READY", mode: "ONLINE" },
    } }));
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("requires login for match lookup", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(findDigitalMatchByCodeAction({ error: null }, new FormData())).rejects.toThrow("logged in");
    expect(mocks.findMatch).not.toHaveBeenCalled();
  });
});
