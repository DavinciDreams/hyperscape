/**
 * Tests for DataManager.hotReloadItemsMetadata — the editor's entry point
 * for pushing item metadata edits (name, description, examine, value, etc.)
 * into the running PIE session without a Stop → Play cycle (Phase B3).
 *
 * As of the combat-stats extension the partial now also accepts
 * optional combat fields (weaponType/attackType/attackSpeed/attackRange/
 * is2h/equipSlot/equipable/bonuses/requirements) plus consumable/
 * prayer fields (healAmount/prayerXp/buryLevelRequired). Omitted
 * fields are preserved, so editors that only touch metadata never
 * have to round-trip the combat payload.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { ITEMS } from "../items";
import { dataManager } from "../DataManager";
import { ItemRarity } from "../../types/entities/entities";
import { ItemType } from "../../types/game/item-types";

function seedItem(): void {
  ITEMS.clear();
  ITEMS.set("bronze_sword", {
    id: "bronze_sword",
    name: "Bronze sword",
    type: ItemType.WEAPON,
    value: 10,
    weight: 2,
    description: "A basic bronze sword.",
    examine: "A crude blade.",
    tradeable: true,
    stackable: false,
    rarity: ItemRarity.COMMON,
    modelPath: null,
    iconPath: "/icons/bronze_sword.png",
    // Combat stats that must be preserved through metadata edits:
    attackSpeed: 4,
    attackRange: 1,
  });
}

describe("DataManager.hotReloadItemsMetadata", () => {
  beforeEach(() => {
    seedItem();
  });

  it("overlays editor metadata onto the live item and preserves untouched fields", () => {
    dataManager.hotReloadItemsMetadata([
      {
        id: "bronze_sword",
        name: "Rusty bronze sword",
        value: 99,
        description: "An edited description.",
        examine: "Looks worn.",
      },
    ]);

    const after = ITEMS.get("bronze_sword");
    expect(after?.name).toBe("Rusty bronze sword");
    expect(after?.value).toBe(99);
    expect(after?.description).toBe("An edited description.");
    expect(after?.examine).toBe("Looks worn.");

    // Combat stats must NOT have been clobbered — the editor didn't supply
    // them and the merge must preserve what was there.
    expect(after?.attackSpeed).toBe(4);
    expect(after?.attackRange).toBe(1);
    expect(after?.type).toBe(ItemType.WEAPON);
  });

  it("skips rows whose id is not already in ITEMS", () => {
    const sizeBefore = ITEMS.size;

    dataManager.hotReloadItemsMetadata([
      { id: "nonexistent_item", name: "Ghost", value: 1 },
    ]);

    expect(ITEMS.size).toBe(sizeBefore);
    expect(ITEMS.has("nonexistent_item")).toBe(false);
  });

  it("uses existing values when overlay fields are undefined", () => {
    dataManager.hotReloadItemsMetadata([
      // Only name and value supplied — everything else should fall back.
      { id: "bronze_sword", name: "Renamed", value: 50 },
    ]);

    const after = ITEMS.get("bronze_sword");
    expect(after?.name).toBe("Renamed");
    expect(after?.value).toBe(50);
    expect(after?.weight).toBe(2);
    expect(after?.description).toBe("A basic bronze sword.");
    expect(after?.examine).toBe("A crude blade.");
    expect(after?.tradeable).toBe(true);
    expect(after?.rarity).toBe(ItemRarity.COMMON);
  });

  it("updates combat stats when the overlay supplies them", () => {
    dataManager.hotReloadItemsMetadata([
      {
        id: "bronze_sword",
        name: "Bronze sword",
        value: 10,
        attackSpeed: 5,
        attackRange: 2,
      },
    ]);

    const after = ITEMS.get("bronze_sword");
    expect(after?.attackSpeed).toBe(5);
    expect(after?.attackRange).toBe(2);
  });

  it("replaces bonuses with the full overlay object (no shallow merge)", () => {
    // Seed with a bonus set that has stab + slash. The overlay supplies
    // only crush — because bonuses is an object-valued field it is a
    // whole-object replacement, not a field-level merge.
    ITEMS.set("bronze_sword", {
      ...ITEMS.get("bronze_sword")!,
      bonuses: {
        // Simple-bonuses shape — values are arbitrary for the test.
        attack: 5,
        strength: 4,
        defense: 0,
      },
    });

    dataManager.hotReloadItemsMetadata([
      {
        id: "bronze_sword",
        name: "Bronze sword",
        value: 10,
        bonuses: {
          attack: 7,
          strength: 6,
          defense: 0,
        },
      },
    ]);

    const after = ITEMS.get("bronze_sword");
    expect(after?.bonuses?.attack).toBe(7);
    expect(after?.bonuses?.strength).toBe(6);
  });

  it("preserves combat fields when the overlay omits them", () => {
    // Pre-populate fuller combat profile.
    ITEMS.set("bronze_sword", {
      ...ITEMS.get("bronze_sword")!,
      attackSpeed: 4,
      attackRange: 1,
      is2h: false,
      requirements: { level: 1, skills: { attack: 1 } },
    });

    // Metadata-only overlay — combat fields untouched.
    dataManager.hotReloadItemsMetadata([
      { id: "bronze_sword", name: "Renamed", value: 11 },
    ]);

    const after = ITEMS.get("bronze_sword");
    expect(after?.name).toBe("Renamed");
    expect(after?.attackSpeed).toBe(4);
    expect(after?.attackRange).toBe(1);
    expect(after?.is2h).toBe(false);
    expect(after?.requirements?.level).toBe(1);
    expect(after?.requirements?.skills.attack).toBe(1);
  });

  it("updates requirements.level when supplied", () => {
    dataManager.hotReloadItemsMetadata([
      {
        id: "bronze_sword",
        name: "Bronze sword",
        value: 10,
        requirements: { level: 20, skills: { attack: 20 } },
      },
    ]);

    const after = ITEMS.get("bronze_sword");
    expect(after?.requirements?.level).toBe(20);
    expect(after?.requirements?.skills.attack).toBe(20);
  });

  it("updates healAmount for consumables", () => {
    ITEMS.set("cake", {
      id: "cake",
      name: "Cake",
      type: ItemType.CONSUMABLE,
      value: 5,
      weight: 0.5,
      description: "Tasty.",
      examine: "A cake.",
      tradeable: true,
      stackable: false,
      rarity: ItemRarity.COMMON,
      modelPath: null,
      iconPath: "/icons/cake.png",
      healAmount: 4,
    });

    dataManager.hotReloadItemsMetadata([
      {
        id: "cake",
        name: "Cake",
        value: 5,
        healAmount: 12,
      },
    ]);

    expect(ITEMS.get("cake")?.healAmount).toBe(12);
  });
});
