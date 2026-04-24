import { CameraProfilesManifestSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  CameraProfileRegistry,
  UnknownCameraProfileError,
} from "../CameraProfileRegistry.js";

function manifest() {
  return CameraProfilesManifestSchema.parse([
    {
      id: "player.fps",
      name: "Player First-Person",
      rig: {
        kind: "first-person",
        eyeOffset: { x: 0, y: 1.6, z: 0 },
      },
    },
    {
      id: "player.tps",
      name: "Player Third-Person",
      fov: {
        baseDegrees: 70,
        speedWideningDegrees: 10,
        speedRefForWidening: 10,
      },
      rig: {
        kind: "third-person",
        armLength: 3,
        socketOffset: { x: 0, y: 1.5, z: 0 },
        targetOffset: { x: 0, y: 0, z: 0 },
        pitchRangeDegrees: { min: -30, max: 60 },
      },
    },
    {
      id: "editor.free",
      name: "Editor Free-Fly",
      rig: {
        kind: "free-fly",
        speedMetersPerSec: 8,
      },
    },
  ]);
}

describe("CameraProfileRegistry", () => {
  it("indexes profiles by id + rig kind", () => {
    const reg = new CameraProfileRegistry(manifest());
    expect(reg.size).toBe(3);
    expect(reg.has("player.fps")).toBe(true);
    expect(reg.forKind("first-person").map((p) => p.id)).toEqual([
      "player.fps",
    ]);
    expect(reg.forKind("third-person").map((p) => p.id)).toEqual([
      "player.tps",
    ]);
    expect(reg.forKind("free-fly").map((p) => p.id)).toEqual(["editor.free"]);
  });

  it("forKind returns empty list for kinds not in manifest", () => {
    const reg = new CameraProfileRegistry(manifest());
    expect(reg.forKind("top-down")).toEqual([]);
  });

  it("get throws UnknownCameraProfileError on miss", () => {
    const reg = new CameraProfileRegistry(manifest());
    expect(() => reg.get("ghost")).toThrow(UnknownCameraProfileError);
  });

  it("loadFromJson validates before loading", () => {
    const reg = new CameraProfileRegistry();
    reg.loadFromJson([
      {
        id: "solo",
        name: "Solo",
        rig: {
          kind: "orbit",
          radiusMeters: 5,
        },
      },
    ]);
    expect(reg.size).toBe(1);
  });

  it("load replaces prior profiles", () => {
    const reg = new CameraProfileRegistry(manifest());
    reg.load(
      CameraProfilesManifestSchema.parse([
        {
          id: "minimal",
          name: "Minimal",
          rig: {
            kind: "top-down",
            heightMeters: 20,
          },
        },
      ]),
    );
    expect(reg.size).toBe(1);
    expect(reg.has("player.fps")).toBe(false);
  });
});

describe("CameraProfileRegistry — effectiveFovDegrees", () => {
  it("returns baseDegrees when no speed widening", () => {
    const reg = new CameraProfileRegistry(manifest());
    const fps = reg.get("player.fps");
    // default speedWideningDegrees = 0 for player.fps
    expect(reg.effectiveFovDegrees(fps, 10)).toBe(75);
  });

  it("widens linearly toward speedRefForWidening", () => {
    const reg = new CameraProfileRegistry(manifest());
    const tps = reg.get("player.tps");
    // base=70, wide=10, ref=10. At speed=5 → 70 + 10 * 0.5 = 75
    expect(reg.effectiveFovDegrees(tps, 5)).toBe(75);
    // At speed=10 → 70 + 10 * 1 = 80
    expect(reg.effectiveFovDegrees(tps, 10)).toBe(80);
  });

  it("caps widening at speedRefForWidening", () => {
    const reg = new CameraProfileRegistry(manifest());
    const tps = reg.get("player.tps");
    expect(reg.effectiveFovDegrees(tps, 1000)).toBe(80);
  });

  it("rejects negative or non-finite speed", () => {
    const reg = new CameraProfileRegistry(manifest());
    const tps = reg.get("player.tps");
    expect(() => reg.effectiveFovDegrees(tps, -1)).toThrow(TypeError);
    expect(() => reg.effectiveFovDegrees(tps, Number.NaN)).toThrow(TypeError);
  });
});
