import { describe, expect, it, vi } from "vitest";
import {
  Keypair,
  SystemProgram,
  type AccountInfo,
  type PublicKey,
} from "@solana/web3.js";
import { SolanaArenaOperator } from "../SolanaArenaOperator.js";
import type { SolanaArenaConfig } from "../config.js";

function createConfig(authoritySecret: string): SolanaArenaConfig {
  return {
    rpcUrl: "http://127.0.0.1:8899",
    wsUrl: "ws://127.0.0.1:8900",
    marketProgramId: Keypair.generate().publicKey.toBase58(),
    goldMint: Keypair.generate().publicKey.toBase58(),
    goldTokenProgramId: Keypair.generate().publicKey.toBase58(),
    associatedTokenProgramId: Keypair.generate().publicKey.toBase58(),
    systemProgramId: SystemProgram.programId.toBase58(),
    jupiterQuoteUrl: "https://example.invalid/quote",
    usdcMint: Keypair.generate().publicKey.toBase58(),
    solMint: Keypair.generate().publicKey.toBase58(),
    feeBps: 200,
    authoritySecret,
    reporterSecret: null,
    keeperSecret: null,
    closeSlotLead: 20,
    stakingIndexerUrl: null,
    stakingIndexerAuthHeader: null,
    birdeyeApiKey: null,
    birdeyeBaseUrl: "https://public-api.birdeye.so",
  };
}

function injectConnection(
  operator: SolanaArenaOperator,
  params: {
    getAccountInfo: (
      publicKey: PublicKey,
      commitment?: "processed" | "confirmed" | "finalized",
    ) => Promise<AccountInfo<Buffer> | null>;
    getBalance: (
      publicKey: PublicKey,
      commitment?: "processed" | "confirmed" | "finalized",
    ) => Promise<number>;
  },
): void {
  (
    operator as unknown as {
      connection: typeof params;
    }
  ).connection = params;
}

describe("SolanaArenaOperator", () => {
  it("disables live writes when the authority account is missing on-chain", async () => {
    const authority = Keypair.generate();
    const operator = new SolanaArenaOperator(
      createConfig(JSON.stringify(Array.from(authority.secretKey))),
    );

    injectConnection(operator, {
      getAccountInfo: vi.fn(async () => null),
      getBalance: vi.fn(async () => 0),
    });

    const readiness = await operator.validateRoundInitialization();

    expect(readiness.ready).toBe(false);
    expect(readiness.reason).toContain("does not exist on-chain");
    expect(operator.isEnabled()).toBe(false);
  });

  it("accepts base64 authority secrets when the signer is a plain funded system account", async () => {
    const authority = Keypair.generate();
    const operator = new SolanaArenaOperator(
      createConfig(
        `base64:${Buffer.from(authority.secretKey).toString("base64")}`,
      ),
    );

    const fundedSystemAccount: AccountInfo<Buffer> = {
      data: Buffer.alloc(0),
      executable: false,
      lamports: 2_000_000,
      owner: SystemProgram.programId,
      rentEpoch: 0,
    };

    injectConnection(operator, {
      getAccountInfo: vi.fn(async () => fundedSystemAccount),
      getBalance: vi.fn(async () => fundedSystemAccount.lamports),
    });

    const readiness = await operator.validateRoundInitialization();

    expect(readiness).toEqual({ ready: true });
    expect(operator.isEnabled()).toBe(true);
  });
});
