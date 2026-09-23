import { describe, expect, it } from "vitest";
import { getDigitalMatchWinReward } from "./match-rewards";
import { MATCH_WIN_REWARD } from "./economy-constants";

describe("getDigitalMatchWinReward", () => {
  it("currently pays the same reward for PvP and Bot match wins", () => {
    expect(getDigitalMatchWinReward("ONLINE")).toBe(MATCH_WIN_REWARD);
    expect(getDigitalMatchWinReward("BOT")).toBe(MATCH_WIN_REWARD);
  });

  it("is a single tunable knob per mode — Bot rewards can change independently later without touching PvP", () => {
    // Documents the current constant, not a promise it'll always match —
    // see match-rewards.ts's comment on why BOT is split out separately.
    expect(MATCH_WIN_REWARD).toBe(50);
  });
});
