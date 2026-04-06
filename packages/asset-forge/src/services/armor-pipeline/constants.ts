import type { EquipmentSlotName, BulkClass, AttachmentSlotDef } from "./types";

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

/** Predefined 3D attachment points on the avatar skeleton.
 *  Each maps to a VRM humanoid bone with default positioning. */
export const ATTACHMENT_SLOTS: AttachmentSlotDef[] = [
  {
    id: "left_pauldron",
    label: "Left Pauldron",
    boneName: "leftUpperArm",
    defaultOffset: { x: 0, y: 0.05, z: 0 },
    defaultScale: 0.15,
    promptSuggestion:
      "ornate metal shoulder pauldron armor piece, single piece, fantasy RPG style, game asset",
  },
  {
    id: "right_pauldron",
    label: "Right Pauldron",
    boneName: "rightUpperArm",
    defaultOffset: { x: 0, y: 0.05, z: 0 },
    defaultScale: 0.15,
    promptSuggestion:
      "ornate metal shoulder pauldron armor piece, single piece, fantasy RPG style, game asset",
  },
  {
    id: "chest_emblem",
    label: "Chest Emblem",
    boneName: "upperChest",
    defaultOffset: { x: 0, y: 0, z: 0.08 },
    defaultScale: 0.1,
    promptSuggestion:
      "medieval chest emblem crest, ornate metal medallion, fantasy RPG, game asset",
  },
  {
    id: "back_piece",
    label: "Back Piece",
    boneName: "upperChest",
    defaultOffset: { x: 0, y: 0.05, z: -0.1 },
    defaultScale: 0.2,
    promptSuggestion:
      "back cape attachment plate, ornamental wings or shield mount, fantasy RPG, game asset",
  },
  {
    id: "belt_buckle",
    label: "Belt Buckle",
    boneName: "hips",
    defaultOffset: { x: 0, y: 0.02, z: 0.08 },
    defaultScale: 0.08,
    promptSuggestion:
      "ornate belt buckle with pouches, medieval fantasy, game asset",
  },
  {
    id: "left_knee",
    label: "Left Knee Guard",
    boneName: "leftLowerLeg",
    defaultOffset: { x: 0, y: 0.08, z: 0.04 },
    defaultScale: 0.08,
    promptSuggestion:
      "metal knee guard armor piece, single piece, fantasy RPG style, game asset",
  },
  {
    id: "right_knee",
    label: "Right Knee Guard",
    boneName: "rightLowerLeg",
    defaultOffset: { x: 0, y: 0.08, z: 0.04 },
    defaultScale: 0.08,
    promptSuggestion:
      "metal knee guard armor piece, single piece, fantasy RPG style, game asset",
  },
  {
    id: "helmet_crest",
    label: "Helmet Crest",
    boneName: "head",
    defaultOffset: { x: 0, y: 0.15, z: 0 },
    defaultScale: 0.15,
    promptSuggestion:
      "helmet crest plume or horns, ornamental headpiece, fantasy RPG, game asset",
  },
  {
    id: "left_gauntlet",
    label: "Left Gauntlet",
    boneName: "leftHand",
    defaultOffset: { x: 0, y: 0, z: 0 },
    defaultScale: 0.08,
    promptSuggestion:
      "armored gauntlet, metal hand armor with knuckle plates, fantasy RPG, game asset",
  },
  {
    id: "right_gauntlet",
    label: "Right Gauntlet",
    boneName: "rightHand",
    defaultOffset: { x: 0, y: 0, z: 0 },
    defaultScale: 0.08,
    promptSuggestion:
      "armored gauntlet, metal hand armor with knuckle plates, fantasy RPG, game asset",
  },
];

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
