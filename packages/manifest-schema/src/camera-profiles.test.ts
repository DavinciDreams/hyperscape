/**
 * Faithfulness + defensiveness tests for `CameraProfilesManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  CameraProfilesManifestSchema,
  type CameraProfilesManifest,
} from "./camera-profiles.js";

const reference: CameraProfilesManifest = [
  {
    id: "player.firstPerson",
    name: "First Person",
    description: "Eyes-in-head view.",
    projection: "perspective",
    nearMeters: 0.05,
    farMeters: 1500,
    fov: { baseDegrees: 90, speedWideningDegrees: 5, speedRefForWidening: 8 },
    lag: {
      enabled: false,
      positionStiffness: 20,
      rotationStiffness: 40,
      damping: 1,
    },
    collision: {
      enabled: false,
      probeRadius: 0.2,
      maxPullForwardMeters: 0,
      smoothingSec: 0,
    },
    rig: {
      kind: "first-person",
      eyeOffset: { x: 0, y: 1.7, z: 0 },
      headbobAmplitude: 0.03,
    },
  },
  {
    id: "player.thirdPerson",
    name: "Third Person Over-Shoulder",
    description: "Standard TPS.",
    projection: "perspective",
    nearMeters: 0.1,
    farMeters: 2000,
    fov: { baseDegrees: 75, speedWideningDegrees: 0, speedRefForWidening: 10 },
    lag: {
      enabled: true,
      positionStiffness: 8,
      rotationStiffness: 10,
      damping: 1,
    },
    collision: {
      enabled: true,
      probeRadius: 0.2,
      maxPullForwardMeters: 5,
      smoothingSec: 0.15,
    },
    rig: {
      kind: "third-person",
      armLength: 3,
      socketOffset: { x: 0.5, y: 1.6, z: 0 },
      targetOffset: { x: 0, y: 1.4, z: 0 },
      pitchRangeDegrees: { min: -60, max: 60 },
    },
  },
  {
    id: "editor.freeFly",
    name: "Free Fly (Editor)",
    description: "",
    projection: "perspective",
    nearMeters: 0.1,
    farMeters: 10000,
    fov: { baseDegrees: 75, speedWideningDegrees: 0, speedRefForWidening: 10 },
    lag: {
      enabled: false,
      positionStiffness: 8,
      rotationStiffness: 10,
      damping: 1,
    },
    collision: {
      enabled: false,
      probeRadius: 0.2,
      maxPullForwardMeters: 0,
      smoothingSec: 0,
    },
    rig: {
      kind: "free-fly",
      speedMetersPerSec: 12,
      boostMultiplier: 8,
    },
  },
];

describe("CameraProfilesManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = CameraProfilesManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies block defaults on minimal TPS profile", () => {
    const parsed = CameraProfilesManifestSchema.parse([
      {
        id: "p",
        name: "P",
        rig: {
          kind: "third-person",
          armLength: 3,
          socketOffset: { x: 0, y: 1.6, z: 0 },
          targetOffset: { x: 0, y: 1.4, z: 0 },
          pitchRangeDegrees: { min: -60, max: 60 },
        },
      },
    ]);
    expect(parsed[0].projection).toBe("perspective");
    expect(parsed[0].nearMeters).toBe(0.1);
    expect(parsed[0].farMeters).toBe(2000);
    expect(parsed[0].fov.baseDegrees).toBe(75);
    expect(parsed[0].lag.enabled).toBe(true);
    expect(parsed[0].collision.enabled).toBe(true);
  });

  it("accepts empty manifest", () => {
    expect(CameraProfilesManifestSchema.safeParse([]).success).toBe(true);
  });

  it("rejects duplicate profile ids", () => {
    const bad = [
      {
        id: "dup",
        name: "A",
        rig: { kind: "free-fly", speedMetersPerSec: 10 },
      },
      {
        id: "dup",
        name: "B",
        rig: { kind: "free-fly", speedMetersPerSec: 20 },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects near >= far", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        nearMeters: 100,
        farMeters: 50,
        rig: { kind: "free-fly", speedMetersPerSec: 10 },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects FOV baseDegrees out of [20, 170]", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        fov: {
          baseDegrees: 180,
          speedWideningDegrees: 0,
          speedRefForWidening: 10,
        },
        rig: { kind: "free-fly", speedMetersPerSec: 10 },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects TPS pitchRange with min > max", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        rig: {
          kind: "third-person",
          armLength: 3,
          socketOffset: { x: 0, y: 0, z: 0 },
          targetOffset: { x: 0, y: 0, z: 0 },
          pitchRangeDegrees: { min: 60, max: -60 },
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown rig kind", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        rig: { kind: "banana-cam" },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects third-person armLength <= 0", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        rig: {
          kind: "third-person",
          armLength: 0,
          socketOffset: { x: 0, y: 0, z: 0 },
          targetOffset: { x: 0, y: 0, z: 0 },
          pitchRangeDegrees: { min: -60, max: 60 },
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects top-down pitch > 0 (must look down)", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        rig: {
          kind: "top-down",
          heightMeters: 20,
          pitchDegrees: 10,
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects free-fly boostMultiplier < 1", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        rig: {
          kind: "free-fly",
          speedMetersPerSec: 10,
          boostMultiplier: 0.5,
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects orbit pitch outside (-89, 89)", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        rig: {
          kind: "orbit",
          radiusMeters: 5,
          pitchDegrees: 95,
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects collision probeRadius > 2", () => {
    const bad = [
      {
        id: "p",
        name: "P",
        collision: {
          enabled: true,
          probeRadius: 5,
          maxPullForwardMeters: 10,
          smoothingSec: 0.1,
        },
        rig: { kind: "free-fly", speedMetersPerSec: 10 },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects invalid profile id format", () => {
    const bad = [
      {
        id: "Has Spaces",
        name: "X",
        rig: { kind: "free-fly", speedMetersPerSec: 10 },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("accepts orthographic projection", () => {
    const ok = [
      {
        id: "ortho",
        name: "Ortho",
        projection: "orthographic",
        rig: {
          kind: "top-down",
          heightMeters: 50,
          pitchDegrees: -90,
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts first-person rig with zero headbob", () => {
    const ok = [
      {
        id: "fps",
        name: "FPS",
        rig: {
          kind: "first-person",
          eyeOffset: { x: 0, y: 1.7, z: 0 },
          headbobAmplitude: 0,
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(ok).success).toBe(true);
  });

  it("accepts orbit rig with auto-rotation", () => {
    const ok = [
      {
        id: "menu",
        name: "Menu Orbit",
        rig: {
          kind: "orbit",
          radiusMeters: 4,
          autoRotateDegPerSec: 10,
        },
      },
    ];
    expect(CameraProfilesManifestSchema.safeParse(ok).success).toBe(true);
  });
});
