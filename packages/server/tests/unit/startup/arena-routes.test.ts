import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { World } from "@hyperscape/shared";
import { ArenaService } from "../../../src/arena/ArenaService";
import { registerArenaRoutes } from "../../../src/startup/routes/arena-routes";

describe("arena external bet routes", () => {
  const originalWriteKey = process.env.ARENA_EXTERNAL_BET_WRITE_KEY;

  afterEach(() => {
    if (originalWriteKey === undefined) {
      delete process.env.ARENA_EXTERNAL_BET_WRITE_KEY;
    } else {
      process.env.ARENA_EXTERNAL_BET_WRITE_KEY = originalWriteKey;
    }
    vi.restoreAllMocks();
  });

  it("accepts native BNB tracking payloads for the external bet endpoint", async () => {
    process.env.ARENA_EXTERNAL_BET_WRITE_KEY = "test-write-key";

    const arena = {
      init: vi.fn(),
      hydrateRecentRounds: vi.fn().mockResolvedValue(undefined),
      recordExternalBet: vi.fn().mockResolvedValue("bet_ext_123"),
    };
    vi.spyOn(ArenaService, "forWorld").mockReturnValue(arena as never);

    const fastify = Fastify();
    registerArenaRoutes(fastify, {} as World);

    const response = await fastify.inject({
      method: "POST",
      url: "/api/arena/bet/record-external",
      headers: {
        "x-arena-write-key": "test-write-key",
      },
      payload: {
        bettorWallet: "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        chain: "BSC",
        sourceAsset: "BNB",
        sourceAmount: "3",
        goldAmount: "3",
        txSignature: "0xtracked",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(arena.recordExternalBet).toHaveBeenCalledWith(
      expect.objectContaining({
        chain: "BSC",
        sourceAsset: "BNB",
        goldAmount: "3",
      }),
    );

    await fastify.close();
  });
});
