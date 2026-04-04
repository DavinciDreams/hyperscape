import { expect } from "@playwright/test";
import { evmTest } from "./fixtures/wallet-fixtures";
import {
  completeFullLoginFlow,
  selectFirstCharacter,
  waitForAppReady,
  waitForCharacterSelect,
  waitForGameClient,
} from "./fixtures/privy-helpers";
import { BASE_URL } from "./fixtures/test-config";
import { openPanel, waitForPlayerSpawn } from "./utils/testWorld";

const test = evmTest;

test.describe("Prayer login sync", () => {
  test.setTimeout(6 * 60 * 1000);

  test("restores active prayer state after reload without needing a prayer toggle", async ({
    page,
    wallet,
  }) => {
    await waitForAppReady(page, BASE_URL);
    expect(await completeFullLoginFlow(page, wallet)).toBe(true);
    await waitForPlayerSpawn(page, 30_000);

    await openPanel(page, "prayer");
    const prayerPanel = page.locator('[data-panel="prayer"]');
    const thickSkinButton = prayerPanel.getByRole("button", {
      name: /Thick Skin/i,
    });
    await thickSkinButton.click();
    await expect(thickSkinButton).toHaveAttribute("aria-pressed", "true");

    await page.reload({ waitUntil: "domcontentloaded" });

    const backInGameDirectly = await waitForGameClient(page, 10_000);
    if (!backInGameDirectly) {
      expect(await waitForCharacterSelect(page, 20_000)).toBe(true);
      await selectFirstCharacter(page);
      expect(await completeFullLoginFlow(page, wallet)).toBe(true);
    }

    await waitForPlayerSpawn(page, 30_000);

    const prayerCacheState = await page.waitForFunction(() => {
      const win = window as unknown as {
        world?: {
          entities?: {
            player?: {
              id?: string;
            };
          };
          network?: {
            id?: string | null;
            lastPrayerStateByPlayerId?: Record<
              string,
              {
                points: number;
                maxPoints: number;
                active: string[];
              }
            >;
          };
        };
      };

      const playerId =
        win.world?.entities?.player?.id ?? win.world?.network?.id ?? null;
      if (!playerId) {
        return null;
      }

      const prayerState =
        win.world?.network?.lastPrayerStateByPlayerId?.[playerId] ?? null;
      if (
        !prayerState ||
        !Array.isArray(prayerState.active) ||
        !prayerState.active.includes("thick_skin")
      ) {
        return null;
      }

      return {
        points: prayerState.points,
        maxPoints: prayerState.maxPoints,
        active: prayerState.active,
      };
    });

    const prayerState = (await prayerCacheState.jsonValue()) as {
      points: number;
      maxPoints: number;
      active: string[];
    } | null;

    expect(prayerState).not.toBeNull();
    if (!prayerState) {
      throw new Error("Prayer state cache was unavailable after reconnect");
    }

    expect(prayerState.active).toContain("thick_skin");
    expect(prayerState.points).toBeGreaterThanOrEqual(0);
    expect(prayerState.maxPoints).toBeGreaterThan(0);

    await openPanel(page, "prayer");
    await expect(
      prayerPanel.getByRole("button", { name: /Thick Skin/i }),
    ).toHaveAttribute("aria-pressed", "true");
    await expect(
      prayerPanel.getByText(
        `${prayerState.points} / ${prayerState.maxPoints}`,
        {
          exact: false,
        },
      ),
    ).toBeVisible();
  });
});
