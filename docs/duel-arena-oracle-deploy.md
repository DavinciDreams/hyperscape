# Duel Arena Oracle Deployment

This is the standalone duel arena oracle path inside Hyperscape. It is separate from betting and prediction market flows.

## Components

- EVM oracle package: `packages/duel-oracle-evm`
- Solana oracle package: `packages/duel-oracle-solana`
- Server publisher: `packages/server/src/oracle/DuelArenaOraclePublisher.ts`
- Metadata API: `GET /api/duel-arena/oracle/duels/:duelId`

The production event flow is:

1. `streaming:announcement:start` -> publish duel announcement/open state
2. `streaming:fight:start` -> publish locked/start state
3. `streaming:resolution:start` -> publish result
4. `streaming:cycle:aborted` -> publish cancellation

## Local Wallet Generation

Generate unfunded deploy/reporter wallets and write them into ignored `.env` files:

```bash
bun --cwd packages/server run scripts/generate-duel-oracle-wallets.ts
```

This writes:

- `packages/server/.env`
- `packages/duel-oracle-evm/.env` if you choose to keep EVM deploy env there
- public summary: `.codex-artifacts/duel-arena-oracle-wallets/public-addresses.json`
- Solana keypair files: `.codex-artifacts/duel-arena-oracle-wallets/*.json`

Use the generated public addresses for funding. Keep the `.env` files and `.codex-artifacts` directory private.

## Server Runtime Config

Server config lives in `packages/server/.env`.

Core toggles:

```dotenv
DUEL_ARENA_ORACLE_ENABLED=true
DUEL_ARENA_ORACLE_PROFILE=testnet
DUEL_ARENA_ORACLE_METADATA_BASE_URL=https://your-domain.example/api/duel-arena/oracle
DUEL_ARENA_ORACLE_STORE_PATH=/var/lib/hyperscape/duel-arena-oracle/records.json
```

Profiles:

- `testnet`: Base Sepolia, BSC Testnet, Avalanche Fuji, Solana Devnet
- `mainnet`: Base, BSC, Avalanche C-Chain, Solana Mainnet
- `all`: publish to every configured target

The publisher only activates targets that have both a deploy key and a contract/program target configured.

## EVM Deploy

EVM deploy config lives in `packages/duel-oracle-evm/.env` if you keep a local deploy file there. The canonical contract source shipped to consumers is under `packages/duel-oracle-evm/contracts/DuelOutcomeOracle.sol`.

Compile:

```bash
bun --cwd packages/duel-oracle-evm run compile
```

Deploy testnets:

```bash
bun --cwd packages/duel-oracle-evm run deploy:base-sepolia
bun --cwd packages/duel-oracle-evm run deploy:bsc-testnet
bun --cwd packages/duel-oracle-evm run deploy:avax-fuji
```

Deploy mainnets:

```bash
bun --cwd packages/duel-oracle-evm run deploy:base
bun --cwd packages/duel-oracle-evm run deploy:bsc
bun --cwd packages/duel-oracle-evm run deploy:avax
```

Receipts are written to:

- `packages/duel-oracle-evm/deployments/duel-outcome-oracle/baseSepolia.json`
- `packages/duel-oracle-evm/deployments/duel-outcome-oracle/bscTestnet.json`
- `packages/duel-oracle-evm/deployments/duel-outcome-oracle/avaxFuji.json`
- `packages/duel-oracle-evm/deployments/duel-outcome-oracle/base.json`
- `packages/duel-oracle-evm/deployments/duel-outcome-oracle/bsc.json`
- `packages/duel-oracle-evm/deployments/duel-outcome-oracle/avax.json`

After deployment, copy the deployed contract address into the matching server env var:

- `DUEL_ARENA_ORACLE_BASE_SEPOLIA_CONTRACT_ADDRESS`
- `DUEL_ARENA_ORACLE_BSC_TESTNET_CONTRACT_ADDRESS`
- `DUEL_ARENA_ORACLE_AVAX_FUJI_CONTRACT_ADDRESS`
- `DUEL_ARENA_ORACLE_BASE_MAINNET_CONTRACT_ADDRESS`
- `DUEL_ARENA_ORACLE_BSC_MAINNET_CONTRACT_ADDRESS`
- `DUEL_ARENA_ORACLE_AVAX_MAINNET_CONTRACT_ADDRESS`

## Solana Deploy

The canonical oracle program source now lives in the dedicated oracle package.

Build:

```bash
bun --cwd packages/duel-oracle-solana run anchor:build
```

Deploy oracle-only:

```bash
cd packages/duel-oracle-solana/anchor
ANCHOR_WALLET=/absolute/path/to/solana-devnet.json bash scripts/deploy-fight-oracle.sh devnet
ANCHOR_WALLET=/absolute/path/to/solana-mainnet.json bash scripts/deploy-fight-oracle.sh mainnet-beta
```

Program IDs default to:

- Devnet: `6tpRysBFd1yXRipYEYwAw9jxEoVHk15kVXfkDGFLMqcD`
- Mainnet: `6tpRysBFd1yXRipYEYwAw9jxEoVHk15kVXfkDGFLMqcD`

If you change program IDs, update:

- `DUEL_ARENA_ORACLE_SOLANA_DEVNET_PROGRAM_ID`
- `DUEL_ARENA_ORACLE_SOLANA_MAINNET_PROGRAM_ID`

The server publisher auto-initializes the on-chain oracle config when the authority/reporter secrets are present.

## ABI / IDL Usage

EVM ABI:

- package export: `packages/duel-oracle-evm/src/generated/duelOutcomeOracleAbi.ts`

Solana IDL:

- canonical IDL JSON: `packages/duel-oracle-solana/anchor/target/idl/fight_oracle.json`
- generated TS package export: `packages/duel-oracle-solana/src/generated/fightOracleIdl.ts`

EVM `viem` example:

```ts
import { createPublicClient, http } from "viem";
import { baseSepolia } from "viem/chains";
import { DUEL_OUTCOME_ORACLE_ABI } from "../packages/duel-oracle-evm/dist/index.js";

const client = createPublicClient({
  chain: baseSepolia,
  transport: http(process.env.DUEL_ARENA_ORACLE_BASE_SEPOLIA_RPC_URL),
});

const duel = await client.readContract({
  address: process.env.DUEL_ARENA_ORACLE_BASE_SEPOLIA_CONTRACT_ADDRESS as `0x${string}`,
  abi: DUEL_OUTCOME_ORACLE_ABI,
  functionName: "getDuel",
  args: ["0x..."],
});
```

Solana `web3.js` / Anchor example:

```ts
import { PublicKey } from "@solana/web3.js";
import { FIGHT_ORACLE_IDL } from "../packages/duel-oracle-solana/dist/index.js";

const programId = new PublicKey(FIGHT_ORACLE_IDL.address);
```

## Naming Note

The current on-chain schema still uses `betOpenTs` and `betCloseTs`. In the duel arena oracle flow those fields represent the arena announcement window and lock/start transition, not a betting dependency.

## Production Checklist

1. Generate wallets and fund the correct public addresses for the target profile.
2. Deploy EVM contracts and Solana program.
3. Set the deployed contract/program addresses in `packages/server/.env`.
4. Set `DUEL_ARENA_ORACLE_ENABLED=true` and choose the correct `DUEL_ARENA_ORACLE_PROFILE`.
5. Set `DUEL_ARENA_ORACLE_METADATA_BASE_URL` to the public server URL.
6. Restart the server and verify:
   - `GET /api/duel-arena/oracle/recent`
   - `GET /api/duel-arena/oracle/duels/<duelId>`
   - chain receipts/sigs appear in the returned `chainState`
