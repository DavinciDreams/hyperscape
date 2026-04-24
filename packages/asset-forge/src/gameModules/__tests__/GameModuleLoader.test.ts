import { describe, it, expect } from "vitest";
import { loadGameModule, ModuleValidationError } from "../GameModuleLoader";
import { EntityTypeRegistry } from "../EntityTypeRegistry";
import { HyperiaModule } from "../hyperia";
import { buildModulePalette } from "../utils/buildModulePalette";

// ============== Minimal valid module fixture ==============

function makeMinimalModule() {
  return {
    id: "test-game",
    name: "Test Game",
    version: "1.0.0",
    paletteCategories: [
      {
        id: "objects",
        label: "Objects",
        icon: "Box",
        description: "Game objects",
      },
    ],
    outlinerLayers: [
      { id: "objects", label: "Objects", icon: "Box", entityTypes: ["coin"] },
    ],
    entityTypes: [
      {
        id: "coin",
        name: "Coin",
        icon: "Circle",
        color: "#ffd700",
        paletteCategory: "objects",
        outlinerLayer: "objects",
        selectionType: "coin",
        storage: { stateKey: "coins", type: "array" },
        spatial: true,
        fields: [
          {
            key: "name",
            label: "Name",
            type: "string",
            section: "General",
            required: true,
            default: "Gold Coin",
          },
          {
            key: "value",
            label: "Value",
            type: "number",
            section: "General",
            default: 10,
            config: { min: 1, max: 1000, step: 1 },
          },
          {
            key: "position",
            label: "Position",
            type: "position",
            section: "Transform",
            default: { x: 0, y: 0, z: 0 },
          },
        ],
        defaults: {
          name: "Gold Coin",
          value: 10,
          position: { x: 0, y: 0, z: 0 },
        },
        marker: { shape: "sphere", scale: 0.3, yOffset: 0.5 },
        templates: [
          { id: "gold-coin", name: "Gold Coin", defaults: { value: 10 } },
          { id: "silver-coin", name: "Silver Coin", defaults: { value: 5 } },
        ],
      },
    ],
  };
}

// ============== loadGameModule tests ==============

describe("loadGameModule", () => {
  it("loads a valid minimal module", () => {
    const mod = loadGameModule(makeMinimalModule());
    expect(mod.id).toBe("test-game");
    expect(mod.name).toBe("Test Game");
    expect(mod.entityTypes).toHaveLength(1);
    expect(mod.entityTypes[0].id).toBe("coin");
  });

  it("loads the HyperiaModule (round-trip through JSON)", () => {
    // Simulate JSON serialization/deserialization
    const json = JSON.parse(JSON.stringify(HyperiaModule));
    const mod = loadGameModule(json);
    expect(mod.id).toBe("hyperia");
    expect(mod.entityTypes.length).toBeGreaterThanOrEqual(15);
  });

  it("rejects missing id", () => {
    const raw = makeMinimalModule();
    (raw as Record<string, unknown>).id = "";
    expect(() => loadGameModule(raw)).toThrow(ModuleValidationError);
  });

  it("rejects missing entityTypes", () => {
    const raw = makeMinimalModule();
    (raw as Record<string, unknown>).entityTypes = "not-array";
    expect(() => loadGameModule(raw)).toThrow(ModuleValidationError);
  });

  it("rejects invalid field type", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].fields[0].type = "invalid" as never;
    expect(() => loadGameModule(raw)).toThrow(/invalid field type/);
  });

  it("rejects invalid marker shape", () => {
    const raw = makeMinimalModule();
    (raw.entityTypes[0].marker as Record<string, unknown>).shape = "pyramid";
    expect(() => loadGameModule(raw)).toThrow(/invalid shape/);
  });

  it("rejects duplicate entity type ids", () => {
    const raw = makeMinimalModule();
    raw.entityTypes.push({ ...raw.entityTypes[0], selectionType: "coin2" });
    expect(() => loadGameModule(raw)).toThrow(/duplicate entity type id/);
  });

  it("rejects duplicate selection types", () => {
    const raw = makeMinimalModule();
    raw.entityTypes.push({ ...raw.entityTypes[0], id: "coin2" });
    expect(() => loadGameModule(raw)).toThrow(/duplicate selectionType/);
  });

  it("rejects entity type referencing unknown palette category", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].paletteCategory = "nonexistent";
    expect(() => loadGameModule(raw)).toThrow(/unknown paletteCategory/);
  });

  it("rejects entity type referencing unknown outliner layer", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].outlinerLayer = "nonexistent";
    expect(() => loadGameModule(raw)).toThrow(/unknown outlinerLayer/);
  });

  it("rejects non-boolean spatial", () => {
    const raw = makeMinimalModule();
    (raw.entityTypes[0] as Record<string, unknown>).spatial = "yes";
    expect(() => loadGameModule(raw)).toThrow(/expected boolean/);
  });

  it("validates stateRoot if present", () => {
    const raw = makeMinimalModule();
    (raw.entityTypes[0].storage as Record<string, unknown>).stateRoot =
      "invalid";
    expect(() => loadGameModule(raw)).toThrow(
      /must be "extendedLayers" or "audioLayers"/,
    );
  });

  it("accepts valid stateRoot", () => {
    const raw = makeMinimalModule();
    (raw.entityTypes[0].storage as Record<string, unknown>).stateRoot =
      "audioLayers";
    const mod = loadGameModule(raw);
    expect(mod.entityTypes[0].storage.stateRoot).toBe("audioLayers");
  });

  it("preserves optional terrain config", () => {
    const raw = makeMinimalModule();
    (raw as Record<string, unknown>).terrain = {
      enabled: true,
      tileSize: 8,
      biomes: ["grass", "rock"],
      procgen: false,
    };
    const mod = loadGameModule(raw);
    expect(mod.terrain?.enabled).toBe(true);
    expect(mod.terrain?.tileSize).toBe(8);
  });

  it("accepts quaternion field type", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].fields.push({
      key: "orientation",
      label: "Orientation",
      type: "quaternion",
      section: "Transform",
      default: { x: 0, y: 0, z: 0, w: 1 },
    } as never);
    const mod = loadGameModule(raw);
    const field = mod.entityTypes[0].fields.find(
      (f) => f.key === "orientation",
    );
    expect(field?.type).toBe("quaternion");
  });

  it("accepts keybinding field type", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].fields.push({
      key: "hotkey",
      label: "Hotkey",
      type: "keybinding",
      section: "Input",
      default: "Ctrl+K",
    } as never);
    const mod = loadGameModule(raw);
    const field = mod.entityTypes[0].fields.find((f) => f.key === "hotkey");
    expect(field?.type).toBe("keybinding");
  });

  it("accepts curve field type", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].fields.push({
      key: "xpCurve",
      label: "XP Curve",
      type: "curve",
      section: "Progression",
      default: [
        { x: 0, y: 0 },
        { x: 50, y: 1000 },
        { x: 99, y: 13034431 },
      ],
    } as never);
    const mod = loadGameModule(raw);
    const field = mod.entityTypes[0].fields.find((f) => f.key === "xpCurve");
    expect(field?.type).toBe("curve");
  });

  it("accepts asset-ref field type with assetType config", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].fields.push({
      key: "modelUrl",
      label: "Model",
      type: "asset-ref",
      section: "Appearance",
      default: "",
      config: { assetType: "model" },
    } as never);
    const mod = loadGameModule(raw);
    const field = mod.entityTypes[0].fields.find((f) => f.key === "modelUrl");
    expect(field?.type).toBe("asset-ref");
    expect(field?.config?.assetType).toBe("model");
  });

  it("accepts color-ramp field type", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].fields.push({
      key: "difficultyRamp",
      label: "Difficulty Ramp",
      type: "color-ramp",
      section: "Appearance",
      default: [
        { stop: 0, color: "#2ecc71" },
        { stop: 0.5, color: "#f1c40f" },
        { stop: 1, color: "#e74c3c" },
      ],
    } as never);
    const mod = loadGameModule(raw);
    const field = mod.entityTypes[0].fields.find(
      (f) => f.key === "difficultyRamp",
    );
    expect(field?.type).toBe("color-ramp");
  });

  it("accepts scalar storage with customSections", () => {
    const raw = makeMinimalModule();
    raw.entityTypes[0].storage = {
      stateKey: "coinSettings",
      type: "scalar",
    } as never;
    (raw.entityTypes[0] as Record<string, unknown>).customSections = [
      { title: "Coin Settings", widgetId: "CoinSettingsWidget" },
    ];
    const mod = loadGameModule(raw);
    expect(mod.entityTypes[0].storage.type).toBe("scalar");
    expect(mod.entityTypes[0].customSections).toBeDefined();
    expect(mod.entityTypes[0].customSections?.[0].widgetId).toBe(
      "CoinSettingsWidget",
    );
  });

  it("rejects customSection with missing widgetId", () => {
    const raw = makeMinimalModule();
    (raw.entityTypes[0] as Record<string, unknown>).customSections = [
      { title: "Missing WidgetId" },
    ];
    expect(() => loadGameModule(raw)).toThrow(/widgetId/);
  });

  it("rejects customSection with missing title", () => {
    const raw = makeMinimalModule();
    (raw.entityTypes[0] as Record<string, unknown>).customSections = [
      { widgetId: "SomeWidget" },
    ];
    expect(() => loadGameModule(raw)).toThrow(/title/);
  });
});

// ============== EntityTypeRegistry tests ==============

describe("EntityTypeRegistry", () => {
  const registry = new EntityTypeRegistry(HyperiaModule);

  it("indexes all Hyperia entity types", () => {
    expect(registry.getAll().length).toBe(HyperiaModule.entityTypes.length);
  });

  it("looks up by type ID", () => {
    expect(registry.get("npc")?.name).toBe("NPC");
    expect(registry.get("spawnPoint")?.name).toBe("Spawn Point");
    expect(registry.get("nonexistent")).toBeUndefined();
  });

  it("looks up by selection type", () => {
    expect(registry.getBySelectionType("mobSpawn")?.id).toBe("mobSpawn");
    expect(registry.getBySelectionType("waterBody")?.id).toBe("waterBody");
  });

  it("looks up by storage key", () => {
    expect(registry.getByStorageKey("npcs")?.id).toBe("npc");
    expect(registry.getByStorageKey("dangerSources")?.id).toBe("dangerSource");
  });

  it("looks up by palette category", () => {
    const worldFeatures = registry.getByPaletteCategory("world-features");
    expect(worldFeatures.length).toBeGreaterThanOrEqual(2);
    expect(worldFeatures.map((s) => s.id)).toContain("spawnPoint");
    expect(worldFeatures.map((s) => s.id)).toContain("teleport");
  });

  it("looks up by outliner layer", () => {
    const audio = registry.getByOutlinerLayer("audio");
    expect(audio.length).toBe(3);
    expect(audio.map((s) => s.id)).toContain("musicZone");
    expect(audio.map((s) => s.id)).toContain("ambientZone");
    expect(audio.map((s) => s.id)).toContain("sfxTrigger");
  });

  it("has() and hasSelectionType()", () => {
    expect(registry.has("npc")).toBe(true);
    expect(registry.has("unknown")).toBe(false);
    expect(registry.hasSelectionType("poi")).toBe(true);
    expect(registry.hasSelectionType("unknown")).toBe(false);
  });

  it("returns empty array for unknown category", () => {
    expect(registry.getByPaletteCategory("nonexistent")).toEqual([]);
  });

  it("identifies audio entities by stateRoot", () => {
    const musicSchema = registry.get("musicZone");
    expect(musicSchema?.storage.stateRoot).toBe("audioLayers");
    const npcSchema = registry.get("npc");
    expect(npcSchema?.storage.stateRoot).toBeUndefined();
  });

  it("identifies source-tracked entities", () => {
    expect(registry.get("mobSpawn")?.tracksSource).toBe(true);
    expect(registry.get("resource")?.tracksSource).toBe(true);
    expect(registry.get("npc")?.tracksSource).toBeUndefined();
  });
});

// ============== buildModulePalette tests ==============

describe("buildModulePalette", () => {
  it("builds categories from a minimal module", () => {
    const mod = loadGameModule(makeMinimalModule());
    const cats = buildModulePalette(mod);
    expect(cats).toHaveLength(1);
    expect(cats[0].id).toBe("objects");
    expect(cats[0].label).toBe("Objects");
    expect(cats[0].items).toHaveLength(2); // gold-coin + silver-coin templates
  });

  it("creates items from templates", () => {
    const mod = loadGameModule(makeMinimalModule());
    const cats = buildModulePalette(mod);
    const items = cats[0].items;
    expect(items[0].id).toBe("gold-coin");
    expect(items[0].name).toBe("Gold Coin");
    expect(items[0].entityTypeId).toBe("coin");
    expect(items[0].templateId).toBe("gold-coin");
    expect(items[0].defaults.value).toBe(10);
    expect(items[1].id).toBe("silver-coin");
    expect(items[1].defaults.value).toBe(5);
  });

  it("creates a default item for types without templates", () => {
    const raw = makeMinimalModule();
    delete (raw.entityTypes[0] as Record<string, unknown>).templates;
    const mod = loadGameModule(raw);
    const cats = buildModulePalette(mod);
    expect(cats[0].items).toHaveLength(1);
    expect(cats[0].items[0].id).toBe("coin");
    expect(cats[0].items[0].name).toBe("Coin");
  });

  it("builds categories for HyperiaModule", () => {
    const cats = buildModulePalette(HyperiaModule);
    expect(cats.length).toBeGreaterThanOrEqual(8);
    const catIds = cats.map((c) => c.id);
    expect(catIds).toContain("npcs");
    expect(catIds).toContain("world-features");
    expect(catIds).toContain("creatures");
    expect(catIds).toContain("audio");
  });

  it("merges schema defaults with template defaults", () => {
    const mod = loadGameModule(makeMinimalModule());
    const cats = buildModulePalette(mod);
    const goldCoin = cats[0].items[0];
    // Should have schema defaults (name, position) merged with template defaults (value)
    expect(goldCoin.defaults.name).toBe("Gold Coin");
    expect(goldCoin.defaults.position).toEqual({ x: 0, y: 0, z: 0 });
    expect(goldCoin.defaults.value).toBe(10);
  });

  it("omits empty categories", () => {
    const raw = makeMinimalModule();
    raw.paletteCategories.push({
      id: "empty",
      label: "Empty",
      icon: "X",
      description: "No entities",
    });
    const mod = loadGameModule(raw);
    const cats = buildModulePalette(mod);
    expect(cats.find((c) => c.id === "empty")).toBeUndefined();
  });
});
