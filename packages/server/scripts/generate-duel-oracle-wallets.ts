import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes } from "node:crypto";
import { Keypair } from "@solana/web3.js";
import { privateKeyToAccount } from "viem/accounts";

type WalletSummary = {
  generatedAt: string;
  evm: {
    address: string;
    chains: Array<{
      key: string;
      chain: string;
      network: string;
    }>;
  };
  solana: {
    address: string;
    keypairPath: string;
    clusters: Array<{
      key: string;
      cluster: string;
      network: string;
    }>;
  };
  envFiles: {
    serverEnv: string;
    evmEnv: string;
  };
};

const SHARED_EVM_CHAINS = [
  { key: "baseSepolia", chain: "Base", network: "testnet" },
  { key: "bscTestnet", chain: "BSC", network: "testnet" },
  { key: "avaxFuji", chain: "AVAX", network: "testnet" },
  { key: "base", chain: "Base", network: "mainnet" },
  { key: "bsc", chain: "BSC", network: "mainnet" },
  { key: "avax", chain: "AVAX", network: "mainnet" },
] as const;

const SHARED_SOLANA_CLUSTERS = [
  { key: "solanaDevnet", cluster: "devnet", network: "testnet" },
  { key: "solanaMainnet", cluster: "mainnet-beta", network: "mainnet" },
] as const;

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
    "# Shared duel arena oracle EVM signer for Base, BSC, and AVAX",
  ];
  const evmLinesForContracts: string[] = [
    "# Shared duel arena oracle EVM deploy signer for Base, BSC, and AVAX",
  ];
  const solanaLinesForServer: string[] = [
    "# Shared duel arena oracle Solana authority/reporter signer",
  ];
  const sharedSolanaKeypairPath = path.resolve(
    generatedDir,
    "solana-shared.json",
  );
  const summary: WalletSummary = {
    generatedAt: new Date().toISOString(),
    evm: {
      address: "",
      chains: SHARED_EVM_CHAINS.map((chain) => ({ ...chain })),
    },
    solana: {
      address: "",
      keypairPath: sharedSolanaKeypairPath,
      clusters: SHARED_SOLANA_CLUSTERS.map((cluster) => ({ ...cluster })),
    },
    envFiles: {
      serverEnv: serverEnvPath,
      evmEnv: evmEnvPath,
    },
  };

  const evmPrivateKey = `0x${randomBytes(32).toString("hex")}` as const;
  const evmAccount = privateKeyToAccount(evmPrivateKey);
  evmLinesForServer.push(`DUEL_ARENA_ORACLE_EVM_PRIVATE_KEY=${evmPrivateKey}`);
  evmLinesForContracts.push(`PRIVATE_KEY=${evmPrivateKey}`);
  summary.evm.address = evmAccount.address;

  const solanaKeypair = Keypair.generate();
  const solanaSecretBase64 = Buffer.from(solanaKeypair.secretKey).toString(
    "base64",
  );
  await Promise.all(
    ["solanaDevnet.json", "solanaMainnet.json"].map((name) =>
      fs.rm(path.resolve(generatedDir, name), { force: true }),
    ),
  );
  await fs.writeFile(
    sharedSolanaKeypairPath,
    JSON.stringify(Array.from(solanaKeypair.secretKey), null, 2) + "\n",
    { mode: 0o600 },
  );
  solanaLinesForServer.push(
    `DUEL_ARENA_ORACLE_SOLANA_AUTHORITY_SECRET=base64:${solanaSecretBase64}`,
  );
  solanaLinesForServer.push(
    `DUEL_ARENA_ORACLE_SOLANA_REPORTER_SECRET=base64:${solanaSecretBase64}`,
  );
  solanaLinesForServer.push(
    `DUEL_ARENA_ORACLE_SOLANA_KEYPAIR_PATH=${sharedSolanaKeypairPath}`,
  );
  summary.solana.address = solanaKeypair.publicKey.toBase58();

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
