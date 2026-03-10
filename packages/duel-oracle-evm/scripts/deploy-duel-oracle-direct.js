const fs = require("node:fs");
const path = require("node:path");
const { ethers } = require("ethers");
const dotenv = require("dotenv");

dotenv.config();

const NETWORKS = {
  anvil: {
    chainId: 31337,
    label: "Local Anvil",
    rpcUrl: process.env.ANVIL_RPC_URL || "http://127.0.0.1:8545",
    privateKey:
      process.env.ANVIL_PRIVATE_KEY || process.env.PRIVATE_KEY || null,
  },
  baseSepolia: {
    chainId: 84532,
    label: "Base Sepolia",
    rpcUrl: process.env.BASE_SEPOLIA_RPC || "https://sepolia.base.org",
    privateKey:
      process.env.BASE_SEPOLIA_PRIVATE_KEY || process.env.PRIVATE_KEY || null,
  },
  bscTestnet: {
    chainId: 97,
    label: "BSC Testnet",
    rpcUrl:
      process.env.BSC_TESTNET_RPC ||
      "https://data-seed-prebsc-1-s1.binance.org:8545",
    privateKey:
      process.env.BSC_TESTNET_PRIVATE_KEY || process.env.PRIVATE_KEY || null,
  },
  avaxFuji: {
    chainId: 43113,
    label: "Avalanche Fuji",
    rpcUrl:
      process.env.AVAX_FUJI_RPC || "https://api.avax-test.network/ext/bc/C/rpc",
    privateKey:
      process.env.AVAX_FUJI_PRIVATE_KEY || process.env.PRIVATE_KEY || null,
  },
  base: {
    chainId: 8453,
    label: "Base Mainnet",
    rpcUrl: process.env.BASE_MAINNET_RPC || "https://mainnet.base.org",
    privateKey:
      process.env.BASE_MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY || null,
  },
  bsc: {
    chainId: 56,
    label: "BSC Mainnet",
    rpcUrl: process.env.BSC_MAINNET_RPC || "https://bsc-dataseed.binance.org",
    privateKey:
      process.env.BSC_MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY || null,
  },
  avax: {
    chainId: 43114,
    label: "Avalanche Mainnet",
    rpcUrl:
      process.env.AVAX_MAINNET_RPC || "https://api.avax.network/ext/bc/C/rpc",
    privateKey:
      process.env.AVAX_MAINNET_PRIVATE_KEY || process.env.PRIVATE_KEY || null,
  },
};

function parseNetworkArg() {
  const networkFlagIndex = process.argv.indexOf("--network");
  if (networkFlagIndex >= 0) {
    return process.argv[networkFlagIndex + 1] || null;
  }
  return process.env.DUEL_ORACLE_NETWORK || null;
}

function resolveOutputPath(networkName) {
  return path.resolve(
    __dirname,
    "..",
    "deployments",
    "duel-outcome-oracle",
    `${networkName}.json`,
  );
}

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeReceipt(networkName, payload) {
  const outputPath = resolveOutputPath(networkName);
  ensureParentDir(outputPath);
  fs.writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n");
  console.log("Deployment receipt written to:", outputPath);
}

function requireAddress(name, fallback) {
  const candidate = process.env[name]?.trim() || fallback;
  if (!ethers.isAddress(candidate)) {
    throw new Error(`Invalid ${name}: ${candidate}`);
  }
  return candidate;
}

async function main() {
  const networkName = parseNetworkArg();
  if (!networkName || !(networkName in NETWORKS)) {
    throw new Error(
      `Expected --network <${Object.keys(NETWORKS).join("|")}> or DUEL_ORACLE_NETWORK`,
    );
  }

  const network = NETWORKS[networkName];
  if (!network.privateKey) {
    throw new Error(`Missing private key for network '${networkName}'`);
  }

  const artifactPath = path.resolve(
    __dirname,
    "..",
    "artifacts",
    "contracts",
    "DuelOutcomeOracle.sol",
    "DuelOutcomeOracle.json",
  );
  if (!fs.existsSync(artifactPath)) {
    throw new Error(`Missing compiled artifact at ${artifactPath}`);
  }

  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf8"));
  const provider = new ethers.JsonRpcProvider(network.rpcUrl, network.chainId);
  const deployer = new ethers.Wallet(network.privateKey, provider);
  const admin = requireAddress("ORACLE_ADMIN_ADDRESS", deployer.address);
  const reporter = requireAddress("ORACLE_REPORTER_ADDRESS", deployer.address);

  console.log("Deploying DuelOutcomeOracle with account:", deployer.address);
  console.log("Network:", networkName, `(chainId=${network.chainId})`);
  console.log("Admin:", admin);
  console.log("Reporter:", reporter);

  const DuelOutcomeOracle = new ethers.ContractFactory(
    artifact.abi,
    artifact.bytecode,
    deployer,
  );
  const oracle = await DuelOutcomeOracle.deploy(admin, reporter);
  await oracle.waitForDeployment();

  const contractAddress = await oracle.getAddress();
  const deploymentTxHash = oracle.deploymentTransaction()?.hash ?? null;

  console.log("DuelOutcomeOracle deployed to:", contractAddress);

  writeReceipt(networkName, {
    network: networkName,
    chainId: network.chainId,
    deployer: deployer.address,
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
