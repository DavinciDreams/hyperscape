/**
 * Faithfulness test: a representative stores manifest (general store +
 * weapons shop with buyback) MUST parse cleanly.
 */

import { describe, expect, it } from "vitest";

import { StoresManifestSchema, type StoresManifest } from "./stores.js";

const reference: StoresManifest = [
  {
    id: "general_store_brookhaven",
    name: "Brookhaven General Store",
    description: "Basic adventuring supplies.",
    buyback: true,
    buybackRate: 0.4,
    items: [
      {
        id: "bread",
        itemId: "bread",
        name: "Bread",
        price: 12,
        stockQuantity: 30,
        restockTime: 60,
        category: "food",
      },
      {
        id: "rope",
        itemId: "rope",
        name: "Rope",
        price: 20,
        stockQuantity: -1, // unlimited
        restockTime: 0,
      },
    ],
  },
  {
    id: "weapons_shop_varrock",
    name: "Varrock Weapons",
    buyback: false,
    items: [
      {
        id: "bronze_sword",
        itemId: "bronze_sword",
        name: "Bronze Sword",
        price: 250,
        stockQuantity: 5,
        restockTime: 120,
      },
    ],
  },
];

describe("StoresManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = StoresManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("accepts stockQuantity: -1 as unlimited", () => {
    const ok = [
      {
        ...reference[0],
        items: [{ ...reference[0].items[0], stockQuantity: -1 }],
      },
    ];
    const result = StoresManifestSchema.safeParse(ok);
    expect(result.success).toBe(true);
  });

  it("rejects stockQuantity less than -1", () => {
    const bad = [
      {
        ...reference[0],
        items: [{ ...reference[0].items[0], stockQuantity: -2 }],
      },
    ];
    const result = StoresManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects negative price", () => {
    const bad = [
      {
        ...reference[0],
        items: [{ ...reference[0].items[0], price: -1 }],
      },
    ];
    const result = StoresManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects buybackRate outside [0, 1]", () => {
    const bad = [{ ...reference[0], buybackRate: 1.5 }];
    const result = StoresManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });

  it("rejects empty store id", () => {
    const bad = [{ ...reference[0], id: "" }];
    const result = StoresManifestSchema.safeParse(bad);
    expect(result.success).toBe(false);
  });
});
