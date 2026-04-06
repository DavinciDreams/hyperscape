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

/** RuneScape-style material tier definitions */
export interface MaterialTier {
  id: string;
  label: string;
  color: string; // hex for UI badge
  prompt: string;
  style: string;
}

export const MATERIAL_TIERS: MaterialTier[] = [
  {
    id: "bronze",
    label: "Bronze",
    color: "#cd7f32",
    prompt:
      "plain bronze plate armor, all one color, warm brown-copper metal, no designs, simple flat surface",
    style: "runescape style, solid color, simple RPG armor",
  },
  {
    id: "iron",
    label: "Iron",
    color: "#6b6b6b",
    prompt:
      "plain iron plate armor, all one color, dark grey metal, no designs, simple flat surface",
    style: "runescape style, solid color, simple RPG armor",
  },
  {
    id: "steel",
    label: "Steel",
    color: "#b8b8b8",
    prompt:
      "plain steel plate armor, all one color, bright silver metal, no designs, simple flat surface",
    style: "runescape style, solid color, simple RPG armor",
  },
  {
    id: "mithril",
    label: "Mithril",
    color: "#4a7ab5",
    prompt:
      "plain mithril plate armor, all one color, blue-purple metal, no designs, simple flat surface",
    style: "runescape style, solid color, simple RPG armor",
  },
  {
    id: "adamant",
    label: "Adamant",
    color: "#2d6b3f",
    prompt:
      "plain adamant plate armor, all one color, dark green metal, no designs, simple flat surface",
    style: "runescape style, solid color, simple RPG armor",
  },
  {
    id: "rune",
    label: "Rune",
    color: "#3db8c4",
    prompt:
      "plain rune plate armor, all one color, cyan-teal metal, no designs, simple flat surface",
    style: "runescape style, solid color, simple RPG armor",
  },
];
