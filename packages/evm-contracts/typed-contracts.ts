import type {
  BaseContract,
  BigNumberish,
  BytesLike,
  ContractRunner,
  ContractTransactionResponse,
  Signer,
} from "ethers";
import { ethers } from "hardhat";

type PayableOverrides = {
  value?: BigNumberish;
};

export type GoldClobMatch = {
  status: bigint;
  winner: bigint;
  yesPool: bigint;
  noPool: bigint;
};

export type GoldClobPosition = {
  yesShares: bigint;
  noShares: bigint;
};

export type GoldClobOrder = {
  id: bigint;
  price: bigint;
  isBuy: boolean;
  maker: string;
  amount: bigint;
  filled: bigint;
  matchId: bigint;
};

export type GoldClobQueue = {
  head: bigint;
  tail: bigint;
};

export type PerpPosition = {
  size: bigint;
  margin: bigint;
  entryPrice: bigint;
  lastFundingRate: bigint;
};

interface TypedContract<Self extends BaseContract> extends BaseContract {
  connect(runner: ContractRunner | null): Self;
  waitForDeployment(): Promise<this>;
  getAddress(): Promise<string>;
}

export interface GoldClobContract extends TypedContract<GoldClobContract> {
  createMatch(): Promise<ContractTransactionResponse>;
  placeOrder(
    matchId: BigNumberish,
    isBuy: boolean,
    price: BigNumberish,
    amount: BigNumberish,
    overrides?: PayableOverrides,
  ): Promise<ContractTransactionResponse>;
  resolveMatch(
    matchId: BigNumberish,
    winner: BigNumberish,
  ): Promise<ContractTransactionResponse>;
  claim(matchId: BigNumberish): Promise<ContractTransactionResponse>;
  cancelOrder(
    matchId: BigNumberish,
    orderId: BigNumberish,
    price: BigNumberish,
  ): Promise<ContractTransactionResponse>;
  clearGarbage(
    matchId: BigNumberish,
    isBuy: boolean,
    price: BigNumberish,
    limit: BigNumberish,
  ): Promise<ContractTransactionResponse>;
  matches(matchId: BigNumberish): Promise<GoldClobMatch>;
  positions(matchId: BigNumberish, trader: string): Promise<GoldClobPosition>;
  orders(orderId: BigNumberish): Promise<GoldClobOrder>;
  orderQueues(
    matchId: BigNumberish,
    isBuy: boolean,
    price: BigNumberish,
  ): Promise<GoldClobQueue>;
  bestBids(matchId: BigNumberish): Promise<bigint>;
  bestAsks(matchId: BigNumberish): Promise<bigint>;
  nextOrderId(): Promise<bigint>;
  tradeTreasuryFeeBps(): Promise<bigint>;
  tradeMarketMakerFeeBps(): Promise<bigint>;
  winningsMarketMakerFeeBps(): Promise<bigint>;
}

export interface SkillOracleContract extends TypedContract<SkillOracleContract> {
  updateAgentSkill(
    agentId: BytesLike,
    mu: BigNumberish,
    sigma: BigNumberish,
  ): Promise<ContractTransactionResponse>;
}

export interface MockERC20Contract extends TypedContract<MockERC20Contract> {
  mint(to: string, amount: BigNumberish): Promise<ContractTransactionResponse>;
  approve(
    spender: string,
    amount: BigNumberish,
  ): Promise<ContractTransactionResponse>;
  balanceOf(account: string): Promise<bigint>;
}

export interface AgentPerpEngineContract extends TypedContract<AgentPerpEngineContract> {
  modifyPosition(
    agentId: BytesLike,
    marginDelta: BigNumberish,
    sizeDelta: BigNumberish,
  ): Promise<ContractTransactionResponse>;
  liquidate(
    agentId: BytesLike,
    trader: string,
  ): Promise<ContractTransactionResponse>;
  positions(agentId: BytesLike, trader: string): Promise<PerpPosition>;
}

export interface AgentPerpEngineNativeContract extends TypedContract<AgentPerpEngineNativeContract> {
  modifyPosition(
    agentId: BytesLike,
    sizeDelta: BigNumberish,
    overrides?: PayableOverrides,
  ): Promise<ContractTransactionResponse>;
  withdrawMargin(
    agentId: BytesLike,
    amount: BigNumberish,
  ): Promise<ContractTransactionResponse>;
  positions(agentId: BytesLike, trader: string): Promise<PerpPosition>;
}

export async function deployGoldClob(
  treasury: string,
  marketMaker: string,
  runner?: Signer,
): Promise<GoldClobContract> {
  const factory = runner
    ? await ethers.getContractFactory("GoldClob", runner)
    : await ethers.getContractFactory("GoldClob");
  return (await factory.deploy(
    treasury,
    marketMaker,
  )) as unknown as GoldClobContract;
}

export async function deploySkillOracle(
  initialBasePrice: BigNumberish,
  runner?: Signer,
): Promise<SkillOracleContract> {
  const factory = runner
    ? await ethers.getContractFactory("SkillOracle", runner)
    : await ethers.getContractFactory("SkillOracle");
  return (await factory.deploy(
    initialBasePrice,
  )) as unknown as SkillOracleContract;
}

export async function deployMockErc20(
  name: string,
  symbol: string,
  runner?: Signer,
): Promise<MockERC20Contract> {
  const factory = runner
    ? await ethers.getContractFactory("MockERC20", runner)
    : await ethers.getContractFactory("MockERC20");
  return (await factory.deploy(name, symbol)) as unknown as MockERC20Contract;
}

export async function deployAgentPerpEngine(
  oracleAddress: string,
  marginTokenAddress: string,
  skewScale: BigNumberish,
  runner?: Signer,
): Promise<AgentPerpEngineContract> {
  const factory = runner
    ? await ethers.getContractFactory("AgentPerpEngine", runner)
    : await ethers.getContractFactory("AgentPerpEngine");
  return (await factory.deploy(
    oracleAddress,
    marginTokenAddress,
    skewScale,
  )) as unknown as AgentPerpEngineContract;
}

export async function deployAgentPerpEngineNative(
  oracleAddress: string,
  skewScale: BigNumberish,
  runner?: Signer,
): Promise<AgentPerpEngineNativeContract> {
  const factory = runner
    ? await ethers.getContractFactory("AgentPerpEngineNative", runner)
    : await ethers.getContractFactory("AgentPerpEngineNative");
  return (await factory.deploy(
    oracleAddress,
    skewScale,
  )) as unknown as AgentPerpEngineNativeContract;
}
