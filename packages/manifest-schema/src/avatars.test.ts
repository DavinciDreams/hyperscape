import { describe, expect, it } from "vitest";

import { AvatarsManifestSchema, type AvatarsManifest } from "./avatars.js";

const hyperscapeAvatars: AvatarsManifest = {
  $schema: "hyperforge.avatars.v1",
  lodDistances: {
    lod0ToLod1: 30,
    lod1ToLod2: 60,
  },
  avatars: [
    {
      id: "male-01",
      name: "Male Avatar 01",
      url: "asset://avatars/avatar-male-01.vrm",
      lod1Url: "asset://avatars/avatar-male-01_lod1.vrm",
      lod2Url: "asset://avatars/avatar-male-01_lod2.vrm",
      previewPath: "/avatars/avatar-male-01.vrm",
      description: "Standard male humanoid avatar",
    },
    {
      id: "male-02",
      name: "Male Avatar 02",
      url: "asset://avatars/avatar-male-02.vrm",
      lod1Url: "asset://avatars/avatar-male-02_lod1.vrm",
      lod2Url: "asset://avatars/avatar-male-02_lod2.vrm",
      previewPath: "/avatars/avatar-male-02.vrm",
      description: "Standard male humanoid avatar",
    },
    {
      id: "female-01",
      name: "Female Avatar 01",
      url: "asset://avatars/avatar-female-01.vrm",
      lod1Url: "asset://avatars/avatar-female-01_lod1.vrm",
      lod2Url: "asset://avatars/avatar-female-01_lod2.vrm",
      previewPath: "/avatars/avatar-female-01.vrm",
      description: "Standard female humanoid avatar",
    },
    {
      id: "female-02",
      name: "Female Avatar 02",
      url: "asset://avatars/avatar-female-02.vrm",
      lod1Url: "asset://avatars/avatar-female-02_lod1.vrm",
      lod2Url: "asset://avatars/avatar-female-02_lod2.vrm",
      previewPath: "/avatars/avatar-female-02.vrm",
      description: "Standard female humanoid avatar",
    },
  ],
};

describe("AvatarsManifestSchema", () => {
  it("parses the Hyperscape reference manifest cleanly", () => {
    const result = AvatarsManifestSchema.safeParse(hyperscapeAvatars);
    if (!result.success) {
      throw new Error(
        `Hyperscape avatars manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("rejects empty avatars list", () => {
    const bad = { ...hyperscapeAvatars, avatars: [] };
    expect(AvatarsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects zero LOD distance", () => {
    const bad = {
      ...hyperscapeAvatars,
      lodDistances: { lod0ToLod1: 0, lod1ToLod2: 60 },
    };
    expect(AvatarsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects missing url on avatar", () => {
    const bad = {
      ...hyperscapeAvatars,
      avatars: [
        {
          id: "bad",
          name: "Bad",
          previewPath: "/a.vrm",
        },
      ],
    };
    expect(AvatarsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
