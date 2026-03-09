import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ContractFactory, JsonRpcProvider, Wallet, isAddress } from "ethers";

type DeploymentReceipt = {
  network: string;
  chainId: number;
  deployer: string;
  oracleAddress: string;
  adminAddress: string;
  reporterAddress: string;
  deploymentTxHash: string | null;
  deployedAt: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required ${name}`);
  }
  return value;
}

function resolveOutputPath(networkName: string): string {
  const currentFile = fileURLToPath(import.meta.url);
  return path.resolve(
    path.dirname(currentFile),
    "..",
    "deployments",
    "duel-outcome-oracle",
    `${networkName}.json`,
  );
}

function ensureParentDir(filePath: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeReceipt(networkName: string, payload: DeploymentReceipt): void {
  const outputPath = resolveOutputPath(networkName);
  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n");
  console.log("Deployment receipt written to:", outputPath);
}

function requireAddress(name: string, fallback: string): string {
  const candidate = process.env[name]?.trim() || fallback;
  if (!isAddress(candidate)) {
    throw new Error(`Invalid ${name}: ${candidate}`);
  }
  return candidate;
}

async function main() {
  const rpcUrl = process.env.ANVIL_RPC_URL?.trim() || "http://127.0.0.1:8545";
  const privateKey =
    process.env.ANVIL_PRIVATE_KEY?.trim() ||
    process.env.PRIVATE_KEY?.trim() ||
    requireEnv("ANVIL_PRIVATE_KEY");

  const artifactPath = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "artifacts",
    "contracts",
    "DuelOutcomeOracle.sol",
    "DuelOutcomeOracle.json",
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(
      `Missing compiled artifact at ${artifactPath}. Run "bun run compile" first.`,
    );
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8")) as {
    abi: unknown[];
    bytecode: string;
  };

  const provider = new JsonRpcProvider(rpcUrl);
  const wallet = new Wallet(privateKey, provider);
  const network = await provider.getNetwork();
  const chainId = Number(network.chainId);
  const admin = requireAddress("ORACLE_ADMIN_ADDRESS", wallet.address);
  const reporter = requireAddress("ORACLE_REPORTER_ADDRESS", wallet.address);

  console.log("Deploying DuelOutcomeOracle with account:", wallet.address);
  console.log("RPC URL:", rpcUrl);
  console.log("Network: anvil", `(chainId=${chainId})`);
  console.log("Admin:", admin);
  console.log("Reporter:", reporter);

  const factory = new ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const oracle = await factory.deploy(admin, reporter);
  await oracle.waitForDeployment();

  const contractAddress = await oracle.getAddress();
  const deploymentTxHash = oracle.deploymentTransaction()?.hash ?? null;

  console.log("DuelOutcomeOracle deployed to:", contractAddress);

  writeReceipt("anvil", {
    network: "anvil",
    chainId,
    deployer: wallet.address,
    oracleAddress: contractAddress,
    adminAddress: admin,
    reporterAddress: reporter,
    deploymentTxHash,
    deployedAt: new Date().toISOString(),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
