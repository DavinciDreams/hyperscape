import { afterEach, describe, expect, it, vi } from "vitest";
import { encodeFunctionData } from "viem";
import { EvmTransactionInspector } from "../../../src/arena/services/EvmTransactionInspector";

const GOLD_CLOB_ABI = [
  {
    inputs: [
      { internalType: "uint256", name: "matchId", type: "uint256" },
      { internalType: "bool", name: "isBuy", type: "bool" },
      { internalType: "uint16", name: "price", type: "uint16" },
      { internalType: "uint256", name: "amount", type: "uint256" },
    ],
    name: "placeOrder",
    outputs: [],
    stateMutability: "payable",
    type: "function",
  },
] as const;

describe("EvmTransactionInspector", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("verifies the decoded wager amount instead of msg.value", async () => {
    const inspector = new EvmTransactionInspector();
    const shareAmount = 3n * 10n ** 18n;
    const txValue = 153n * 10n ** 16n;
    const clobAddress = "0x1234567890abcdef1234567890abcdef12345678";
    const wallet = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

    (
      inspector as unknown as {
        bscClient: {
          getTransaction: ReturnType<typeof vi.fn>;
          getTransactionReceipt: ReturnType<typeof vi.fn>;
        };
        bscClobAddress: string;
      }
    ).bscClient = {
      getTransaction: vi.fn().mockResolvedValue({
        to: clobAddress,
        input: encodeFunctionData({
          abi: GOLD_CLOB_ABI,
          functionName: "placeOrder",
          args: [1n, true, 510, shareAmount],
        }),
        value: txValue,
      }),
      getTransactionReceipt: vi.fn().mockResolvedValue({
        status: "success",
        from: wallet,
      }),
    };
    (
      inspector as unknown as {
        bscClobAddress: string;
      }
    ).bscClobAddress = clobAddress;

    const inspected = await inspector.inspectMarketBetTransaction(
      "0xtx",
      "BSC",
      wallet,
    );

    expect(inspected).toEqual({
      fromWallet: wallet,
      amountBaseUnits: shareAmount,
      amountGold: "3",
    });
  });
});
