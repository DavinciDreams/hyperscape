import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { Keypair, PublicKey, SystemProgram } from "@solana/web3.js";
import * as assert from "assert";
import { configureAnchorTests } from "./test-anchor";

import { FightOracle } from "../target/types/fight_oracle";
import { GoldClobMarket } from "../target/types/gold_clob_market";

const BPF_LOADER_UPGRADEABLE_PROGRAM_ID = new PublicKey(
  "BPFLoaderUpgradeab1e11111111111111111111111",
);

function deriveProgramDataAddress(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [programId.toBuffer()],
    BPF_LOADER_UPGRADEABLE_PROGRAM_ID,
  )[0];
}

function deriveOracleConfigPda(programId: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("oracle_config")],
    programId,
  )[0];
}

function deriveOracleMatchPda(
  programId: PublicKey,
  matchId: anchor.BN,
): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("match"), matchId.toArrayLike(Buffer, "le", 8)],
    programId,
  )[0];
}

describe("gold_clob_market (native SOL settlement)", () => {
  anchor.setProvider(configureAnchorTests());
  const provider = anchor.getProvider() as anchor.AnchorProvider;
  const payer = (
    provider.wallet as anchor.Wallet & { payer: anchor.web3.Keypair }
  ).payer;

  const fightProgram = anchor.workspace.FightOracle as Program<FightOracle>;
  const clobProgram = anchor.workspace
    .GoldClobMarket as Program<GoldClobMarket>;

  it("initializes config and match state bound to an oracle match", async () => {
    const [configPda] = PublicKey.findProgramAddressSync(
      [Buffer.from("config")],
      clobProgram.programId,
    );

    const existingConfig =
      await clobProgram.account.marketConfig.fetchNullable(configPda);
    if (!existingConfig) {
      await clobProgram.methods
        .initializeConfig(payer.publicKey, payer.publicKey, 100, 100, 200)
        .accountsPartial({
          authority: provider.wallet.publicKey,
          config: configPda,
          program: clobProgram.programId,
          programData: deriveProgramDataAddress(clobProgram.programId),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    } else {
      await clobProgram.methods
        .updateConfig(payer.publicKey, payer.publicKey, 100, 100, 200)
        .accountsPartial({
          authority: provider.wallet.publicKey,
          config: configPda,
        })
        .rpc();
    }

    const oracleConfig = deriveOracleConfigPda(fightProgram.programId);
    const existingOracleConfig =
      await fightProgram.account.oracleConfig.fetchNullable(oracleConfig);
    if (!existingOracleConfig) {
      await fightProgram.methods
        .initializeOracle()
        .accountsPartial({
          authority: payer.publicKey,
          oracleConfig,
          program: fightProgram.programId,
          programData: deriveProgramDataAddress(fightProgram.programId),
          systemProgram: SystemProgram.programId,
        })
        .rpc();
    }

    const matchId = new anchor.BN(Date.now());
    const oracleMatch = deriveOracleMatchPda(fightProgram.programId, matchId);
    await fightProgram.methods
      .createMatch(matchId, new anchor.BN(3600), "clob-init")
      .accountsPartial({
        authority: payer.publicKey,
        oracleConfig,
        matchResult: oracleMatch,
        systemProgram: SystemProgram.programId,
      })
      .rpc();

    const matchState = anchor.web3.Keypair.generate();
    const [vault] = PublicKey.findProgramAddressSync(
      [Buffer.from("vault"), matchState.publicKey.toBuffer()],
      clobProgram.programId,
    );

    await clobProgram.methods
      .initializeMatch(500)
      .accountsPartial({
        matchState: matchState.publicKey,
        user: provider.wallet.publicKey,
        config: configPda,
        oracleMatch,
        vault,
        systemProgram: SystemProgram.programId,
      })
      .signers([matchState])
      .rpc();

    const state = await clobProgram.account.matchState.fetch(
      matchState.publicKey,
    );
    assert.ok(state.isOpen);
    assert.strictEqual(state.nextOrderId.toNumber(), 1);
    assert.ok((state.oracleMatch as PublicKey).equals(oracleMatch));
  });
});
