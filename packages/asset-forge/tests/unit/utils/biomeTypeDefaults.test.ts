import { describe, it, expect } from "vitest";
import { getBiomeTypeDefaults } from "@/components/WorldStudio/utils/biomeTypeDefaults";

describe("getBiomeTypeDefaults", () => {
  const KNOWN_BIOMES = [
    "plains",
    "forest",
    "valley",
    "mountains",
    "tundra",
    "desert",
    "lakes",
    "swamp",
    "canyon",
  ];

  it("returns defaults for all known biome types", () => {
    for (const biome of KNOWN_BIOMES) {
      const defaults = getBiomeTypeDefaults(biome);
      expect(defaults).toBeDefined();
      expect(defaults.name.length).toBeGreaterThan(0);
    }
  });

  it("returns capitalized name matching the biome type", () => {
    for (const biome of KNOWN_BIOMES) {
      const defaults = getBiomeTypeDefaults(biome);
      // Name should start with uppercase letter
      expect(defaults.name[0]).toBe(defaults.name[0].toUpperCase());
    }
  });

  it("falls back to plains for unknown biome type", () => {
    const unknown = getBiomeTypeDefaults("volcanic");
    const plains = getBiomeTypeDefaults("plains");
    expect(unknown).toBe(plains);
  });

  it("falls back to plains for empty string", () => {
    const result = getBiomeTypeDefaults("");
    const plains = getBiomeTypeDefaults("plains");
    expect(result).toBe(plains);
  });

  it("has valid difficulty levels (0-3)", () => {
    for (const biome of KNOWN_BIOMES) {
      const defaults = getBiomeTypeDefaults(biome);
      expect(defaults.difficultyLevel).toBeGreaterThanOrEqual(0);
      expect(defaults.difficultyLevel).toBeLessThanOrEqual(3);
    }
  });

  it("has valid heightRange tuples", () => {
    for (const biome of KNOWN_BIOMES) {
      const defaults = getBiomeTypeDefaults(biome);
      expect(defaults.heightRange).toHaveLength(2);
      expect(defaults.heightRange[0]).toBeLessThanOrEqual(
        defaults.heightRange[1],
      );
    }
  });

  it("has vegetation config with layers for each biome", () => {
    for (const biome of KNOWN_BIOMES) {
      const defaults = getBiomeTypeDefaults(biome);
      expect(defaults.vegetation).toBeDefined();
      expect(typeof defaults.vegetation.enabled).toBe("boolean");
      expect(Array.isArray(defaults.vegetation.layers)).toBe(true);
    }
  });

  it("vegetation layers have positive density and spacing", () => {
    for (const biome of KNOWN_BIOMES) {
      const defaults = getBiomeTypeDefaults(biome);
      for (const layer of defaults.vegetation.layers) {
        expect(layer.density).toBeGreaterThan(0);
        expect(layer.minSpacing).toBeGreaterThan(0);
      }
    }
  });

  it("returns same reference for same biome type (no unnecessary cloning)", () => {
    const a = getBiomeTypeDefaults("forest");
    const b = getBiomeTypeDefaults("forest");
    expect(a).toBe(b);
  });

  it("different biome types return different objects", () => {
    const forest = getBiomeTypeDefaults("forest");
    const desert = getBiomeTypeDefaults("desert");
    expect(forest).not.toBe(desert);
    expect(forest.name).not.toBe(desert.name);
  });

  it("mountains has higher difficulty than plains", () => {
    const mountains = getBiomeTypeDefaults("mountains");
    const plains = getBiomeTypeDefaults("plains");
    expect(mountains.difficultyLevel).toBeGreaterThan(plains.difficultyLevel);
  });
});
