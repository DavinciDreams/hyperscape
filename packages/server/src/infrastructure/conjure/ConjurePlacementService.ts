import type { Position3D, World } from "@hyperscape/shared";

type SpawnedEntity = {
  id: string;
};

type EntitySpawner = {
  spawnEntity(config: ConjureItemConfig): Promise<SpawnedEntity | null>;
};

type ConjureItemConfig = {
  id: string;
  type: "item";
  name: string;
  position: Position3D;
  rotation: { x: number; y: number; z: number; w: number };
  scale: Position3D;
  visible: boolean;
  interactable: boolean;
  interactionType: "pickup";
  interactionDistance: number;
  description: string;
  model: string;
  modelPath: string;
  modelScale: number;
  groundOffset: number;
  itemType: string;
  itemId: string;
  quantity: number;
  stackable: boolean;
  value: number;
  weight: number;
  rarity: "common";
  requirements: Record<string, number>;
  effects: Array<{ type: string; value: number; duration: number }>;
  armorSlot: string | null;
  examine: string;
  iconPath: string;
  healAmount: number;
  properties: {
    movementComponent: null;
    combatComponent: null;
    healthComponent: null;
    visualComponent: null;
    health: { current: number; max: number };
    level: number;
    itemId: string;
    harvestable: boolean;
    dialogue: string[];
    quantity: number;
    stackable: boolean;
    value: number;
    weight: number;
    rarity: "common";
    conjureId: string;
    assetId?: string;
    prompt?: string;
  };
};

export type ConjurePlacementInput = {
  conjureId: string;
  assetId?: string;
  prompt?: string;
  modelUrl: string;
  position: Position3D;
  modelScale?: number;
};

export type ConjurePlacementResult = {
  entityId: string;
  conjureId: string;
  itemId: string;
  modelUrl: string;
  position: Position3D;
};

export class ConjurePlacementError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode = 500) {
    super(message);
    this.name = "ConjurePlacementError";
    this.statusCode = statusCode;
  }
}

const MAX_COORDINATE_ABS = 20000;
const DEFAULT_MODEL_SCALE = 1;

function sanitizeText(value: string | undefined, fallback: string): string {
  const clean = value?.trim();
  return clean ? clean.slice(0, 80) : fallback;
}

function sanitizePosition(position: Position3D): Position3D {
  const coordinates = [position.x, position.y, position.z];
  if (
    coordinates.some(
      (coordinate) =>
        !Number.isFinite(coordinate) ||
        Math.abs(coordinate) > MAX_COORDINATE_ABS,
    )
  ) {
    throw new ConjurePlacementError("Invalid conjure placement position", 400);
  }

  return {
    x: position.x,
    y: position.y,
    z: position.z,
  };
}

function groundPosition(world: World, position: Position3D): Position3D {
  const terrain = world.getSystem("terrain") as
    | { getHeightAt?: (x: number, z: number) => number | null }
    | undefined;
  const terrainHeight = terrain?.getHeightAt?.(position.x, position.z);

  if (
    typeof terrainHeight !== "number" ||
    !Number.isFinite(terrainHeight)
  ) {
    return position;
  }

  return {
    x: position.x,
    y: terrainHeight + 0.2,
    z: position.z,
  };
}

function clampModelScale(scale: number | undefined): number {
  if (typeof scale !== "number" || !Number.isFinite(scale)) {
    return DEFAULT_MODEL_SCALE;
  }
  return Math.max(0.1, Math.min(4, scale));
}

export class ConjurePlacementService {
  constructor(private readonly world: World) {}

  async place(input: ConjurePlacementInput): Promise<ConjurePlacementResult> {
    const conjureId = input.conjureId.trim();
    const modelUrl = input.modelUrl.trim();
    if (!conjureId) {
      throw new ConjurePlacementError("Conjure id is required", 400);
    }
    if (!modelUrl) {
      throw new ConjurePlacementError("Conjure result has no model URL", 409);
    }

    const entityManager = this.world.getSystem("entity-manager") as
      | EntitySpawner
      | undefined;
    if (!entityManager) {
      throw new ConjurePlacementError("Entity manager is not ready", 503);
    }

    const cleanPosition = sanitizePosition(input.position);
    const groundedPosition = groundPosition(this.world, cleanPosition);
    const itemId = `conjure_${conjureId.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
    const name = sanitizeText(input.prompt, "Conjured Asset");
    const modelScale = clampModelScale(input.modelScale);
    const config: ConjureItemConfig = {
      id: `${itemId}_${Date.now()}`,
      type: "item",
      name,
      position: groundedPosition,
      rotation: { x: 0, y: 0, z: 0, w: 1 },
      scale: { x: 1, y: 1, z: 1 },
      visible: true,
      interactable: true,
      interactionType: "pickup",
      interactionDistance: 2,
      description: `Conjured from: ${name}`,
      model: modelUrl,
      modelPath: modelUrl,
      modelScale,
      groundOffset: 0,
      itemType: "conjured",
      itemId,
      quantity: 1,
      stackable: false,
      value: 0,
      weight: 0,
      rarity: "common",
      requirements: {},
      effects: [],
      armorSlot: null,
      examine: `A conjured object: ${name}`,
      iconPath: "",
      healAmount: 0,
      properties: {
        movementComponent: null,
        combatComponent: null,
        healthComponent: null,
        visualComponent: null,
        health: { current: 1, max: 1 },
        level: 1,
        itemId,
        harvestable: false,
        dialogue: [],
        quantity: 1,
        stackable: false,
        value: 0,
        weight: 0,
        rarity: "common",
        conjureId,
        assetId: input.assetId,
        prompt: input.prompt,
      },
    };

    const entity = await entityManager.spawnEntity(config);
    if (!entity) {
      throw new ConjurePlacementError("Unable to place conjured entity", 500);
    }

    return {
      entityId: entity.id,
      conjureId,
      itemId,
      modelUrl,
      position: groundedPosition,
    };
  }
}
