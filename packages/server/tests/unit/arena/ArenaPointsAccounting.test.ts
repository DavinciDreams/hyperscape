import type { SQL } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { ArenaContext } from "../../../src/arena/ArenaContext";
import { ArenaPointsService } from "../../../src/arena/services/ArenaPointsService";
import { ArenaWalletService } from "../../../src/arena/services/ArenaWalletService";
import { parseDecimalToBaseUnits } from "../../../src/arena/amounts";
import * as schema from "../../../src/database/schema";

type CapturedInsert = {
  table: unknown;
  values: Record<string, unknown>;
};

function createArenaContext(db: unknown): ArenaContext {
  return {
    getDb: () => db,
    logDbWriteError: vi.fn(),
    logTableMissingError: vi.fn(),
    solanaOperator: null,
  } as unknown as ArenaContext;
}

function createSelectChain(rows: Array<Record<string, unknown>>) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(rows),
    }),
  };
}

function createPendingBonusSelectChain(rows: Array<Record<string, unknown>>) {
  return {
    from: vi.fn().mockReturnValue({
      where: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(rows),
      }),
    }),
  };
}

function createAwardPointsDb(capturedInserts: CapturedInsert[]) {
  const insert = vi.fn((table: unknown) => ({
    values: (values: Record<string, unknown>) => {
      capturedInserts.push({ table, values });
      return {
        onConflictDoNothing: vi.fn().mockResolvedValue([]),
      };
    },
  }));

  const update = vi.fn().mockReturnValue({
    set: vi.fn().mockReturnValue({
      where: vi.fn().mockResolvedValue(undefined),
    }),
  });

  return {
    transaction: vi.fn(
      async (
        callback: (tx: {
          insert: typeof insert;
          update: typeof update;
        }) => Promise<void>,
      ) => callback({ insert, update }),
    ),
    select: vi.fn().mockImplementation(() => createPendingBonusSelectChain([])),
    update,
  };
}

describe("Arena points accounting", () => {
  it("records referral bet credit as a fixed 1x award", async () => {
    const capturedInserts: CapturedInsert[] = [];
    const db = createAwardPointsDb(capturedInserts);
    const stakingOps = {
      fetchGoldPositionForWallet: vi.fn().mockResolvedValue({
        liquidGoldBalance: 1_200_000,
        stakedGoldBalance: 0,
        goldBalance: 1_200_000,
        liquidGoldHoldDays: 14,
        stakedGoldHoldDays: 0,
        goldHoldDays: 14,
        stakingSource: "PRIMARY",
      }),
      accrueStakingPointsIfDue: vi.fn().mockResolvedValue(undefined),
      computeGoldMultiplier: vi.fn().mockReturnValue(4),
    };
    const walletOps = {
      listLinkedWallets: vi.fn().mockResolvedValue([]),
      listIdentityWallets: vi.fn().mockResolvedValue([]),
      findReferralMappingForWalletNetwork: vi.fn().mockResolvedValue(null),
    };
    const evmInspector = {
      isEnabled: vi.fn().mockReturnValue(false),
      inspectMarketBetTransaction: vi.fn(),
    };

    const service = new ArenaPointsService(
      createArenaContext(db),
      stakingOps,
      walletOps,
      evmInspector as never,
    );

    await service.awardPoints({
      wallet: "bettor_wallet",
      roundId: "round_1",
      roundSeedHex: null,
      betId: "bet_1",
      sourceAsset: "GOLD",
      goldAmount: "2000",
      txSignature: null,
      side: "A",
      verifiedForPoints: true,
      referral: {
        inviteCode: "DUELSYNC11",
        inviterWallet: "inviter_wallet",
      },
    });

    const selfPointsRow = capturedInserts.find(
      (entry) => entry.table === schema.arenaPoints,
    )?.values;
    const referralPointsRow = capturedInserts.find(
      (entry) => entry.table === schema.arenaReferralPoints,
    )?.values;
    const referralLedgerRow = capturedInserts.find(
      (entry) =>
        entry.table === schema.arenaPointLedger &&
        entry.values.eventType === "REFERRAL_BET",
    )?.values;

    expect(selfPointsRow).toMatchObject({
      basePoints: 2,
      multiplier: 4,
      totalPoints: 8,
    });
    expect(referralPointsRow).toMatchObject({
      basePoints: 2,
      multiplier: 1,
      totalPoints: 2,
    });
    expect(referralLedgerRow).toMatchObject({
      basePoints: 2,
      multiplier: 1,
      totalPoints: 2,
    });
    expect(stakingOps.fetchGoldPositionForWallet).toHaveBeenCalledTimes(1);
  });

  it("awards BSC external points when the verified EVM wager amount matches", async () => {
    const capturedInserts: CapturedInsert[] = [];
    const db = createAwardPointsDb(capturedInserts);
    const stakingOps = {
      fetchGoldPositionForWallet: vi.fn().mockResolvedValue({
        liquidGoldBalance: 150_000,
        stakedGoldBalance: 0,
        goldBalance: 150_000,
        liquidGoldHoldDays: 12,
        stakedGoldHoldDays: 0,
        goldHoldDays: 12,
        stakingSource: "PRIMARY",
      }),
      accrueStakingPointsIfDue: vi.fn().mockResolvedValue(undefined),
      computeGoldMultiplier: vi.fn().mockReturnValue(3),
    };
    const walletOps = {
      listLinkedWallets: vi.fn().mockResolvedValue([]),
      listIdentityWallets: vi.fn().mockResolvedValue([]),
      findReferralMappingForWalletNetwork: vi.fn().mockResolvedValue(null),
    };
    const evmInspector = {
      isEnabled: vi.fn().mockReturnValue(true),
      inspectMarketBetTransaction: vi.fn().mockResolvedValue({
        fromWallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        amountBaseUnits: parseDecimalToBaseUnits("3", 18),
        amountGold: "3",
      }),
    };

    const service = new ArenaPointsService(
      createArenaContext(db),
      stakingOps,
      walletOps,
      evmInspector as never,
    );

    await service.awardPoints({
      wallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      roundId: null,
      roundSeedHex: null,
      betId: "bet_ext_bsc_1",
      sourceAsset: "BNB",
      goldAmount: "3",
      txSignature: "0xverifiedbet",
      side: "A",
      verifiedForPoints: false,
      chain: "BSC",
      referral: null,
    });

    expect(evmInspector.inspectMarketBetTransaction).toHaveBeenCalledWith(
      "0xverifiedbet",
      "BSC",
      "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    );
    expect(
      capturedInserts.find((entry) => entry.table === schema.arenaPoints),
    ).toMatchObject({
      values: expect.objectContaining({
        betId: "bet_ext_bsc_1",
        basePoints: 1,
        multiplier: 3,
        totalPoints: 3,
      }),
    });
  });

  it("rejects BSC external points when the verified EVM wager amount differs", async () => {
    const capturedInserts: CapturedInsert[] = [];
    const db = createAwardPointsDb(capturedInserts);
    const stakingOps = {
      fetchGoldPositionForWallet: vi.fn(),
      accrueStakingPointsIfDue: vi.fn(),
      computeGoldMultiplier: vi.fn(),
    };
    const walletOps = {
      listLinkedWallets: vi.fn().mockResolvedValue([]),
      listIdentityWallets: vi.fn().mockResolvedValue([]),
      findReferralMappingForWalletNetwork: vi.fn().mockResolvedValue(null),
    };
    const evmInspector = {
      isEnabled: vi.fn().mockReturnValue(true),
      inspectMarketBetTransaction: vi.fn().mockResolvedValue({
        fromWallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
        amountBaseUnits: parseDecimalToBaseUnits("2.5", 18),
        amountGold: "2.5",
      }),
    };

    const service = new ArenaPointsService(
      createArenaContext(db),
      stakingOps,
      walletOps,
      evmInspector as never,
    );

    await service.awardPoints({
      wallet: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      roundId: null,
      roundSeedHex: null,
      betId: "bet_ext_bsc_mismatch",
      sourceAsset: "BNB",
      goldAmount: "3",
      txSignature: "0xmismatchbet",
      side: "A",
      verifiedForPoints: false,
      chain: "BSC",
      referral: null,
    });

    expect(capturedInserts).toHaveLength(0);
    expect(stakingOps.fetchGoldPositionForWallet).not.toHaveBeenCalled();
  });

  it("includes referral win bonuses in referral totals", async () => {
    const select = vi
      .fn()
      .mockReturnValueOnce(createSelectChain([{ totalPoints: 100 }]))
      .mockReturnValueOnce(createSelectChain([{ totalPoints: 25 }]))
      .mockReturnValueOnce(createSelectChain([{ count: 3 }]))
      .mockReturnValueOnce(createSelectChain([{ totalPoints: 40 }]))
      .mockReturnValueOnce(createSelectChain([{ totalPoints: 15 }]))
      .mockReturnValueOnce(createSelectChain([{ totalPoints: 5 }]));
    const db = {
      select,
    };
    const stakingOps = {
      fetchGoldPositionForWallet: vi.fn().mockResolvedValue({
        liquidGoldBalance: 1_500,
        stakedGoldBalance: 0,
        goldBalance: 1_500,
        liquidGoldHoldDays: 3,
        stakedGoldHoldDays: 0,
        goldHoldDays: 3,
        stakingSource: "PRIMARY",
      }),
      accrueStakingPointsIfDue: vi.fn().mockResolvedValue(undefined),
      computeGoldMultiplier: vi.fn().mockReturnValue(1),
    };
    const walletOps = {
      listLinkedWallets: vi.fn().mockResolvedValue([]),
      listIdentityWallets: vi.fn().mockResolvedValue([]),
      findReferralMappingForWalletNetwork: vi.fn().mockResolvedValue(null),
    };
    const evmInspector = {
      isEnabled: vi.fn().mockReturnValue(false),
      inspectMarketBetTransaction: vi.fn(),
    };

    const service = new ArenaPointsService(
      createArenaContext(db),
      stakingOps,
      walletOps,
      evmInspector as never,
    );

    const points = await service.getWalletPoints("bettor_wallet", {
      scope: "wallet",
    });

    expect(points.totalPoints).toBe(185);
    expect(points.winPoints).toBe(15);
    expect(points.referralPoints).toBe(30);
    expect(select).toHaveBeenCalledTimes(6);
  });

  it("applies leaderboard offsets and time windows without double counting signup ledger rows", async () => {
    let capturedQuery: SQL | null = null;
    const db = {
      execute: vi.fn(async (query: SQL) => {
        capturedQuery = query;
        return { rows: [] };
      }),
    };
    const stakingOps = {
      fetchGoldPositionForWallet: vi.fn(),
      accrueStakingPointsIfDue: vi.fn(),
      computeGoldMultiplier: vi.fn(),
    };
    const walletOps = {
      listLinkedWallets: vi.fn(),
      listIdentityWallets: vi.fn(),
      findReferralMappingForWalletNetwork: vi.fn(),
    };
    const evmInspector = {
      isEnabled: vi.fn().mockReturnValue(false),
      inspectMarketBetTransaction: vi.fn(),
    };

    const service = new ArenaPointsService(
      createArenaContext(db),
      stakingOps,
      walletOps,
      evmInspector as never,
    );

    await service.getPointsLeaderboard(10, {
      scope: "wallet",
      offset: 20,
      timeWindow: "weekly",
    });

    expect(capturedQuery).not.toBeNull();
    const builtQuery = new PgDialect().sqlToQuery(capturedQuery as SQL);

    expect(builtQuery.sql).toContain("OFFSET");
    expect(builtQuery.sql).toContain('"createdAt" >= ');
    expect(builtQuery.sql).toContain("'REFERRAL_WIN'");
    expect(builtQuery.sql).not.toContain("'SIGNUP_REFERRER'");
    expect(builtQuery.sql).not.toContain("'SIGNUP_REFEREE'");
    expect(builtQuery.params).toContain(10);
    expect(builtQuery.params).toContain(20);
  });

  it("keeps signup bonus rows out of rank SQL to avoid double counting", async () => {
    let capturedQuery: SQL | null = null;
    const db = {
      execute: vi.fn(async (query: SQL) => {
        capturedQuery = query;
        return {
          rows: [{ wallet: "bettor_wallet", total_points: "120", rank: "3" }],
        };
      }),
    };
    const stakingOps = {
      fetchGoldPositionForWallet: vi.fn(),
      accrueStakingPointsIfDue: vi.fn(),
      computeGoldMultiplier: vi.fn(),
    };
    const walletOps = {
      listLinkedWallets: vi.fn(),
      listIdentityWallets: vi.fn(),
      findReferralMappingForWalletNetwork: vi.fn(),
    };
    const evmInspector = {
      isEnabled: vi.fn().mockReturnValue(false),
      inspectMarketBetTransaction: vi.fn(),
    };

    const service = new ArenaPointsService(
      createArenaContext(db),
      stakingOps,
      walletOps,
      evmInspector as never,
    );

    const rank = await service.getWalletRank("bettor_wallet");

    expect(rank).toEqual({
      wallet: "bettor_wallet",
      rank: 3,
      totalPoints: 120,
    });

    expect(capturedQuery).not.toBeNull();
    const builtQuery = new PgDialect().sqlToQuery(capturedQuery as SQL);
    expect(builtQuery.sql).toContain("'REFERRAL_WIN'");
    expect(builtQuery.sql).not.toContain("'SIGNUP_REFERRER'");
    expect(builtQuery.sql).not.toContain("'SIGNUP_REFEREE'");
  });
});

describe("Arena wallet linking", () => {
  it("does not re-award the wallet-link bonus when the merged identity already has one", async () => {
    const db = {
      query: {
        arenaWalletLinks: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
      },
      insert: vi.fn().mockReturnValue({
        values: vi.fn().mockReturnValue({
          onConflictDoNothing: vi.fn().mockReturnValue({
            returning: vi.fn().mockResolvedValue([{ id: 1 }]),
          }),
        }),
      }),
    };
    const awardFlatPoints = vi.fn().mockResolvedValue(undefined);
    const service = new ArenaWalletService(
      createArenaContext(db),
      awardFlatPoints,
      vi.fn().mockResolvedValue(undefined),
      vi.fn().mockResolvedValue(undefined),
    );

    const referralSpy = vi
      .spyOn(service, "findReferralMappingForWalletNetwork")
      .mockResolvedValue(null);
    const identitySpy = vi
      .spyOn(service, "listIdentityWallets")
      .mockResolvedValue([
        "0x1111111111111111111111111111111111111111",
        "So11111111111111111111111111111111111111112",
      ]);
    const existingBonusSpy = vi
      .spyOn(service, "hasWalletLinkBonusInIdentity")
      .mockResolvedValue(true);

    const result = await service.linkWallets({
      wallet: "0x1111111111111111111111111111111111111111",
      walletPlatform: "BASE",
      linkedWallet: "So11111111111111111111111111111111111111112",
      linkedWalletPlatform: "SOLANA",
    });

    expect(result.awardedPoints).toBe(0);
    expect(awardFlatPoints).not.toHaveBeenCalled();
    expect(referralSpy).toHaveBeenCalledTimes(2);
    expect(identitySpy).toHaveBeenCalledWith(
      "0x1111111111111111111111111111111111111111",
    );
    expect(existingBonusSpy).toHaveBeenCalledWith(
      expect.arrayContaining([
        "0x1111111111111111111111111111111111111111",
        "So11111111111111111111111111111111111111112",
      ]),
    );
  });
});
