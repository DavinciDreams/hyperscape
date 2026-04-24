/**
 * Faithfulness + defensiveness tests for `VfxManifestSchema`.
 *
 * Reference pack covers each `VfxKind` plus the curve-anchor path; the
 * negative cases assert that the common author typos (unknown kind,
 * out-of-range hex color, curve without endpoints, duration negative)
 * fail rather than silently accepting garbage.
 */

import { describe, expect, it } from "vitest";

import { VfxManifestSchema, type VfxManifest } from "./vfx.js";

const reference: VfxManifest = [
  {
    id: "hit_slash",
    name: "Slash Hit Burst",
    kind: "impact",
    description: "Generic sword/claw hit burst",
    asset: "asset://vfx/hit_slash.spec.json",
    duration: 0.35,
    color: 0xffaa33,
    glowIntensity: 1.5,
    scale: 1,
    sfxId: "combat_hit_blunt",
    blendMode: "additive",
    attachToSource: false,
    cullable: true,
  },
  {
    id: "level_up_column",
    name: "Level-up Column",
    kind: "column",
    description: "Pillar of light on skill level-up",
    asset: "asset://vfx/level_up.spec.json",
    duration: 1.6,
    color: 0xffff99,
    glowIntensity: 2,
    scale: 1.2,
    blendMode: "additive",
    attachToSource: true,
    cullable: false,
    alphaOverLife: {
      anchors: [
        { t: 0, value: 0 },
        { t: 0.15, value: 1 },
        { t: 1, value: 0 },
      ],
    },
  },
  {
    id: "heal_aura",
    name: "Heal Aura",
    kind: "aura",
    description: "Low sustained green glow while regen is active",
    asset: "asset://vfx/heal_aura.spec.json",
    duration: 0,
    color: 0x55ff77,
    glowIntensity: 0.8,
    scale: 1,
    blendMode: "normal",
    attachToSource: true,
    cullable: false,
  },
];

describe("VfxManifestSchema", () => {
  it("parses the reference pack cleanly", () => {
    const result = VfxManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference pack failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on minimal entry", () => {
    const minimal = [
      {
        id: "fx",
        name: "Fx",
        kind: "burst",
        asset: "asset://vfx/fx.spec.json",
      },
    ];
    const parsed = VfxManifestSchema.parse(minimal);
    expect(parsed[0].duration).toBe(1);
    expect(parsed[0].color).toBe(0xffffff);
    expect(parsed[0].glowIntensity).toBe(1);
    expect(parsed[0].scale).toBe(1);
    expect(parsed[0].blendMode).toBe("normal");
    expect(parsed[0].attachToSource).toBe(false);
    expect(parsed[0].cullable).toBe(false);
    expect(parsed[0].description).toBe("");
  });

  it("rejects unknown kind", () => {
    const bad = [{ ...reference[0], kind: "explosion-mega" }];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown blendMode", () => {
    const bad = [{ ...reference[0], blendMode: "screen" }];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects color above 0xffffff", () => {
    const bad = [{ ...reference[0], color: 0x1000000 }];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative duration", () => {
    const bad = [{ ...reference[0], duration: -0.25 }];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects non-positive scale", () => {
    const bad = [{ ...reference[0], scale: 0 }];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty asset", () => {
    const bad = [{ ...reference[0], asset: "" }];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects curve with fewer than two anchors", () => {
    const bad = [
      {
        ...reference[0],
        alphaOverLife: { anchors: [{ t: 0, value: 0 }] },
      },
    ];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects curve anchor outside [0,1]", () => {
    const bad = [
      {
        ...reference[0],
        alphaOverLife: {
          anchors: [
            { t: 0, value: 0 },
            { t: 1.5, value: 1 },
          ],
        },
      },
    ];
    expect(VfxManifestSchema.safeParse(bad).success).toBe(false);
  });
});
