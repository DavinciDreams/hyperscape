import type { EquipmentSlotName, BulkClass } from "./types";

/** Available VRM avatars (served from /game-assets/avatars/) */
export const AVATAR_OPTIONS: { label: string; url: string }[] = [
  { label: "Male 01", url: "/game-assets/avatars/avatar-male-01.vrm" },
  { label: "Male 02", url: "/game-assets/avatars/avatar-male-02.vrm" },
  { label: "Female 01", url: "/game-assets/avatars/avatar-female-01.vrm" },
  { label: "Female 02", url: "/game-assets/avatars/avatar-female-02.vrm" },
  { label: "Steve", url: "/game-assets/avatars/steve.vrm" },
];

export const ALL_SLOTS: EquipmentSlotName[] = [
  "helmet",
  "body",
  "legs",
  "boots",
  "gloves",
];
export const ALL_BULKS: BulkClass[] = ["skin", "cloth", "leather", "plate"];

export const SLOT_LABELS: Record<EquipmentSlotName, string> = {
  helmet: "Helmet",
  body: "Body",
  legs: "Legs",
  boots: "Boots",
  gloves: "Gloves",
};

/** Mixamo animation URLs for armor preview */
export const ANIMATION_URLS = {
  walking: "/rigs/animations/walking.glb",
  running: "/rigs/animations/running.glb",
} as const;
