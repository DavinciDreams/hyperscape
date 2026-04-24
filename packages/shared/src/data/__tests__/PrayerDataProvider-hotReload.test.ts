/**
 * Tests for PrayerDataProvider.hotReload — the entry point the editor's
 * PIE session uses to push prayer manifest edits into the running game
 * without a Stop → Play cycle (Phase B3.1).
 */
import { describe, it, expect, beforeEach } from "vitest";
import {
  prayerDataProvider,
  type PrayersManifest,
} from "../PrayerDataProvider";

function makeManifest(prayers: PrayersManifest["prayers"]): PrayersManifest {
  return { prayers };
}

const BASE_PRAYER = {
  id: "thick_skin",
  name: "Thick Skin",
  description: "+5% Defense",
  icon: "icon_thick_skin",
  level: 1,
  category: "defensive",
  drainEffect: 1,
  bonuses: { defenseMultiplier: 1.05 },
  conflicts: [],
};

describe("PrayerDataProvider.hotReload", () => {
  // Each test starts from a known-good manifest so they don't bleed into
  // each other via the singleton's internal maps.
  beforeEach(() => {
    prayerDataProvider.hotReload(makeManifest([BASE_PRAYER]));
  });

  it("swaps the active manifest and rebuilds the indexes", () => {
    expect(prayerDataProvider.getPrayer("thick_skin")?.name).toBe("Thick Skin");

    prayerDataProvider.hotReload(
      makeManifest([
        {
          ...BASE_PRAYER,
          id: "rock_skin",
          name: "Rock Skin",
          description: "+10% Defense",
          bonuses: { defenseMultiplier: 1.1 },
          level: 10,
        },
      ]),
    );

    // Old prayer is gone; new one is indexed.
    expect(prayerDataProvider.getPrayer("thick_skin")).toBeNull();
    expect(prayerDataProvider.getPrayer("rock_skin")?.name).toBe("Rock Skin");
    expect(prayerDataProvider.getPrayerLevel("rock_skin")).toBe(10);
  });

  it("picks up drainEffect edits without a Stop → Play cycle", () => {
    expect(prayerDataProvider.getPrayerDrainRate("thick_skin")).toBe(1);

    prayerDataProvider.hotReload(
      makeManifest([{ ...BASE_PRAYER, drainEffect: 7 }]),
    );

    expect(prayerDataProvider.getPrayerDrainRate("thick_skin")).toBe(7);
  });

  it("rejects malformed manifests and leaves prior state intact", () => {
    const before = prayerDataProvider.getPrayer("thick_skin");
    expect(before?.name).toBe("Thick Skin");

    // `icon` must be a non-empty string per PrayersManifestSchema.
    expect(() =>
      prayerDataProvider.hotReload(
        makeManifest([{ ...BASE_PRAYER, icon: "" }]),
      ),
    ).toThrow();

    // Prior manifest's data is still reachable.
    expect(prayerDataProvider.getPrayer("thick_skin")?.name).toBe("Thick Skin");
  });
});
