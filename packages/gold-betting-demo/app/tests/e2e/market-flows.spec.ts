import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { BorshAccountsCoder, type Idl } from "@coral-xyz/anchor";
import { expect, test, type Page } from "@playwright/test";
import { Connection, PublicKey } from "@solana/web3.js";
import { createPublicClient, http, type Address, type Hash } from "viem";

import { GOLD_CLOB_ABI } from "../../src/lib/goldClobAbi";

type E2eState = {
  solanaRpcUrl?: string;
  clobUserBalance?: string;
  solanaTraderPublicKey?: string;
  perpsCharacterId?: string;
  perpsMarketId?: number;
  evmRpcUrl?: string;
  evmChainId?: number;
  evmHeadlessAddress?: string;
  evmGoldClobAddress?: string;
  evmMatchId?: number;
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const statePath = path.resolve(__dirname, "./state.json");
const anchorIdlDir = path.resolve(__dirname, "../../../anchor/target/idl");
const goldClobIdl = JSON.parse(
  fs.readFileSync(path.join(anchorIdlDir, "gold_clob_market.json"), "utf8"),
) as Idl;
const goldPerpsIdl = JSON.parse(
  fs.readFileSync(path.join(anchorIdlDir, "gold_perps_market.json"), "utf8"),
) as Idl;
const clobCoder = new BorshAccountsCoder(goldClobIdl);
const perpsCoder = new BorshAccountsCoder(goldPerpsIdl);
const clobProgramId = new PublicKey(
  (goldClobIdl as Idl & { address: string }).address,
);
const perpsProgramId = new PublicKey(
  (goldPerpsIdl as Idl & { address: string }).address,
);

function loadState(): E2eState {
  return JSON.parse(fs.readFileSync(statePath, "utf8")) as E2eState;
}

function encodeMarketId(marketId: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(marketId, 0);
  return bytes;
}

function derivePerpsPositionPda(owner: PublicKey, marketId: number): PublicKey {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), owner.toBuffer(), encodeMarketId(marketId)],
    perpsProgramId,
  )[0];
}

function bnLikeToBigInt(value: unknown): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") return BigInt(value);
  if (value && typeof value === "object" && "toString" in value) {
    return BigInt((value as { toString: () => string }).toString());
  }
  return 0n;
}

async function readText(page: Page, testId: string): Promise<string> {
  return ((await page.getByTestId(testId).textContent()) || "").trim();
}

async function waitForNewText(
  page: Page,
  testId: string,
  previousValue = "",
  timeoutMs = 180_000,
): Promise<string> {
  let matched = "";
  await expect
    .poll(
      async () => {
        const next = await readText(page, testId);
        if (!next || next === "-" || next === previousValue) {
          return "";
        }
        matched = next;
        return next;
      },
      {
        timeout: timeoutMs,
        intervals: [1_000, 2_000, 5_000],
      },
    )
    .not.toBe("");
  return matched;
}

async function ensureWalletConnected(page: Page): Promise<void> {
  const hasConnectedSolanaWallet = async (): Promise<boolean> => {
    const desktopWalletChip = page
      .getByRole("button", { name: /^SOL\s+[A-Za-z0-9].*/i })
      .first();
    if (await desktopWalletChip.isVisible().catch(() => false)) return true;

    const mobileWalletChip = page
      .getByRole("button", { name: /^◎\s*[A-Za-z0-9].*/i })
      .first();
    if (await mobileWalletChip.isVisible().catch(() => false)) return true;

    return false;
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    if (await hasConnectedSolanaWallet()) return;

    const connectButton = page
      .getByRole("button", {
        name: /connect wallet|select wallet|connect|add sol wallet|connect sol/i,
      })
      .first();
    if (await connectButton.isVisible().catch(() => false)) {
      await connectButton.click();
    }
    await page.waitForTimeout(1_500);
  }

  await expect.poll(hasConnectedSolanaWallet, { timeout: 60_000 }).toBe(true);
}

async function selectChain(
  page: Page,
  chain: "solana" | "bsc" | "base",
): Promise<void> {
  const normalizedChain = chain.toLowerCase();
  const debugSelector = page.getByTestId("e2e-chain-select").first();
  const primarySelector = page.locator("#chain-selector").first();

  await page.waitForLoadState("domcontentloaded");
  await expect
    .poll(
      async () => {
        if (await debugSelector.isVisible().catch(() => false)) return "debug";
        if (await primarySelector.isVisible().catch(() => false))
          return "primary";
        return "";
      },
      {
        timeout: 60_000,
        intervals: [500, 1_000, 2_000, 5_000],
      },
    )
    .not.toBe("");

  if (await debugSelector.isVisible().catch(() => false)) {
    await debugSelector.selectOption(normalizedChain);
    await expect(page.getByTestId("e2e-active-chain")).toHaveText(
      normalizedChain,
    );
    return;
  }

  if (await primarySelector.isVisible().catch(() => false)) {
    await primarySelector.selectOption(normalizedChain);
    await expect(primarySelector).toHaveValue(normalizedChain);
    return;
  }

  const fallbackComboboxes = page.getByRole("combobox");
  const comboboxCount = await fallbackComboboxes.count();
  for (let index = 0; index < comboboxCount; index += 1) {
    const selector = fallbackComboboxes.nth(index);
    if (!(await selector.isVisible().catch(() => false))) continue;

    const options = await selector
      .locator("option")
      .evaluateAll((nodes) =>
        nodes.map((node) => ({
          value: node.getAttribute("value") || "",
          label: (node.textContent || "").trim().toLowerCase(),
        })),
      )
      .catch(() => []);
    const matchingOption = options.find((option) =>
      `${option.value} ${option.label}`.includes(
        normalizedChain === "solana" ? "sol" : normalizedChain,
      ),
    );
    if (!matchingOption) continue;

    await selector.selectOption(matchingOption.value || normalizedChain);
    await expect
      .poll(async () => {
        const value = (
          await selector.inputValue().catch(() => "")
        ).toLowerCase();
        const selectedLabel = (
          (await selector
            .locator("option:checked")
            .textContent()
            .catch(() => "")) || ""
        ).toLowerCase();
        return `${value} ${selectedLabel}`;
      })
      .toContain(normalizedChain === "solana" ? "sol" : normalizedChain);
    return;
  }

  throw new Error(`Unable to locate a visible chain selector for ${chain}`);
}

async function openSolanaAdminPanel(page: Page): Promise<void> {
  const adminToggle = page.getByTestId("solana-clob-admin-toggle");
  if (!(await adminToggle.isVisible().catch(() => false))) return;
  if ((await adminToggle.getAttribute("aria-expanded")) !== "true") {
    await adminToggle.click();
  }
  await expect(page.getByTestId("solana-clob-admin-panel")).toBeVisible();
}

async function expectSolanaTxSuccess(
  connection: Connection,
  signature: string,
  label: string,
): Promise<void> {
  expect(signature, `${label} signature missing`).not.toBe("");
  expect(signature, `${label} signature missing`).not.toBe("-");

  await expect
    .poll(
      async () => {
        const statuses = await connection.getSignatureStatuses([signature], {
          searchTransactionHistory: true,
        });
        const status = statuses.value[0];
        if (!status) return "missing";
        if (status.err) return "failed";
        return status.confirmationStatus || "confirmed";
      },
      {
        timeout: 180_000,
        intervals: [1_000, 2_000, 5_000],
      },
    )
    .not.toBe("missing");

  const statuses = await connection.getSignatureStatuses([signature], {
    searchTransactionHistory: true,
  });
  const status = statuses.value[0];
  expect(status?.err ?? null, `${label} failed on-chain`).toBeNull();
}

async function fetchDecodedAccount<T>(
  connection: Connection,
  coder: BorshAccountsCoder,
  accountName: "UserBalance" | "PositionState",
  address: PublicKey,
): Promise<T | null> {
  const accountInfo = await connection.getAccountInfo(address, "confirmed");
  if (!accountInfo?.data) return null;
  return coder.decode(accountName, accountInfo.data) as T;
}

async function waitForEvmReceipt(
  publicClient: ReturnType<typeof createPublicClient>,
  hash: Hash,
): Promise<void> {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  expect(receipt.status).toBe("success");
}

test.describe("market flows", () => {
  test.setTimeout(600_000);

  test("solana predictions place YES and NO orders and update on-chain shares", async ({
    page,
  }) => {
    const state = loadState();
    const connection = new Connection(
      state.solanaRpcUrl || "http://127.0.0.1:8899",
      "confirmed",
    );
    const userBalanceAddress = new PublicKey(state.clobUserBalance || "");

    await page.goto("/?debug=1");
    await selectChain(page, "solana");
    const expandButton = page.locator('button[title="Expand panel"]').first();
    if (await expandButton.isVisible().catch(() => false)) {
      await expandButton.click();
    }

    const clobPanel = page.getByTestId("solana-clob-panel");
    await expect(clobPanel).toBeVisible({ timeout: 60_000 });
    await openSolanaAdminPanel(page);
    await ensureWalletConnected(page);

    await clobPanel.getByTestId("prediction-amount-input").fill("1");
    await clobPanel.getByTestId("solana-clob-price-input").fill("600");

    const previousYesTx = await readText(page, "solana-clob-place-order-tx");
    await clobPanel.getByTestId("prediction-select-yes").click();
    await clobPanel.getByTestId("prediction-submit").click();

    const yesTx = await waitForNewText(
      page,
      "solana-clob-place-order-tx",
      previousYesTx,
    );
    await expectSolanaTxSuccess(
      connection,
      yesTx.replace(/^Place Order Tx:\s*/i, ""),
      "Solana YES order",
    );

    await expect
      .poll(async () => {
        const balance = await fetchDecodedAccount<{
          yesShares: unknown;
          noShares: unknown;
        }>(connection, clobCoder, "UserBalance", userBalanceAddress);
        return Number(bnLikeToBigInt(balance?.yesShares));
      })
      .toBeGreaterThan(0);

    await clobPanel.getByTestId("solana-clob-price-input").fill("400");
    const previousNoTx = await readText(page, "solana-clob-place-order-tx");
    await clobPanel.getByTestId("prediction-select-no").click();
    await clobPanel.getByTestId("prediction-submit").click();

    const noTx = await waitForNewText(
      page,
      "solana-clob-place-order-tx",
      previousNoTx,
    );
    await expectSolanaTxSuccess(
      connection,
      noTx.replace(/^Place Order Tx:\s*/i, ""),
      "Solana NO order",
    );

    await expect
      .poll(async () => {
        const balance = await fetchDecodedAccount<{
          yesShares: unknown;
          noShares: unknown;
        }>(connection, clobCoder, "UserBalance", userBalanceAddress);
        return {
          yes: Number(bnLikeToBigInt(balance?.yesShares)),
          no: Number(bnLikeToBigInt(balance?.noShares)),
        };
      })
      .toMatchObject({
        yes: expect.any(Number),
        no: expect.any(Number),
      });

    const finalBalance = await fetchDecodedAccount<{
      yesShares: unknown;
      noShares: unknown;
    }>(connection, clobCoder, "UserBalance", userBalanceAddress);
    expect(Number(bnLikeToBigInt(finalBalance?.yesShares))).toBeGreaterThan(0);
    expect(Number(bnLikeToBigInt(finalBalance?.noShares))).toBeGreaterThan(0);
  });

  test("evm predictions place YES and NO orders, resolve, and claim", async ({
    page,
  }) => {
    const state = loadState();
    const rpcUrl = state.evmRpcUrl || "http://127.0.0.1:8545";
    const chainId = Number(state.evmChainId || 97);
    const userAddress = state.evmHeadlessAddress as Address;
    const contractAddress = state.evmGoldClobAddress as Address;
    const matchId = BigInt(state.evmMatchId || 1);
    const publicClient = createPublicClient({
      chain: {
        id: chainId,
        name: "e2e-local-evm",
        nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
        rpcUrls: {
          default: { http: [rpcUrl] },
          public: { http: [rpcUrl] },
        },
      },
      transport: http(rpcUrl),
    });

    await page.goto("/?debug=1");
    await selectChain(page, "bsc");

    const evmPanel = page.getByTestId("evm-panel").first();
    await expect(evmPanel).toBeVisible({ timeout: 60_000 });
    await expect(evmPanel.getByTestId("evm-place-order")).toBeEnabled({
      timeout: 60_000,
    });

    await evmPanel.getByTestId("evm-amount-input").fill("1");

    const previousYesTx = await readText(page, "evm-last-order-tx");
    await evmPanel.getByTestId("evm-pick-yes").click();
    await evmPanel.getByTestId("evm-place-order").click();
    const yesTx = await waitForNewText(
      page,
      "evm-last-order-tx",
      previousYesTx,
    );
    await waitForEvmReceipt(publicClient, yesTx as Hash);

    await expect
      .poll(async () => {
        const result = (await publicClient.readContract({
          address: contractAddress,
          abi: GOLD_CLOB_ABI,
          functionName: "positions",
          args: [matchId, userAddress],
        })) as [bigint, bigint];
        return result[0];
      })
      .toBeGreaterThan(0n);

    const previousNoTx = await readText(page, "evm-last-order-tx");
    await evmPanel.getByTestId("evm-pick-no").click();
    await evmPanel.getByTestId("evm-place-order").click();
    const noTx = await waitForNewText(page, "evm-last-order-tx", previousNoTx);
    await waitForEvmReceipt(publicClient, noTx as Hash);

    await expect
      .poll(async () => {
        const result = (await publicClient.readContract({
          address: contractAddress,
          abi: GOLD_CLOB_ABI,
          functionName: "positions",
          args: [matchId, userAddress],
        })) as [bigint, bigint];
        return result[1];
      })
      .toBeGreaterThan(0n);

    const previousResolveTx = await readText(page, "evm-last-resolve-tx");
    await evmPanel.getByTestId("evm-resolve-match").click();
    const resolveTx = await waitForNewText(
      page,
      "evm-last-resolve-tx",
      previousResolveTx,
    );
    await waitForEvmReceipt(publicClient, resolveTx as Hash);

    const previousClaimTx = await readText(page, "evm-last-claim-tx");
    let claimTx = "";
    try {
      claimTx = await waitForNewText(
        page,
        "evm-last-claim-tx",
        previousClaimTx,
        20_000,
      );
    } catch {
      await evmPanel.getByTestId("evm-claim-payout").click();
      claimTx = await waitForNewText(
        page,
        "evm-last-claim-tx",
        previousClaimTx,
      );
    }
    await waitForEvmReceipt(publicClient, claimTx as Hash);

    const finalPosition = (await publicClient.readContract({
      address: contractAddress,
      abi: GOLD_CLOB_ABI,
      functionName: "positions",
      args: [matchId, userAddress],
    })) as [bigint, bigint];
    expect(finalPosition[0]).toBe(0n);
    expect(finalPosition[1]).toBeGreaterThan(0n);
  });

  test("solana perps open and close LONG and SHORT positions on-chain", async ({
    page,
  }) => {
    const state = loadState();
    const connection = new Connection(
      state.solanaRpcUrl || "http://127.0.0.1:8899",
      "confirmed",
    );
    const trader = new PublicKey(state.solanaTraderPublicKey || "");
    const marketId = Number(state.perpsMarketId || 0);
    const positionPda = derivePerpsPositionPda(trader, marketId);

    await page.goto("/?debug=1");
    await selectChain(page, "solana");
    await ensureWalletConnected(page);

    await page
      .locator('[data-testid="surface-mode-models"]:visible')
      .first()
      .click();
    await expect(page.getByTestId("models-market-view")).toBeVisible({
      timeout: 60_000,
    });

    await page
      .getByTestId(`models-market-row-${state.perpsCharacterId}`)
      .click({ force: true });
    await page.getByTestId("models-market-collateral-input").fill("0.2");
    await page.getByTestId("models-market-leverage-2x").click();

    await expect(page.getByTestId("models-market-open-long")).toBeEnabled({
      timeout: 60_000,
    });
    await page.getByTestId("models-market-open-long").click();

    await expect
      .poll(async () => {
        const position = await fetchDecodedAccount<{
          size: unknown;
        }>(connection, perpsCoder, "PositionState", positionPda);
        return Number(bnLikeToBigInt(position?.size));
      })
      .toBeGreaterThan(0);

    await expect(page.getByTestId("models-market-close-position")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("models-market-close-position").click();

    await expect
      .poll(async () => {
        const position = await fetchDecodedAccount<{
          size: unknown;
        }>(connection, perpsCoder, "PositionState", positionPda);
        return position ? Number(bnLikeToBigInt(position.size)) : 0;
      })
      .toBe(0);

    await page.getByTestId("models-market-open-short").click();

    await expect
      .poll(async () => {
        const position = await fetchDecodedAccount<{
          size: unknown;
        }>(connection, perpsCoder, "PositionState", positionPda);
        return Number(bnLikeToBigInt(position?.size));
      })
      .toBeLessThan(0);

    await expect(page.getByTestId("models-market-close-position")).toBeVisible({
      timeout: 60_000,
    });
    await page.getByTestId("models-market-close-position").click();

    await expect
      .poll(async () => {
        const position = await fetchDecodedAccount<{
          size: unknown;
        }>(connection, perpsCoder, "PositionState", positionPda);
        return position ? Number(bnLikeToBigInt(position.size)) : 0;
      })
      .toBe(0);
  });
});
