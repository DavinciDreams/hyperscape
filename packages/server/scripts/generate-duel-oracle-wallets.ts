import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { privateKeyToAccount } from "viem/accounts";

type EvmWalletSpec = {
  label: string;
  summaryKey: string;
  envKey: string;
  serverEnvKey: string;
  network: "testnet" | "mainnet";
  chain: "Base" | "BSC" | "AVAX";
};

type SolanaWalletSpec = {
  label: string;
  summaryKey: string;
  authorityEnvKey: string;
  reporterEnvKey: string;
  keypairPathEnvKey: string;
  network: "testnet" | "mainnet";
  cluster: "devnet" | "mainnet-beta";
};

type WalletSummary = {
  generatedAt: string;
  evm: Array<{
    key: string;
    chain: string;
    network: string;
    address: string;
  }>;
  solana: Array<{
    key: string;
    cluster: string;
    network: string;
    address: string;
    keypairPath: string;
  }>;
  envFiles: {
    serverEnv: string;
    evmEnv: string;
  };
};

const EVM_WALLETS: EvmWalletSpec[] = [
  {
    label: "Base Sepolia",
    summaryKey: "baseSepolia",
    envKey: "BASE_SEPOLIA_PRIVATE_KEY",
    serverEnvKey: "DUEL_ARENA_ORACLE_BASE_SEPOLIA_PRIVATE_KEY",
    network: "testnet",
    chain: "Base",
  },
  {
    label: "BSC Testnet",
    summaryKey: "bscTestnet",
    envKey: "BSC_TESTNET_PRIVATE_KEY",
    serverEnvKey: "DUEL_ARENA_ORACLE_BSC_TESTNET_PRIVATE_KEY",
    network: "testnet",
    chain: "BSC",
  },
  {
    label: "Avalanche Fuji",
    summaryKey: "avaxFuji",
    envKey: "AVAX_FUJI_PRIVATE_KEY",
    serverEnvKey: "DUEL_ARENA_ORACLE_AVAX_FUJI_PRIVATE_KEY",
    network: "testnet",
    chain: "AVAX",
  },
  {
    label: "Base Mainnet",
    summaryKey: "baseMainnet",
    envKey: "BASE_MAINNET_PRIVATE_KEY",
    serverEnvKey: "DUEL_ARENA_ORACLE_BASE_MAINNET_PRIVATE_KEY",
    network: "mainnet",
    chain: "Base",
  },
  {
    label: "BSC Mainnet",
    summaryKey: "bscMainnet",
    envKey: "BSC_MAINNET_PRIVATE_KEY",
    serverEnvKey: "DUEL_ARENA_ORACLE_BSC_MAINNET_PRIVATE_KEY",
    network: "mainnet",
    chain: "BSC",
  },
  {
    label: "Avalanche Mainnet",
    summaryKey: "avaxMainnet",
    envKey: "AVAX_MAINNET_PRIVATE_KEY",
    serverEnvKey: "DUEL_ARENA_ORACLE_AVAX_MAINNET_PRIVATE_KEY",
    network: "mainnet",
    chain: "AVAX",
  },
];

const SOLANA_WALLETS: SolanaWalletSpec[] = [
  {
    label: "Solana Devnet",
    summaryKey: "solanaDevnet",
    authorityEnvKey: "DUEL_ARENA_ORACLE_SOLANA_DEVNET_AUTHORITY_SECRET",
    reporterEnvKey: "DUEL_ARENA_ORACLE_SOLANA_DEVNET_REPORTER_SECRET",
    keypairPathEnvKey: "DUEL_ARENA_ORACLE_SOLANA_DEVNET_KEYPAIR_PATH",
    network: "testnet",
    cluster: "devnet",
  },
  {
    label: "Solana Mainnet",
    summaryKey: "solanaMainnet",
    authorityEnvKey: "DUEL_ARENA_ORACLE_SOLANA_MAINNET_AUTHORITY_SECRET",
    reporterEnvKey: "DUEL_ARENA_ORACLE_SOLANA_MAINNET_REPORTER_SECRET",
    keypairPathEnvKey: "DUEL_ARENA_ORACLE_SOLANA_MAINNET_KEYPAIR_PATH",
    network: "mainnet",
    cluster: "mainnet-beta",
  },
];

function formatSection(
  marker: string,
  lines: string[],
  existing: string,
): string {
  const start = `# BEGIN ${marker}`;
  const end = `# END ${marker}`;
  const body = `${start}\n${lines.join("\n")}\n${end}`;
  const pattern = new RegExp(`${start}[\\s\\S]*?${end}`, "m");
  if (pattern.test(existing)) {
    return existing.replace(pattern, body);
  }
  const trimmed = existing.trimEnd();
  return trimmed.length > 0 ? `${trimmed}\n\n${body}\n` : `${body}\n`;
}

async function readEnvFile(filePath: string): Promise<string> {
  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    const code =
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      typeof (error as { code?: string }).code === "string"
        ? (error as { code: string }).code
        : null;
    if (code === "ENOENT") {
      return "";
    }
    throw error;
  }
}

async function main() {
  const currentFile = fileURLToPath(import.meta.url);
  const serverDir = path.resolve(path.dirname(currentFile), "..");
  const workspaceRoot = path.resolve(serverDir, "../..");
  const serverEnvPath = path.resolve(serverDir, ".env");
  const evmEnvPath = path.resolve(
    workspaceRoot,
    "packages/duel-oracle-evm/.env",
  );
  const generatedDir = path.resolve(
    workspaceRoot,
    ".codex-artifacts/duel-arena-oracle-wallets",
  );
  await fs.mkdir(generatedDir, { recursive: true });

  const evmLinesForServer: string[] = [
    "# Duel arena oracle EVM publisher keys",
  ];
  const evmLinesForContracts: string[] = [
    "# Duel arena oracle EVM deploy keys",
  ];
  const solanaLinesForServer: string[] = [
    "# Duel arena oracle Solana publisher keys",
  ];
  const summary: WalletSummary = {
    generatedAt: new Date().toISOString(),
    evm: [],
    solana: [],
    envFiles: {
      serverEnv: serverEnvPath,
      evmEnv: evmEnvPath,
    },
  };

  for (const spec of EVM_WALLETS) {
    const privateKey = `0x${randomBytes(32).toString("hex")}` as const;
    const account = privateKeyToAccount(privateKey);
    evmLinesForServer.push(`${spec.serverEnvKey}=${privateKey}`);
    evmLinesForContracts.push(`${spec.envKey}=${privateKey}`);
    summary.evm.push({
      key: spec.summaryKey,
      chain: spec.chain,
      network: spec.network,
      address: account.address,
    });
  }

  for (const spec of SOLANA_WALLETS) {
    const keypair = Keypair.generate();
    const secretBase64 = Buffer.from(keypair.secretKey).toString("base64");
    const keypairPath = path.resolve(generatedDir, `${spec.summaryKey}.json`);
    await fs.writeFile(
      keypairPath,
      JSON.stringify(Array.from(keypair.secretKey), null, 2) + "\n",
      { mode: 0o600 },
    );
    solanaLinesForServer.push(`${spec.authorityEnvKey}=base64:${secretBase64}`);
    solanaLinesForServer.push(`${spec.reporterEnvKey}=base64:${secretBase64}`);
    solanaLinesForServer.push(`${spec.keypairPathEnvKey}=${keypairPath}`);
    summary.solana.push({
      key: spec.summaryKey,
      cluster: spec.cluster,
      network: spec.network,
      address: keypair.publicKey.toBase58(),
      keypairPath,
    });
  }

  let serverEnv = await readEnvFile(serverEnvPath);
  let evmEnv = await readEnvFile(evmEnvPath);

  serverEnv = formatSection(
    "DUEL_ARENA_ORACLE_WALLETS",
    [
      "DUEL_ARENA_ORACLE_ENABLED=false",
      "DUEL_ARENA_ORACLE_PROFILE=testnet",
      ...evmLinesForServer,
      ...solanaLinesForServer,
    ],
    serverEnv,
  );
  evmEnv = formatSection(
    "DUEL_ARENA_ORACLE_WALLETS",
    evmLinesForContracts,
    evmEnv,
  );

  await fs.writeFile(serverEnvPath, serverEnv, { mode: 0o600 });
  await fs.writeFile(evmEnvPath, evmEnv, { mode: 0o600 });

  const summaryPath = path.resolve(generatedDir, "public-addresses.json");
  await fs.writeFile(summaryPath, JSON.stringify(summary, null, 2) + "\n", {
    mode: 0o600,
  });

  console.log(JSON.stringify({ summaryPath, summary }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
