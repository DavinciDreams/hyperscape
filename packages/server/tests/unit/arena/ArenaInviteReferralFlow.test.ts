import { describe, expect, it, vi } from "vitest";
import type { ArenaContext } from "../../../src/arena/ArenaContext";
import { ArenaWalletService } from "../../../src/arena/services/ArenaWalletService";
import { ArenaBettingService } from "../../../src/arena/services/ArenaBettingService";

function createArenaContext(
  db: unknown,
  options?: { maxBetGoldUnits?: bigint },
): ArenaContext {
  return {
    getDb: () => db,
    logDbWriteError: vi.fn(),
    logTableMissingError: vi.fn(),
    config: {
      maxBetGoldUnits: options?.maxBetGoldUnits ?? 0n,
    },
  } as unknown as ArenaContext;
}

function createSelectChain(rows: Array<Record<string, unknown>>) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

describe("Arena invite and referral flows", () => {
  it("rejects invite redemption when the inviter wallet is already in the linked identity", async () => {
    const wallet = "So11111111111111111111111111111111111111112";
    const linkedEvm = "0x1111111111111111111111111111111111111111";
    const db = {
      query: {
        arenaInviteCodes: {
          findFirst: vi.fn().mockResolvedValue({
            code: "DUELSELFID1",
            inviterWallet: linkedEvm,
          }),
        },
        arenaInvitedWallets: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
    };
    const service = new ArenaWalletService(
      createArenaContext(db),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    vi.spyOn(service, "listIdentityWallets").mockResolvedValue([
      wallet,
      linkedEvm,
    ]);

    await expect(
      service.redeemInviteCode({
        wallet,
        inviteCode: "DUELSELFID1",
      }),
    ).rejects.toThrow("own invite code");
  });

  it("filters invite fee totals by requested platform view", async () => {
    let feeSummaryQueryCount = 0;
    const db = {
      query: {
        arenaInviteCodes: {
          findFirst: vi.fn().mockResolvedValue({
            code: "DUELFEE1111",
            inviterWallet: "inviter_wallet",
          }),
        },
        arenaInvitedWallets: {
          findMany: vi
            .fn()
            .mockResolvedValue([
              { invitedWallet: "wallet_a" },
              { invitedWallet: "wallet_b" },
            ]),
        },
      },
      select: vi.fn().mockImplementation((fields: Record<string, unknown>) => {
        if ("inviterFeeGold" in fields) {
          feeSummaryQueryCount += 1;
          return createSelectChain(
            feeSummaryQueryCount === 1
              ? [{ inviterFeeGold: "0.25", treasuryFeeGold: "1.75" }]
              : [{ inviterFeeGold: "0.05", treasuryFeeGold: "0.45" }],
          );
        }
        if ("count" in fields) {
          return createSelectChain([{ count: 2 }]);
        }
        return createSelectChain([{ totalPoints: 12 }]);
      }),
    };
    const service = new ArenaWalletService(
      createArenaContext(db),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    vi.spyOn(service, "findReferralMappingForWalletNetwork").mockResolvedValue(
      null,
    );

    const evmSummary = await service.getInviteSummary("inviter_wallet", "evm");
    const solanaSummary = await service.getInviteSummary(
      "inviter_wallet",
      "solana",
    );

    expect(evmSummary.inviteCode).toBe("DUELFEE1111");
    expect(evmSummary.feeShareFromReferralsGold).toBe("0.25");
    expect(evmSummary.treasuryFeesFromReferredBetsGold).toBe("1.75");
    expect(solanaSummary.feeShareFromReferralsGold).toBe("0.05");
    expect(solanaSummary.treasuryFeesFromReferredBetsGold).toBe("0.45");
    expect(evmSummary.invitedWallets).toEqual(["wallet_a", "wallet_b"]);
    expect(solanaSummary.invitedWallets).toEqual(["wallet_a", "wallet_b"]);
  });

  it("rejects wallet linking when two invite trees conflict", async () => {
    const db = {
      query: {
        arenaWalletLinks: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn(),
    };
    const service = new ArenaWalletService(
      createArenaContext(db),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    vi.spyOn(service, "findReferralMappingForWalletNetwork")
      .mockResolvedValueOnce({
        id: 1,
        inviteCode: "DUELAAAA11",
        inviterWallet: "inviter_a",
        invitedWallet: "0x1111111111111111111111111111111111111111",
        firstBetId: null,
      })
      .mockResolvedValueOnce({
        id: 2,
        inviteCode: "DUELBBBB22",
        inviterWallet: "inviter_b",
        invitedWallet: "So11111111111111111111111111111111111111112",
        firstBetId: null,
      });

    await expect(
      service.linkWallets({
        wallet: "0x1111111111111111111111111111111111111111",
        walletPlatform: "BASE",
        linkedWallet: "So11111111111111111111111111111111111111112",
        linkedWalletPlatform: "SOLANA",
      }),
    ).rejects.toThrow("different invite codes");
    expect(db.insert).not.toHaveBeenCalled();
  });
});

describe("Arena external bet tracking", () => {
  it("rejects external SOLANA tracking when the wallet is not base58", async () => {
    const service = new ArenaBettingService(
      createArenaContext({
        query: {
          arenaFeeShares: { findFirst: vi.fn() },
          arenaPoints: { findFirst: vi.fn() },
        },
      }),
      {} as never,
      {
        awardPoints: vi.fn(),
        recordFeeShare: vi.fn(),
      },
      {
        resolveReferralForWallet: vi.fn(),
      },
    );

    await expect(
      service.recordExternalBet({
        bettorWallet: "0x1111111111111111111111111111111111111111",
        chain: "SOLANA",
        sourceAsset: "GOLD",
        sourceAmount: "5",
        goldAmount: "5",
        feeBps: 100,
        txSignature: "sol_sig_invalid_wallet",
      }),
    ).rejects.toThrow("Solana wallet must be a valid base58 address");
  });

  it("treats identical tx signatures on BASE and BSC as distinct external bet ids", async () => {
    const recordFeeShare = vi.fn().mockResolvedValue(true);
    const service = new ArenaBettingService(
      createArenaContext({
        query: {
          arenaFeeShares: { findFirst: vi.fn().mockResolvedValue(null) },
          arenaPoints: { findFirst: vi.fn().mockResolvedValue(null) },
        },
      }),
      {} as never,
      {
        awardPoints: vi.fn().mockResolvedValue(undefined),
        recordFeeShare,
      },
      {
        resolveReferralForWallet: vi.fn().mockResolvedValue(null),
      },
    );

    const firstId = await service.recordExternalBet({
      bettorWallet: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      chain: "BSC",
      sourceAsset: "GOLD",
      sourceAmount: "3",
      goldAmount: "3",
      feeBps: 100,
      txSignature: "0xdupedsignature",
      skipPoints: true,
    });
    const secondId = await service.recordExternalBet({
      bettorWallet: "0xAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
      chain: "BASE",
      sourceAsset: "GOLD",
      sourceAmount: "3",
      goldAmount: "3",
      feeBps: 100,
      txSignature: "0xdupedsignature",
      skipPoints: true,
    });

    expect(firstId).not.toBe(secondId);
    expect(recordFeeShare).toHaveBeenCalledTimes(2);
    expect(recordFeeShare).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ chain: "BSC" }),
    );
    expect(recordFeeShare).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ chain: "BASE" }),
    );
  });

  it("retries external points on replay when fee share exists but points are missing", async () => {
    const awardPoints = vi.fn().mockResolvedValue(undefined);
    const recordFeeShare = vi.fn().mockResolvedValue(true);
    const resolveReferralForWallet = vi.fn().mockResolvedValue(null);
    const service = new ArenaBettingService(
      createArenaContext({
        query: {
          arenaFeeShares: {
            findFirst: vi.fn().mockResolvedValue({
              id: 1,
              betId: "bet_ext_existing",
              inviteCode: "DUELSYNC11",
              inviterWallet: "inviter_wallet",
            }),
          },
          arenaPoints: {
            findFirst: vi.fn().mockResolvedValue(null),
          },
        },
      }),
      {} as never,
      {
        awardPoints,
        recordFeeShare,
      },
      {
        resolveReferralForWallet,
      },
    );

    await service.recordExternalBet({
      bettorWallet: "So11111111111111111111111111111111111111112",
      chain: "SOLANA",
      sourceAsset: "GOLD",
      sourceAmount: "2.5",
      goldAmount: "2.5",
      feeBps: 100,
      txSignature: "solsamehash",
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(awardPoints).toHaveBeenCalledTimes(1);
    expect(awardPoints).toHaveBeenCalledWith(
      expect.objectContaining({
        verifiedForPoints: false,
        referral: {
          inviteCode: "DUELSYNC11",
          inviterWallet: "inviter_wallet",
        },
      }),
    );
    expect(recordFeeShare).not.toHaveBeenCalled();
    expect(resolveReferralForWallet).not.toHaveBeenCalled();
  });
});
