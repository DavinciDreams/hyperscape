export { DUEL_OUTCOME_ORACLE_ABI } from "./generated/duelOutcomeOracleAbi.js";

export const DUEL_OUTCOME_ORACLE_DEPLOYMENTS = {
  baseSepolia: {
    chainId: 84532,
    label: "Base Sepolia",
    rpcUrl: "https://sepolia.base.org",
    address: null,
  },
  bscTestnet: {
    chainId: 97,
    label: "BSC Testnet",
    rpcUrl: "https://data-seed-prebsc-1-s1.binance.org:8545",
    address: null,
  },
  avaxFuji: {
    chainId: 43113,
    label: "Avalanche Fuji",
    rpcUrl: "https://api.avax-test.network/ext/bc/C/rpc",
    address: null,
  },
  base: {
    chainId: 8453,
    label: "Base Mainnet",
    rpcUrl: "https://mainnet.base.org",
    address: null,
  },
  bsc: {
    chainId: 56,
    label: "BSC Mainnet",
    rpcUrl: "https://bsc-dataseed.binance.org",
    address: null,
  },
  avax: {
    chainId: 43114,
    label: "Avalanche Mainnet",
    rpcUrl: "https://api.avax.network/ext/bc/C/rpc",
    address: null,
  },
} as const;

export type DuelOutcomeOracleChainKey =
  keyof typeof DUEL_OUTCOME_ORACLE_DEPLOYMENTS;

export type DuelOutcomeOracleDeployment =
  (typeof DUEL_OUTCOME_ORACLE_DEPLOYMENTS)[DuelOutcomeOracleChainKey];
