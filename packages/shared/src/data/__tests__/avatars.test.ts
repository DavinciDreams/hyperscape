import {
  AVATAR_OPTIONS,
  AvatarLOD,
  getAllAvatarLODUrls,
  getAvatarUrlForLOD,
} from "../avatars";

describe("avatar definitions", () => {
  it("does not advertise missing LOD files", () => {
    for (const avatar of AVATAR_OPTIONS) {
      expect(avatar.lod1Url).toBeUndefined();
      expect(avatar.lod2Url).toBeUndefined();
    }
  });

  it("falls back to the base VRM for all LOD requests", () => {
    for (const avatar of AVATAR_OPTIONS) {
      expect(getAvatarUrlForLOD(avatar, AvatarLOD.LOD0)).toBe(avatar.url);
      expect(getAvatarUrlForLOD(avatar, AvatarLOD.LOD1)).toBe(avatar.url);
      expect(getAvatarUrlForLOD(avatar, AvatarLOD.LOD2)).toBe(avatar.url);
      expect(getAllAvatarLODUrls(avatar)).toEqual([avatar.url]);
    }
  });
});
