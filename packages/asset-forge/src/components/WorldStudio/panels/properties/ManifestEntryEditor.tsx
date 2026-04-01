/**
 * ManifestEntryEditor — Form-based editors for all manifest entry types
 *
 * Provides inline editing for combat spells, prayers, recipes, ammunition,
 * runes, items, and other manifest data directly within the ManifestBrowserPanel.
 */

import {
  Plus,
  X,
  Sparkles,
  Swords,
  BookOpen,
  Flame,
  Shield,
} from "lucide-react";
import React, { useCallback } from "react";

import type {
  ManifestCombatSpell,
  ManifestPrayer,
  ManifestRecipe,
  ManifestAmmunition,
  ManifestRune,
  ManifestItem,
  ManifestNPC,
} from "../../types";
import { useWorldStudio } from "../../WorldStudioContext";
import {
  NumberInput,
  TextInput,
  SelectInput,
  Toggle,
} from "./PropertyControls";

// ============== COMBAT SPELL EDITOR ==============

export function CombatSpellEditor({ spell }: { spell: ManifestCombatSpell }) {
  const { state, actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<ManifestCombatSpell>) => {
      const updated = state.manifests.combatSpells.map((s) =>
        s.id === spell.id ? { ...s, ...updates } : s,
      );
      actions.updateManifestCombatSpells(updated);
    },
    [state.manifests.combatSpells, spell.id, actions],
  );

  const updateRune = useCallback(
    (idx: number, updates: Partial<{ runeId: string; quantity: number }>) => {
      const newRunes = [...spell.runes];
      newRunes[idx] = { ...newRunes[idx], ...updates };
      update({ runes: newRunes });
    },
    [spell.runes, update],
  );

  const removeRune = useCallback(
    (idx: number) => {
      update({ runes: spell.runes.filter((_, i) => i !== idx) });
    },
    [spell.runes, update],
  );

  const addRune = useCallback(() => {
    update({ runes: [...spell.runes, { runeId: "", quantity: 1 }] });
  }, [spell.runes, update]);

  return (
    <div className="px-3 py-2 bg-bg-tertiary/20 border-y border-border-primary/30 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-1">
        <Swords size={10} />
        <span className="uppercase font-medium">Edit Spell</span>
      </div>
      <TextInput
        label="Name"
        value={spell.name}
        onChange={(name) => update({ name })}
      />
      <NumberInput
        label="Level"
        value={spell.level}
        onChange={(level) => update({ level })}
        min={1}
        max={99}
      />
      <NumberInput
        label="Max Hit"
        value={spell.baseMaxHit}
        onChange={(baseMaxHit) => update({ baseMaxHit })}
        min={1}
        max={50}
      />
      <NumberInput
        label="Base XP"
        value={spell.baseXp}
        onChange={(baseXp) => update({ baseXp })}
        min={0}
        max={500}
      />
      <SelectInput
        label="Element"
        value={spell.element}
        onChange={(element) => update({ element })}
        options={[
          { value: "air", label: "Air" },
          { value: "water", label: "Water" },
          { value: "earth", label: "Earth" },
          { value: "fire", label: "Fire" },
        ]}
      />
      <TextInput
        label="Tier"
        value={spell.tier}
        onChange={(tier) => update({ tier })}
      />
      {spell.attackSpeed != null && (
        <NumberInput
          label="Atk Speed"
          value={spell.attackSpeed}
          onChange={(attackSpeed) => update({ attackSpeed })}
          min={1}
          max={10}
          unit="ticks"
        />
      )}

      {/* Rune costs */}
      <div className="mt-1">
        <div className="text-[9px] text-text-tertiary uppercase mb-0.5">
          Rune Costs
        </div>
        {spell.runes.map((rune, idx) => (
          <div key={idx} className="flex items-center gap-1 mb-0.5">
            <input
              type="text"
              value={rune.runeId}
              onChange={(e) => updateRune(idx, { runeId: e.target.value })}
              className="flex-1 px-1 py-0.5 text-[10px] bg-bg-tertiary border border-border-primary rounded text-text-primary"
              placeholder="Rune ID"
            />
            <input
              type="number"
              value={rune.quantity}
              onChange={(e) =>
                updateRune(idx, { quantity: Number(e.target.value) })
              }
              className="w-12 px-1 py-0.5 text-[10px] bg-bg-tertiary border border-border-primary rounded text-text-primary text-center"
              min={1}
            />
            <button
              className="p-0.5 text-text-tertiary hover:text-red-400"
              onClick={() => removeRune(idx)}
            >
              <X size={8} />
            </button>
          </div>
        ))}
        <button
          className="text-[9px] text-primary/80 hover:text-primary flex items-center gap-0.5 mt-0.5"
          onClick={addRune}
        >
          <Plus size={8} />
          Add Rune
        </button>
      </div>
    </div>
  );
}

// ============== PRAYER EDITOR ==============

export function PrayerEditor({ prayer }: { prayer: ManifestPrayer }) {
  const { state, actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<ManifestPrayer>) => {
      const updated = state.manifests.prayers.map((p) =>
        p.id === prayer.id ? { ...p, ...updates } : p,
      );
      actions.updateManifestPrayers(updated);
    },
    [state.manifests.prayers, prayer.id, actions],
  );

  const updateBonus = useCallback(
    (key: string, value: number) => {
      update({ bonuses: { ...prayer.bonuses, [key]: value } });
    },
    [prayer.bonuses, update],
  );

  return (
    <div className="px-3 py-2 bg-bg-tertiary/20 border-y border-border-primary/30 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-1">
        <Shield size={10} />
        <span className="uppercase font-medium">Edit Prayer</span>
      </div>
      <TextInput
        label="Name"
        value={prayer.name}
        onChange={(name) => update({ name })}
      />
      <TextInput
        label="Description"
        value={prayer.description}
        onChange={(description) => update({ description })}
      />
      <NumberInput
        label="Level"
        value={prayer.level}
        onChange={(level) => update({ level })}
        min={1}
        max={99}
      />
      <TextInput
        label="Category"
        value={prayer.category}
        onChange={(category) => update({ category })}
      />
      <NumberInput
        label="Drain Rate"
        value={prayer.drainEffect}
        onChange={(drainEffect) => update({ drainEffect })}
        min={0}
        max={100}
      />

      {/* Bonuses */}
      {Object.keys(prayer.bonuses).length > 0 && (
        <div className="mt-1">
          <div className="text-[9px] text-text-tertiary uppercase mb-0.5">
            Bonuses
          </div>
          {Object.entries(prayer.bonuses).map(([stat, value]) => (
            <div key={stat} className="flex items-center gap-1 mb-0.5">
              <span className="text-[10px] text-text-tertiary capitalize w-16 truncate">
                {stat}
              </span>
              <input
                type="number"
                value={value}
                onChange={(e) => updateBonus(stat, Number(e.target.value))}
                className="w-16 px-1 py-0.5 text-[10px] bg-bg-tertiary border border-border-primary rounded text-text-primary text-center"
              />
            </div>
          ))}
        </div>
      )}

      {/* Conflicts */}
      {prayer.conflicts.length > 0 && (
        <div className="mt-1">
          <div className="text-[9px] text-text-tertiary uppercase mb-0.5">
            Conflicts
          </div>
          <div className="text-[10px] text-text-secondary pl-1">
            {prayer.conflicts.join(", ")}
          </div>
        </div>
      )}
    </div>
  );
}

// ============== RECIPE EDITOR ==============

export function RecipeEditor({ recipe }: { recipe: ManifestRecipe }) {
  const { state, actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<ManifestRecipe>) => {
      const updated = state.manifests.recipes.map((r) =>
        r.id === recipe.id ? { ...r, ...updates } : r,
      );
      actions.updateManifestRecipes(updated);
    },
    [state.manifests.recipes, recipe.id, actions],
  );

  const updateInput = useCallback(
    (idx: number, updates: Partial<{ itemId: string; quantity: number }>) => {
      const newInputs = [...recipe.inputs];
      newInputs[idx] = { ...newInputs[idx], ...updates };
      update({ inputs: newInputs });
    },
    [recipe.inputs, update],
  );

  const removeInput = useCallback(
    (idx: number) => {
      update({ inputs: recipe.inputs.filter((_, i) => i !== idx) });
    },
    [recipe.inputs, update],
  );

  const addInput = useCallback(() => {
    update({ inputs: [...recipe.inputs, { itemId: "", quantity: 1 }] });
  }, [recipe.inputs, update]);

  return (
    <div className="px-3 py-2 bg-bg-tertiary/20 border-y border-border-primary/30 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-1">
        <Flame size={10} />
        <span className="uppercase font-medium">Edit Recipe</span>
      </div>
      <TextInput
        label="Skill"
        value={recipe.skill}
        onChange={(skill) => update({ skill })}
      />
      <TextInput
        label="Output"
        value={recipe.output ?? ""}
        onChange={(output) => update({ output })}
      />
      <NumberInput
        label="Level"
        value={recipe.level}
        onChange={(level) => update({ level })}
        min={1}
        max={99}
      />
      <NumberInput
        label="XP"
        value={recipe.xp}
        onChange={(xp) => update({ xp })}
        min={0}
        max={10000}
      />
      {recipe.ticks != null && (
        <NumberInput
          label="Ticks"
          value={recipe.ticks}
          onChange={(ticks) => update({ ticks })}
          min={1}
          max={100}
          unit="ticks"
        />
      )}
      {recipe.category && (
        <TextInput
          label="Category"
          value={recipe.category}
          onChange={(category) => update({ category })}
        />
      )}

      {/* Inputs */}
      <div className="mt-1">
        <div className="text-[9px] text-text-tertiary uppercase mb-0.5">
          Inputs
        </div>
        {recipe.inputs.map((input, idx) => (
          <div key={idx} className="flex items-center gap-1 mb-0.5">
            <input
              type="text"
              value={input.itemId}
              onChange={(e) => updateInput(idx, { itemId: e.target.value })}
              className="flex-1 px-1 py-0.5 text-[10px] bg-bg-tertiary border border-border-primary rounded text-text-primary"
              placeholder="Item ID"
            />
            <input
              type="number"
              value={input.quantity}
              onChange={(e) =>
                updateInput(idx, { quantity: Number(e.target.value) })
              }
              className="w-12 px-1 py-0.5 text-[10px] bg-bg-tertiary border border-border-primary rounded text-text-primary text-center"
              min={1}
            />
            <button
              className="p-0.5 text-text-tertiary hover:text-red-400"
              onClick={() => removeInput(idx)}
            >
              <X size={8} />
            </button>
          </div>
        ))}
        <button
          className="text-[9px] text-primary/80 hover:text-primary flex items-center gap-0.5 mt-0.5"
          onClick={addInput}
        >
          <Plus size={8} />
          Add Input
        </button>
      </div>
    </div>
  );
}

// ============== AMMUNITION EDITOR ==============

export function AmmunitionEditor({ ammo }: { ammo: ManifestAmmunition }) {
  const { state, actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<ManifestAmmunition>) => {
      const updated = state.manifests.ammunition.map((a) =>
        a.id === ammo.id ? { ...a, ...updates } : a,
      );
      actions.updateManifestAmmunition(updated);
    },
    [state.manifests.ammunition, ammo.id, actions],
  );

  return (
    <div className="px-3 py-2 bg-bg-tertiary/20 border-y border-border-primary/30 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-1">
        <Sparkles size={10} />
        <span className="uppercase font-medium">Edit Ammunition</span>
      </div>
      <TextInput
        label="Name"
        value={ammo.name}
        onChange={(name) => update({ name })}
      />
      <NumberInput
        label="Ranged Str"
        value={ammo.rangedStrength}
        onChange={(rangedStrength) => update({ rangedStrength })}
        min={0}
        max={200}
      />
      <NumberInput
        label="Req Level"
        value={ammo.requiredRangedLevel}
        onChange={(requiredRangedLevel) => update({ requiredRangedLevel })}
        min={1}
        max={99}
      />
      {ammo.requiredBowTier != null && (
        <NumberInput
          label="Bow Tier"
          value={ammo.requiredBowTier}
          onChange={(requiredBowTier) => update({ requiredBowTier })}
          min={0}
          max={10}
        />
      )}
    </div>
  );
}

// ============== RUNE EDITOR ==============

export function RuneEditor({ rune }: { rune: ManifestRune }) {
  const { state, actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<ManifestRune>) => {
      const updated = state.manifests.runes.map((r) =>
        r.id === rune.id ? { ...r, ...updates } : r,
      );
      actions.updateManifestRunes(updated);
    },
    [state.manifests.runes, rune.id, actions],
  );

  return (
    <div className="px-3 py-2 bg-bg-tertiary/20 border-y border-border-primary/30 space-y-1.5">
      <div className="flex items-center gap-1 text-[10px] text-text-tertiary mb-1">
        <BookOpen size={10} />
        <span className="uppercase font-medium">Edit Rune</span>
      </div>
      <TextInput
        label="Name"
        value={rune.name}
        onChange={(name) => update({ name })}
      />
      <SelectInput
        label="Element"
        value={rune.element ?? "none"}
        onChange={(element) =>
          update({ element: element === "none" ? null : element })
        }
        options={[
          { value: "none", label: "None" },
          { value: "air", label: "Air" },
          { value: "water", label: "Water" },
          { value: "earth", label: "Earth" },
          { value: "fire", label: "Fire" },
        ]}
      />
      <Toggle
        label="Stackable"
        value={rune.stackable}
        onChange={(stackable) => update({ stackable })}
      />
    </div>
  );
}

// ============== ITEM EDITOR ==============

export function ItemEditor({ item }: { item: ManifestItem }) {
  const { state, actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<ManifestItem>) => {
      const updated = state.manifests.items.map((i) =>
        i.id === item.id ? { ...i, ...updates } : i,
      );
      actions.updateManifestItems(updated);
    },
    [state.manifests.items, item.id, actions],
  );

  return (
    <div className="px-3 py-2 bg-bg-tertiary/20 border-y border-border-primary/30 space-y-1.5">
      <TextInput
        label="Name"
        value={item.name}
        onChange={(name) => update({ name })}
      />
      <TextInput
        label="Examine"
        value={item.examine ?? ""}
        onChange={(examine) => update({ examine: examine || undefined })}
      />
      {item.value != null && (
        <NumberInput
          label="Value"
          value={item.value}
          onChange={(value) => update({ value })}
          min={0}
          max={999999}
          unit="gp"
        />
      )}
      {item.levelRequired != null && (
        <NumberInput
          label="Req Level"
          value={item.levelRequired}
          onChange={(levelRequired) => update({ levelRequired })}
          min={1}
          max={99}
        />
      )}
      {item.tier && (
        <TextInput
          label="Tier"
          value={item.tier}
          onChange={(tier) => update({ tier })}
        />
      )}
      {item.rarity && (
        <SelectInput
          label="Rarity"
          value={item.rarity}
          onChange={(rarity) => update({ rarity })}
          options={[
            { value: "common", label: "Common" },
            { value: "uncommon", label: "Uncommon" },
            { value: "rare", label: "Rare" },
            { value: "epic", label: "Epic" },
            { value: "legendary", label: "Legendary" },
          ]}
        />
      )}
      <Toggle
        label="Tradeable"
        value={item.tradeable ?? true}
        onChange={(tradeable) => update({ tradeable })}
      />
      <Toggle
        label="Stackable"
        value={item.stackable ?? false}
        onChange={(stackable) => update({ stackable })}
      />
      {item.equipSlot && (
        <TextInput
          label="Equip Slot"
          value={item.equipSlot}
          onChange={(equipSlot) => update({ equipSlot })}
        />
      )}
    </div>
  );
}

// ============== NPC MANIFEST EDITOR ==============

export function NPCManifestEditor({ npc }: { npc: ManifestNPC }) {
  const { state, actions } = useWorldStudio();

  const update = useCallback(
    (updates: Partial<ManifestNPC>) => {
      const updated = state.manifests.npcs.map((n) =>
        n.id === npc.id ? { ...n, ...updates } : n,
      );
      actions.updateManifestNPCs(updated);
    },
    [state.manifests.npcs, npc.id, actions],
  );

  return (
    <div className="px-3 py-2 bg-bg-tertiary/20 border-y border-border-primary/30 space-y-1.5">
      <TextInput
        label="Name"
        value={npc.name}
        onChange={(name) => update({ name })}
      />
      <TextInput
        label="Description"
        value={npc.description}
        onChange={(description) => update({ description })}
      />
      <SelectInput
        label="Category"
        value={npc.category}
        onChange={(category) =>
          update({ category: category as ManifestNPC["category"] })
        }
        options={[
          { value: "mob", label: "Mob" },
          { value: "boss", label: "Boss" },
          { value: "neutral", label: "Neutral" },
          { value: "quest", label: "Quest" },
        ]}
      />
      <div className="flex gap-1">
        <NumberInput
          label="Min Lv"
          value={npc.levelRange[0]}
          onChange={(min) => update({ levelRange: [min, npc.levelRange[1]] })}
          min={1}
          max={99}
        />
        <NumberInput
          label="Max Lv"
          value={npc.levelRange[1]}
          onChange={(max) => update({ levelRange: [npc.levelRange[0], max] })}
          min={1}
          max={99}
        />
      </div>
      <TextInput
        label="Model"
        value={npc.appearance.modelPath}
        onChange={(modelPath) =>
          update({ appearance: { ...npc.appearance, modelPath } })
        }
      />
      {npc.appearance.scale != null && (
        <NumberInput
          label="Scale"
          value={npc.appearance.scale}
          onChange={(scale) =>
            update({ appearance: { ...npc.appearance, scale } })
          }
          min={0.1}
          max={10}
        />
      )}
    </div>
  );
}

// ============== ENTRY EDITOR ROUTER ==============

/**
 * Routes to the appropriate editor based on manifest name and entry ID.
 * Returns null if no editor is available for the given manifest type.
 */
export function ManifestFormEditor({
  manifestName,
  entryId,
}: {
  manifestName: string;
  entryId: string;
}): React.ReactElement | null {
  const { state } = useWorldStudio();
  const manifests = state.manifests;

  switch (manifestName) {
    case "npcs": {
      const npc = manifests.npcs.find((n) => n.id === entryId);
      return npc ? <NPCManifestEditor npc={npc} /> : null;
    }
    case "combat-spells": {
      const spell = manifests.combatSpells.find((s) => s.id === entryId);
      return spell ? <CombatSpellEditor spell={spell} /> : null;
    }
    case "prayers": {
      const prayer = manifests.prayers.find((p) => p.id === entryId);
      return prayer ? <PrayerEditor prayer={prayer} /> : null;
    }
    case "runes": {
      const rune = manifests.runes.find((r) => r.id === entryId);
      return rune ? <RuneEditor rune={rune} /> : null;
    }
    case "ammunition": {
      const ammo = manifests.ammunition.find((a) => a.id === entryId);
      return ammo ? <AmmunitionEditor ammo={ammo} /> : null;
    }
    default: {
      // Items
      if (manifestName.startsWith("items/")) {
        const item = manifests.items.find((i) => i.id === entryId);
        return item ? <ItemEditor item={item} /> : null;
      }
      // Recipes
      if (manifestName.startsWith("recipes/")) {
        const recipe = manifests.recipes.find((r) => r.id === entryId);
        return recipe ? <RecipeEditor recipe={recipe} /> : null;
      }
      return null;
    }
  }
}
