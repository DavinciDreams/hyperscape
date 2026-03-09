import { fileURLToPath } from "node:url";
import path from "node:path";
import type {
  DuelArenaOracleConfig,
  DuelArenaOracleEvmTargetConfig,
  DuelArenaOracleProfile,
  DuelArenaOracleSolanaTargetConfig,
} from "./types.js";

function normalizeProfile(value: string | undefined): DuelArenaOracleProfile {
  const normalized = value?.trim().toLowerCase();
  if (normalized === "local") return "local";
  if (normalized === "mainnet") return "mainnet";
  if (normalized === "all") return "all";
  return "testnet";
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeHexPrivateKey(
  value: string | undefined,
): `0x${string}` | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  const prefixed = trimmed.startsWith("0x") ? trimmed : `0x${trimmed}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(prefixed)) {
    return null;
  }
  return prefixed as `0x${string}`;
}

function normalizeEvmAddress(value: string | undefined): `0x${string}` | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^0x[0-9a-fA-F]{40}$/.test(trimmed)) {
    return null;
  }
  return trimmed as `0x${string}`;
}

function readFirstEnvValue(...keys: string[]): string | undefined {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function resolveMetadataBaseUrl(): string {
  const configured = process.env.DUEL_ARENA_ORACLE_METADATA_BASE_URL?.trim();
  if (configured) {
    return trimTrailingSlash(configured);
  }

  const explicitApiUrl = process.env.PUBLIC_API_URL?.trim();
  if (explicitApiUrl) {
    return `${trimTrailingSlash(explicitApiUrl)}/api/duel-arena/oracle`;
  }

  const protocol =
    (process.env.SERVER_PROTOCOL || "http").replace(/:$/, "").trim() || "http";
  const host = process.env.SERVER_HOST?.trim() || "127.0.0.1";
  const port = process.env.PORT?.trim() || "5555";
  return `${protocol}://${host}:${port}/api/duel-arena/oracle`;
}

function resolveStorePath(): string {
  const configured = process.env.DUEL_ARENA_ORACLE_STORE_PATH?.trim();
  if (configured) {
    return configured;
  }

  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  return path.resolve(currentDir, "../../data/duel-arena-oracle/records.json");
}

function maybePushEvmTarget(
  targets: DuelArenaOracleEvmTargetConfig[],
  target: DuelArenaOracleEvmTargetConfig | null,
): void {
  if (target) {
    targets.push(target);
  }
}

function buildEvmTarget(
  key: DuelArenaOracleEvmTargetConfig["key"],
  label: string,
  rpcUrlEnv: string,
  fallbackRpcUrl: string,
  contractEnv: string,
  privateKeyEnv: string,
  fallbackPrivateKeyEnvs: string[] = [],
): DuelArenaOracleEvmTargetConfig | null {
  const contractAddress = normalizeEvmAddress(process.env[contractEnv]);
  const privateKey = normalizeHexPrivateKey(
    readFirstEnvValue(privateKeyEnv, ...fallbackPrivateKeyEnvs),
  );
  if (!contractAddress || !privateKey) {
    return null;
  }

  return {
    key,
    label,
    rpcUrl: process.env[rpcUrlEnv]?.trim() || fallbackRpcUrl,
    contractAddress,
    privateKey,
  };
}

function buildSolanaTarget(
  key: DuelArenaOracleSolanaTargetConfig["key"],
  label: string,
  rpcUrlEnv: string,
  fallbackRpcUrl: string,
  wsUrlEnv: string,
  fallbackWsUrl: string,
  programIdEnv: string,
  fallbackProgramId: string,
  authoritySecretEnv: string,
  reporterSecretEnv: string,
  fallbackAuthoritySecretEnvs: string[] = [],
  fallbackReporterSecretEnvs: string[] = [],
): DuelArenaOracleSolanaTargetConfig | null {
  const reporterSecret =
    readFirstEnvValue(reporterSecretEnv, ...fallbackReporterSecretEnvs) || null;
  const authoritySecret =
    readFirstEnvValue(authoritySecretEnv, ...fallbackAuthoritySecretEnvs) ||
    null;
  const programId = process.env[programIdEnv]?.trim() || fallbackProgramId;

  if (!reporterSecret && !authoritySecret) {
    return null;
  }

  return {
    key,
    label,
    rpcUrl: process.env[rpcUrlEnv]?.trim() || fallbackRpcUrl,
    wsUrl: process.env[wsUrlEnv]?.trim() || fallbackWsUrl,
    programId,
    authoritySecret,
    reporterSecret,
  };
}

export function getDuelArenaOracleConfig(): DuelArenaOracleConfig {
  const enabled = process.env.DUEL_ARENA_ORACLE_ENABLED === "true";
  const profile = normalizeProfile(process.env.DUEL_ARENA_ORACLE_PROFILE);
  const evmTargets: DuelArenaOracleEvmTargetConfig[] = [];
  const solanaTargets: DuelArenaOracleSolanaTargetConfig[] = [];

  if (profile === "local" || profile === "all") {
    maybePushEvmTarget(
      evmTargets,
      buildEvmTarget(
        "anvil",
        "Local Anvil",
        "DUEL_ARENA_ORACLE_ANVIL_RPC_URL",
        "http://127.0.0.1:8545",
        "DUEL_ARENA_ORACLE_ANVIL_CONTRACT_ADDRESS",
        "DUEL_ARENA_ORACLE_ANVIL_PRIVATE_KEY",
        ["DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY"],
      ),
    );
    const localnetTarget = buildSolanaTarget(
      "solanaLocalnet",
      "Solana Localnet",
      "DUEL_ARENA_ORACLE_SOLANA_LOCALNET_RPC_URL",
      "http://127.0.0.1:8899",
      "DUEL_ARENA_ORACLE_SOLANA_LOCALNET_WS_URL",
      "ws://127.0.0.1:8900",
      "DUEL_ARENA_ORACLE_SOLANA_LOCALNET_PROGRAM_ID",
      "6Tx7s2UG4maFWakRFVi4GeecXJYyBXQF8f2vJdQShSpV",
      "DUEL_ARENA_ORACLE_SOLANA_LOCALNET_AUTHORITY_SECRET",
      "DUEL_ARENA_ORACLE_SOLANA_LOCALNET_REPORTER_SECRET",
      ["DUEL_ARENA_ORACLE_SOLANA_AUTHORITY_SECRET"],
      ["DUEL_ARENA_ORACLE_SOLANA_REPORTER_SECRET"],
    );
    if (localnetTarget) {
      solanaTargets.push(localnetTarget);
    }
  }

  if (profile === "testnet" || profile === "all") {
    maybePushEvmTarget(
      evmTargets,
      buildEvmTarget(
        "baseSepolia",
        "Base Sepolia",
        "DUEL_ARENA_ORACLE_BASE_SEPOLIA_RPC_URL",
        "https://sepolia.base.org",
        "DUEL_ARENA_ORACLE_BASE_SEPOLIA_CONTRACT_ADDRESS",
        "DUEL_ARENA_ORACLE_BASE_SEPOLIA_PRIVATE_KEY",
        ["DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY"],
      ),
    );
    maybePushEvmTarget(
      evmTargets,
      buildEvmTarget(
        "bscTestnet",
        "BSC Testnet",
        "DUEL_ARENA_ORACLE_BSC_TESTNET_RPC_URL",
        "https://data-seed-prebsc-1-s1.binance.org:8545",
        "DUEL_ARENA_ORACLE_BSC_TESTNET_CONTRACT_ADDRESS",
        "DUEL_ARENA_ORACLE_BSC_TESTNET_PRIVATE_KEY",
        ["DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY"],
      ),
    );
    maybePushEvmTarget(
      evmTargets,
      buildEvmTarget(
        "avaxFuji",
        "Avalanche Fuji",
        "DUEL_ARENA_ORACLE_AVAX_FUJI_RPC_URL",
        "https://api.avax-test.network/ext/bc/C/rpc",
        "DUEL_ARENA_ORACLE_AVAX_FUJI_CONTRACT_ADDRESS",
        "DUEL_ARENA_ORACLE_AVAX_FUJI_PRIVATE_KEY",
        ["DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY"],
      ),
    );
    const devnetTarget = buildSolanaTarget(
      "solanaDevnet",
      "Solana Devnet",
      "DUEL_ARENA_ORACLE_SOLANA_DEVNET_RPC_URL",
      "https://api.devnet.solana.com",
      "DUEL_ARENA_ORACLE_SOLANA_DEVNET_WS_URL",
      "wss://api.devnet.solana.com/",
      "DUEL_ARENA_ORACLE_SOLANA_DEVNET_PROGRAM_ID",
      "6Tx7s2UG4maFWakRFVi4GeecXJYyBXQF8f2vJdQShSpV",
      "DUEL_ARENA_ORACLE_SOLANA_DEVNET_AUTHORITY_SECRET",
      "DUEL_ARENA_ORACLE_SOLANA_DEVNET_REPORTER_SECRET",
      ["DUEL_ARENA_ORACLE_SOLANA_AUTHORITY_SECRET"],
      ["DUEL_ARENA_ORACLE_SOLANA_REPORTER_SECRET"],
    );
    if (devnetTarget) {
      solanaTargets.push(devnetTarget);
    }
  }

  if (profile === "mainnet" || profile === "all") {
    maybePushEvmTarget(
      evmTargets,
      buildEvmTarget(
        "base",
        "Base Mainnet",
        "DUEL_ARENA_ORACLE_BASE_MAINNET_RPC_URL",
        "https://mainnet.base.org",
        "DUEL_ARENA_ORACLE_BASE_MAINNET_CONTRACT_ADDRESS",
        "DUEL_ARENA_ORACLE_BASE_MAINNET_PRIVATE_KEY",
        ["DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY"],
      ),
    );
    maybePushEvmTarget(
      evmTargets,
      buildEvmTarget(
        "bsc",
        "BSC Mainnet",
        "DUEL_ARENA_ORACLE_BSC_MAINNET_RPC_URL",
        "https://bsc-dataseed.binance.org",
        "DUEL_ARENA_ORACLE_BSC_MAINNET_CONTRACT_ADDRESS",
        "DUEL_ARENA_ORACLE_BSC_MAINNET_PRIVATE_KEY",
        ["DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY"],
      ),
    );
    maybePushEvmTarget(
      evmTargets,
      buildEvmTarget(
        "avax",
        "Avalanche Mainnet",
        "DUEL_ARENA_ORACLE_AVAX_MAINNET_RPC_URL",
        "https://api.avax.network/ext/bc/C/rpc",
        "DUEL_ARENA_ORACLE_AVAX_MAINNET_CONTRACT_ADDRESS",
        "DUEL_ARENA_ORACLE_AVAX_MAINNET_PRIVATE_KEY",
        ["DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY"],
      ),
    );
    const mainnetTarget = buildSolanaTarget(
      "solanaMainnet",
      "Solana Mainnet",
      "DUEL_ARENA_ORACLE_SOLANA_MAINNET_RPC_URL",
      "https://api.mainnet-beta.solana.com",
      "DUEL_ARENA_ORACLE_SOLANA_MAINNET_WS_URL",
      "wss://api.mainnet-beta.solana.com/",
      "DUEL_ARENA_ORACLE_SOLANA_MAINNET_PROGRAM_ID",
      "6Tx7s2UG4maFWakRFVi4GeecXJYyBXQF8f2vJdQShSpV",
      "DUEL_ARENA_ORACLE_SOLANA_MAINNET_AUTHORITY_SECRET",
      "DUEL_ARENA_ORACLE_SOLANA_MAINNET_REPORTER_SECRET",
      ["DUEL_ARENA_ORACLE_SOLANA_AUTHORITY_SECRET"],
      ["DUEL_ARENA_ORACLE_SOLANA_REPORTER_SECRET"],
    );
    if (mainnetTarget) {
      solanaTargets.push(mainnetTarget);
    }
  }

  return {
    enabled,
    profile,
    metadataBaseUrl: resolveMetadataBaseUrl(),
    storePath: resolveStorePath(),
    evmTargets,
    solanaTargets,
  };
}
