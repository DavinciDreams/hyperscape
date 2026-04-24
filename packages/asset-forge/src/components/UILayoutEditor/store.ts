/**
 * useUILayoutStore — Zustand store managing the in-progress
 * UILayoutManifest plus editor selection and asset metadata.
 *
 * The store represents the single layout currently open in the
 * editor. It tracks:
 *   - `layout`          — the working UILayoutManifest (widgets, positions)
 *   - `asset`           — server row metadata (id, name, version, flags…)
 *                         null when the layout is not yet persisted
 *   - `selectedInstanceId` — viewport selection
 *   - `isDirty`         — true whenever `layout` has been mutated since
 *                         the last load or save
 *   - `past` / `future` — undo/redo history rings bounded to the last
 *                         `HISTORY_LIMIT` mutations
 *
 * Kept deliberately small: any layout mutation flips `isDirty` so the
 * page chrome (Save button) can react without each call-site having
 * to remember. All layout-validation is derived on render via
 * `validateLayout`, not cached here.
 *
 * Undo/redo works by snapshotting the `layout` object before each
 * mutation. Selection is *not* part of the undo record — matching
 * UMG/Figma conventions where undo reverts data but not the active
 * inspector target. Consecutive drag-move updates to the same
 * instance coalesce into a single undo entry so a drag is one step,
 * not one step per pixel.
 */

import {
  validateLayout,
  type LayoutVariant,
  type LayoutVariantOverride,
  type UILayoutManifest,
  type UIOverridePosition,
  type ViewportKey,
  type WidgetCustomization,
  type WidgetInstance,
  type WidgetPosition,
  type WidgetVisibilityRule,
} from "@hyperforge/ui-framework";
import { create } from "zustand";
import type { UILayoutDetail } from "../../utils/uiLayoutApi";
import {
  alignAnchoredToViewport,
  alignAnchoredToSelection,
  distributeAnchored,
  type AlignEdge,
  type DistributeAxis,
  type SelectionMember,
  type ViewportDims,
} from "./alignmentActions";
import { uiLayoutRegistry } from "./registry";

/** Default render size for widgets that declare neither a manifest
 *  `defaultSize` nor an explicit per-instance width/height. Units =
 *  logical pixels; matches `UNIT_PX * {3,2}` from LayoutPreview. */
const DEFAULT_WIDGET_PX = { width: 72, height: 48 };

const EMPTY_LAYOUT: UILayoutManifest = {
  id: "hyperscape-ui",
  name: "Hyperscape Default HUD",
  grid: { columns: 24, rows: 16 },
  instances: [],
};

/** Maximum history entries kept on each side of the current layout.
 *  50 matches most pro tools (Figma/UE/Photoshop) for typical sessions. */
const HISTORY_LIMIT = 50;

/** Window during which consecutive position updates to the *same*
 *  instance collapse into a single undo entry. Matches a normal drag
 *  cadence; exceeding this yields a fresh undo step. */
const POSITION_COALESCE_MS = 500;

/**
 * Server-row metadata for the loaded layout. `null` when the layout
 * is fresh (not yet persisted). Mirrors UILayoutSummary from
 * uiLayoutApi.ts minus `manifestData` (which lives on `layout`).
 */
export interface UILayoutAssetMetadata {
  id: string;
  teamId: string;
  gameId: string | null;
  name: string;
  slug: string;
  description: string | null;
  version: string;
  isTemplate: boolean;
  isPublic: boolean;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * Metadata about the most-recent layout mutation. Used only for
 * coalescing consecutive position updates into one undo step.
 * `instanceId` is the target of the mutation (if any).
 */
interface LastMutationMeta {
  kind: "position" | "other";
  instanceId: string | null;
  time: number;
}

interface UILayoutStore {
  layout: UILayoutManifest;
  asset: UILayoutAssetMetadata | null;
  /**
   * Primary selection — the "last-clicked" instance. This is the
   * target of the property inspector and single-instance actions
   * (rename, position nudges, alignment, etc.).
   */
  selectedInstanceId: string | null;
  /**
   * Additional instances selected in a multi-selection (not
   * including the primary). Populated by shift-click. Group-ops
   * (delete, duplicate, z-order, alignment) consume the full set
   * via `allSelectedIds(state)`. Reset to `[]` whenever the primary
   * changes via plain click / load / reset.
   */
  additionalSelectionIds: string[];
  isDirty: boolean;
  /** Past layouts, oldest first. Undoable. */
  past: UILayoutManifest[];
  /** Future layouts, newest first (stack — top is next-to-redo). */
  future: UILayoutManifest[];
  /** Internal — last layout mutation bookkeeping for coalescing. */
  _lastMutation: LastMutationMeta;

  addWidget: (widgetId: string) => void;
  removeInstance: (instanceId: string) => void;
  /**
   * Batch-delete several instances under a single history entry so
   * undo reverses the whole group in one step (instead of click-by-
   * click). Unknown ids are silently ignored. If the primary or any
   * additional selection member is in `ids`, it is dropped from the
   * selection afterwards.
   */
  removeInstances: (ids: string[]) => void;
  /**
   * Deep-clone an existing instance under a fresh unique id. Offsets
   * the position slightly so the duplicate is visible (anchored: +24px
   * on both axes; grid: +1 column, wrapped into grid bounds). Selects
   * the new instance. No-op if `instanceId` isn't found.
   */
  duplicateInstance: (instanceId: string) => void;
  /**
   * Batch-duplicate several instances under a single history entry.
   * Each source is cloned with a fresh unique id and offset position.
   * The new primary is the first clone; the rest populate the
   * additional selection so the user can immediately act on the
   * duplicated group.
   */
  duplicateInstances: (ids: string[]) => void;
  selectInstance: (instanceId: string | null) => void;
  /**
   * Shift-click semantics: if `id` is the current primary, promote
   * the next additional (if any) to primary and drop `id` from the
   * selection. If `id` is in additionalSelectionIds, remove it. If
   * `id` is unselected, demote the current primary to additional
   * and make `id` the new primary so the inspector follows the
   * most-recently-clicked widget.
   */
  toggleSelection: (instanceId: string) => void;
  /**
   * Replace the entire selection set in one call. Used by marquee
   * selection where the full set of hit widgets is known up-front.
   * First id becomes the primary (inspector target), rest become
   * additional. Passing `[]` clears the selection.
   */
  replaceSelection: (ids: string[]) => void;
  updateInstanceProps: (
    instanceId: string,
    patch: Record<string, unknown>,
  ) => void;
  updateInstancePosition: (
    instanceId: string,
    position: WidgetPosition,
  ) => void;
  /**
   * Set or clear a single binding entry. Passing `expression = null`
   * removes the key from the bindings map; an empty object is pruned
   * so layouts without bindings stay clean.
   */
  updateInstanceBinding: (
    instanceId: string,
    propKey: string,
    expression: string | null,
  ) => void;
  /**
   * Merge a partial customization patch into a widget instance. Passing
   * `null` for a field removes it entirely; passing `undefined` leaves
   * it untouched. When the resulting customization object is empty the
   * key is dropped from the instance so layouts stay clean.
   */
  updateInstanceCustomization: (
    instanceId: string,
    patch: Partial<WidgetCustomization>,
  ) => void;
  /**
   * Merge a partial visibility-rule patch into a widget instance.
   * Same semantics as `updateInstanceCustomization`: `undefined` in a
   * field removes it, and when the resulting rule has no fields the
   * `visibility` key is dropped entirely from the instance.
   */
  updateInstanceVisibility: (
    instanceId: string,
    patch: Partial<WidgetVisibilityRule>,
  ) => void;
  /**
   * Merge a partial variant override for `(viewport, instanceId)`. The
   * variant entry is lazily created the first time an override is
   * written. When all fields of the merged override are `undefined`,
   * the override entry is removed; when the resulting variant has no
   * overrides, no grid, and no theme, the viewport key is dropped
   * entirely from `layout.variants` so clean layouts round-trip.
   *
   * `patch.position` is merged field-wise (same semantics as
   * `updateInstanceCustomization`). Passing `hidden: undefined` or
   * `visible: undefined` removes those fields. Passing
   * `position: undefined` leaves the existing position untouched;
   * pass an empty `{}` to clear it.
   */
  updateVariantOverride: (
    viewport: ViewportKey,
    instanceId: string,
    patch: {
      position?: Partial<UIOverridePosition>;
      visible?: boolean | undefined;
      hidden?: boolean | undefined;
    },
  ) => void;
  /** Remove a single variant override entry entirely. */
  clearVariantOverride: (viewport: ViewportKey, instanceId: string) => void;
  renameInstance: (instanceId: string, newId: string) => void;

  /**
   * Z-order operations. DOM paint order mirrors array order — later
   * entries paint on top. These four actions are the standard UMG /
   * Figma set:
   *   - Front: move to end (paints on top of everything)
   *   - Back:  move to start (paints underneath everything)
   *   - Up:    swap with the instance immediately after (nudge forward)
   *   - Down:  swap with the instance immediately before (nudge backward)
   * No-op if the instance id is unknown or already at that boundary.
   */
  moveInstanceToFront: (instanceId: string) => void;
  moveInstanceToBack: (instanceId: string) => void;
  moveInstanceForward: (instanceId: string) => void;
  moveInstanceBackward: (instanceId: string) => void;

  /**
   * Batch Z-order operations for multi-selection. Relative order
   * among selected ids is preserved. Forward/backward skip swaps
   * that would collide with another selected member (so a contiguous
   * selected block moves as a unit).
   */
  moveInstancesToFront: (ids: string[]) => void;
  moveInstancesToBack: (ids: string[]) => void;
  moveInstancesForward: (ids: string[]) => void;
  moveInstancesBackward: (ids: string[]) => void;

  /**
   * Align an anchored-positioned instance to one of six viewport
   * edges (left / center-h / right / top / center-v / bottom). The
   * instance's declared anchor is preserved — only `offset` is
   * rewritten. No-op if the instance isn't anchored.
   */
  alignInstanceToViewport: (
    instanceId: string,
    edge: AlignEdge,
    viewport: ViewportDims,
  ) => void;
  /**
   * Batch align — applies `alignInstanceToViewport` to each anchored
   * id under a single history entry. Non-anchored ids are skipped.
   */
  alignInstancesToViewport: (
    ids: string[],
    edge: AlignEdge,
    viewport: ViewportDims,
  ) => void;

  /**
   * Align every anchored member in `ids` to the matching edge of the
   * selection bounding box (min/max/center on the relevant axis).
   * No-op with <2 anchored ids. Non-anchored ids are filtered out.
   * One history entry.
   */
  alignInstancesToSelection: (
    ids: string[],
    edge: AlignEdge,
    viewport: ViewportDims,
  ) => void;

  /**
   * Distribute centers of every anchored member in `ids` evenly on
   * the chosen axis (h = horizontal, v = vertical). Extremes stay
   * put; middles spread onto evenly-spaced grid lines. No-op with
   * <3 anchored ids. One history entry.
   */
  distributeInstances: (
    ids: string[],
    axis: DistributeAxis,
    viewport: ViewportDims,
  ) => void;

  /** Select every instance currently in the layout. */
  selectAll: () => void;

  resetLayout: () => void;

  /** Populate the store from a server `UILayoutDetail` row. */
  loadAsset: (detail: UILayoutDetail) => void;
  /** Update editable asset-row fields (name/description/flags). */
  updateAssetMetadata: (
    patch: Partial<
      Pick<
        UILayoutAssetMetadata,
        "name" | "description" | "version" | "isTemplate" | "isPublic"
      >
    >,
  ) => void;
  /** Mark the current state as matching the server row. */
  markClean: (asset?: UILayoutAssetMetadata) => void;

  /** Revert to the previous layout. No-op if `past` is empty. */
  undo: () => void;
  /** Reapply the most recently undone layout. No-op if `future` is empty. */
  redo: () => void;
  /** True when at least one past entry exists. */
  canUndo: () => boolean;
  /** True when at least one future entry exists. */
  canRedo: () => boolean;
}

/**
 * Tiny helper that wraps a `set` payload to also mark the store
 * dirty. Any action that mutates `layout` routes through this so we
 * don't forget somewhere.
 */
function dirty<T extends object>(patch: T): T & { isDirty: true } {
  return { ...patch, isDirty: true };
}

/**
 * Build the history fields for a layout mutation. Each layout
 * mutation pushes the *current* layout onto `past` and clears
 * `future` (redo branch discarded on new mutation — standard
 * undo-stack semantics).
 *
 * Coalesces: when the previous mutation was a position update on the
 * same instance within `POSITION_COALESCE_MS`, the new mutation does
 * NOT push a new history entry — the already-recorded pre-drag state
 * stays on top. This collapses an entire drag into a single undo step.
 */
function historyFor(
  state: UILayoutStore,
  thisKind: "position" | "other",
  thisInstanceId: string | null,
): Pick<UILayoutStore, "past" | "future" | "_lastMutation"> {
  const now = Date.now();
  const coalesce =
    thisKind === "position" &&
    state._lastMutation.kind === "position" &&
    state._lastMutation.instanceId === thisInstanceId &&
    now - state._lastMutation.time < POSITION_COALESCE_MS;
  return {
    past: coalesce
      ? state.past
      : [...state.past, state.layout].slice(-HISTORY_LIMIT),
    future: coalesce ? state.future : [],
    _lastMutation: { kind: thisKind, instanceId: thisInstanceId, time: now },
  };
}

/** Fresh history block used on load/reset — clears both stacks. */
function emptyHistory(): Pick<
  UILayoutStore,
  "past" | "future" | "_lastMutation"
> {
  return {
    past: [],
    future: [],
    _lastMutation: { kind: "other", instanceId: null, time: 0 },
  };
}

export const useUILayoutStore = create<UILayoutStore>((set, get) => ({
  layout: EMPTY_LAYOUT,
  asset: null,
  selectedInstanceId: null,
  additionalSelectionIds: [],
  isDirty: false,
  past: [],
  future: [],
  _lastMutation: { kind: "other", instanceId: null, time: 0 },

  addWidget: (widgetId) => {
    const widget = uiLayoutRegistry.getWidget(widgetId);
    if (!widget) {
      throw new Error(
        `useUILayoutStore.addWidget: widget id "${widgetId}" is not registered`,
      );
    }
    const existing = get().layout.instances;
    // Generate a unique instance id: "{category}-{counter}"
    const base = widget.manifest.id.split(".").pop() ?? "widget";
    let counter = 1;
    while (existing.some((i) => i.instanceId === `${base}-${counter}`)) {
      counter += 1;
    }
    const instanceId = `${base}-${counter}`;

    const instance: WidgetInstance = {
      instanceId,
      widgetId,
      position: {
        kind: "anchored",
        anchor: "top-left",
        offset: { x: 12 + (existing.length % 6) * 24, y: 12 },
      },
      // Deep-clone defaultProps so edits don't mutate the shared
      // widget object.
      props: JSON.parse(JSON.stringify(widget.defaultProps)) as Record<
        string,
        unknown
      >,
      label: widget.manifest.name,
      visible: true,
    };

    set((state) => ({
      ...historyFor(state, "other", null),
      ...dirty({
        layout: {
          ...state.layout,
          instances: [...state.layout.instances, instance],
        },
        selectedInstanceId: instance.instanceId,
        additionalSelectionIds: [],
      }),
    }));
  },

  removeInstance: (instanceId) =>
    set((state) => ({
      ...historyFor(state, "other", null),
      ...dirty({
        layout: {
          ...state.layout,
          instances: state.layout.instances.filter(
            (i) => i.instanceId !== instanceId,
          ),
        },
        selectedInstanceId:
          state.selectedInstanceId === instanceId
            ? null
            : state.selectedInstanceId,
        additionalSelectionIds: state.additionalSelectionIds.filter(
          (id) => id !== instanceId,
        ),
      }),
    })),

  removeInstances: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      const remaining = state.layout.instances.filter(
        (i) => !idSet.has(i.instanceId),
      );
      // No matches → don't push a no-op history entry.
      if (remaining.length === state.layout.instances.length) return state;
      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: { ...state.layout, instances: remaining },
          selectedInstanceId:
            state.selectedInstanceId && idSet.has(state.selectedInstanceId)
              ? null
              : state.selectedInstanceId,
          additionalSelectionIds: state.additionalSelectionIds.filter(
            (id) => !idSet.has(id),
          ),
        }),
      };
    }),

  duplicateInstance: (instanceId) =>
    set((state) => {
      const source = state.layout.instances.find(
        (i) => i.instanceId === instanceId,
      );
      if (!source) return state;

      // Allocate a fresh unique id. Reuse the source's numeric suffix
      // pattern when present ("hp-bar-3" → "hp-bar-4"), otherwise
      // append "-copy" + counter.
      const newId = generateUniqueInstanceId(
        source.instanceId,
        state.layout.instances,
      );

      // Deep clone via JSON to avoid aliasing nested props/bindings.
      // WidgetInstance is pure data (schemas are Zod-parsed JSON), so
      // this is safe.
      const cloned: WidgetInstance = JSON.parse(
        JSON.stringify(source),
      ) as WidgetInstance;
      cloned.instanceId = newId;
      cloned.position = offsetDuplicatePosition(
        cloned.position,
        state.layout.grid,
      );

      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: {
            ...state.layout,
            instances: [...state.layout.instances, cloned],
          },
          selectedInstanceId: newId,
          additionalSelectionIds: [],
        }),
      };
    }),

  duplicateInstances: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      // Preserve the array order so the clones appear in the same
      // relative order as their sources — matches what duplicate does
      // for a single instance.
      const orderedSources = state.layout.instances.filter((i) =>
        ids.includes(i.instanceId),
      );
      if (orderedSources.length === 0) return state;

      // Build the clones. Each clone needs a unique id that doesn't
      // collide with existing instances OR with previously-built
      // clones in this same batch, so we grow the pool as we go.
      const pool: WidgetInstance[] = state.layout.instances.slice();
      const cloned: WidgetInstance[] = [];
      for (const source of orderedSources) {
        const newId = generateUniqueInstanceId(source.instanceId, pool);
        const clone: WidgetInstance = JSON.parse(
          JSON.stringify(source),
        ) as WidgetInstance;
        clone.instanceId = newId;
        clone.position = offsetDuplicatePosition(
          clone.position,
          state.layout.grid,
        );
        cloned.push(clone);
        pool.push(clone);
      }

      const [firstClone, ...restClones] = cloned;
      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: {
            ...state.layout,
            instances: [...state.layout.instances, ...cloned],
          },
          selectedInstanceId: firstClone.instanceId,
          additionalSelectionIds: restClones.map((c) => c.instanceId),
        }),
      };
    }),

  selectInstance: (instanceId) =>
    set({ selectedInstanceId: instanceId, additionalSelectionIds: [] }),

  replaceSelection: (ids) =>
    set(() => {
      // De-dup while preserving insertion order; marquee may hit the
      // same widget twice if ids are somehow duplicated upstream.
      const seen = new Set<string>();
      const uniq: string[] = [];
      for (const id of ids) {
        if (seen.has(id)) continue;
        seen.add(id);
        uniq.push(id);
      }
      const [primary, ...additional] = uniq;
      return {
        selectedInstanceId: primary ?? null,
        additionalSelectionIds: additional,
      };
    }),

  toggleSelection: (instanceId) =>
    set((state) => {
      // Case 1 — clicked the primary. Drop it from the selection;
      // promote the first additional (if any) to primary so the
      // inspector has a stable target.
      if (state.selectedInstanceId === instanceId) {
        const [nextPrimary, ...restAdditional] = state.additionalSelectionIds;
        return {
          selectedInstanceId: nextPrimary ?? null,
          additionalSelectionIds: restAdditional,
        };
      }
      // Case 2 — clicked an already-additional. Remove from
      // additional; primary stays put.
      if (state.additionalSelectionIds.includes(instanceId)) {
        return {
          additionalSelectionIds: state.additionalSelectionIds.filter(
            (id) => id !== instanceId,
          ),
        };
      }
      // Case 3 — clicked a fresh widget. Demote current primary to
      // additional, make the clicked one the new primary. First
      // click (no prior primary) is equivalent to single-select.
      return {
        selectedInstanceId: instanceId,
        additionalSelectionIds: state.selectedInstanceId
          ? [state.selectedInstanceId, ...state.additionalSelectionIds]
          : state.additionalSelectionIds,
      };
    }),

  updateInstanceProps: (instanceId, patch) =>
    set((state) => ({
      ...historyFor(state, "other", null),
      ...dirty({
        layout: {
          ...state.layout,
          instances: state.layout.instances.map((i) =>
            i.instanceId === instanceId
              ? { ...i, props: { ...i.props, ...patch } }
              : i,
          ),
        },
      }),
    })),

  updateInstancePosition: (instanceId, position) =>
    set((state) => ({
      ...historyFor(state, "position", instanceId),
      ...dirty({
        layout: {
          ...state.layout,
          instances: state.layout.instances.map((i) =>
            i.instanceId === instanceId ? { ...i, position } : i,
          ),
        },
      }),
    })),

  updateInstanceCustomization: (instanceId, patch) =>
    set((state) => ({
      ...historyFor(state, "other", null),
      ...dirty({
        layout: {
          ...state.layout,
          instances: state.layout.instances.map((i) => {
            if (i.instanceId !== instanceId) return i;
            const merged: WidgetCustomization = {
              ...(i.customization ?? {}),
              ...patch,
            };
            // Drop keys whose caller passed `undefined` — the store
            // API mirrors `updateInstanceProps` where absent = unchanged.
            (Object.keys(merged) as (keyof WidgetCustomization)[]).forEach(
              (k) => {
                if (merged[k] === undefined) delete merged[k];
              },
            );
            const hasAny = Object.keys(merged).length > 0;
            const { customization: _prev, ...rest } = i;
            return hasAny ? { ...rest, customization: merged } : rest;
          }),
        },
      }),
    })),

  updateInstanceVisibility: (instanceId, patch) =>
    set((state) => ({
      ...historyFor(state, "other", null),
      ...dirty({
        layout: {
          ...state.layout,
          instances: state.layout.instances.map((i) => {
            if (i.instanceId !== instanceId) return i;
            const merged: WidgetVisibilityRule = {
              ...(i.visibility ?? {}),
              ...patch,
            };
            (Object.keys(merged) as (keyof WidgetVisibilityRule)[]).forEach(
              (k) => {
                if (merged[k] === undefined) delete merged[k];
              },
            );
            const hasAny = Object.keys(merged).length > 0;
            const { visibility: _prev, ...rest } = i;
            return hasAny ? { ...rest, visibility: merged } : rest;
          }),
        },
      }),
    })),

  updateVariantOverride: (viewport, instanceId, patch) =>
    set((state) => {
      const variants = state.layout.variants ?? {};
      const existingVariant: LayoutVariant = variants[viewport] ?? {
        overrides: [],
      };
      const existingOverride = existingVariant.overrides.find(
        (o) => o.instanceId === instanceId,
      );

      // Merge position field-wise. `patch.position = undefined` leaves
      // the existing position untouched; `patch.position = {}` clears
      // it (keeps empty object so caller can see the slot exists).
      const mergedPosition: UIOverridePosition | undefined =
        patch.position === undefined
          ? existingOverride?.position
          : { ...(existingOverride?.position ?? {}), ...patch.position };

      // Strip undefined keys from merged position so we don't persist
      // literal `undefined` into the manifest.
      if (mergedPosition) {
        (Object.keys(mergedPosition) as (keyof UIOverridePosition)[]).forEach(
          (k) => {
            if (mergedPosition[k] === undefined) delete mergedPosition[k];
          },
        );
      }
      const positionEmpty =
        !mergedPosition || Object.keys(mergedPosition).length === 0;

      // `visible`/`hidden`: explicit undefined removes the field;
      // absent from patch leaves it unchanged.
      const visible =
        "visible" in patch ? patch.visible : existingOverride?.visible;
      const hidden =
        "hidden" in patch ? patch.hidden : existingOverride?.hidden;

      const mergedOverride: LayoutVariantOverride = {
        instanceId,
        ...(positionEmpty ? {} : { position: mergedPosition }),
        ...(visible === undefined ? {} : { visible }),
        ...(hidden === undefined ? {} : { hidden }),
      };

      // Prune override if it has no fields beyond its id.
      const overrideHasContent =
        !positionEmpty || visible !== undefined || hidden !== undefined;
      const nextOverrides = existingVariant.overrides.filter(
        (o) => o.instanceId !== instanceId,
      );
      if (overrideHasContent) {
        nextOverrides.push(mergedOverride);
      }

      const nextVariant: LayoutVariant = {
        ...existingVariant,
        overrides: nextOverrides,
      };

      // Prune the viewport key if the resulting variant has nothing
      // meaningful left.
      const variantEmpty =
        nextOverrides.length === 0 &&
        !nextVariant.grid &&
        !nextVariant.theme &&
        !nextVariant.themeId;

      const nextVariants = { ...variants };
      if (variantEmpty) {
        delete nextVariants[viewport];
      } else {
        nextVariants[viewport] = nextVariant;
      }

      const variantsEmpty = Object.keys(nextVariants).length === 0;
      const nextLayout: UILayoutManifest = variantsEmpty
        ? (() => {
            const { variants: _v, ...rest } = state.layout;
            return rest;
          })()
        : { ...state.layout, variants: nextVariants };

      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: nextLayout }),
      };
    }),

  clearVariantOverride: (viewport, instanceId) =>
    set((state) => {
      const variants = state.layout.variants;
      if (!variants) return state;
      const variant = variants[viewport];
      if (!variant) return state;
      const nextOverrides = variant.overrides.filter(
        (o) => o.instanceId !== instanceId,
      );
      if (nextOverrides.length === variant.overrides.length) return state;

      const nextVariant: LayoutVariant = {
        ...variant,
        overrides: nextOverrides,
      };
      const variantEmpty =
        nextOverrides.length === 0 &&
        !nextVariant.grid &&
        !nextVariant.theme &&
        !nextVariant.themeId;

      const nextVariants = { ...variants };
      if (variantEmpty) {
        delete nextVariants[viewport];
      } else {
        nextVariants[viewport] = nextVariant;
      }

      const variantsEmpty = Object.keys(nextVariants).length === 0;
      const nextLayout: UILayoutManifest = variantsEmpty
        ? (() => {
            const { variants: _v, ...rest } = state.layout;
            return rest;
          })()
        : { ...state.layout, variants: nextVariants };

      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: nextLayout }),
      };
    }),

  updateInstanceBinding: (instanceId, propKey, expression) =>
    set((state) => ({
      ...historyFor(state, "other", null),
      ...dirty({
        layout: {
          ...state.layout,
          instances: state.layout.instances.map((i) => {
            if (i.instanceId !== instanceId) return i;
            // Normalize: trim and treat empty string as clear.
            const trimmed = expression?.trim() ?? "";
            const next = { ...(i.bindings ?? {}) };
            if (expression === null || trimmed === "") {
              delete next[propKey];
            } else {
              next[propKey] = trimmed;
            }
            // Strip the bindings field entirely when the map is empty
            // so layouts without bindings stay clean.
            if (Object.keys(next).length === 0) {
              const { bindings: _omit, ...rest } = i;
              return rest;
            }
            return { ...i, bindings: next };
          }),
        },
      }),
    })),

  renameInstance: (instanceId, newId) => {
    const trimmed = newId.trim();
    if (!trimmed) return;
    set((state) => {
      // Reject the rename silently if another instance already owns
      // the target id — the outliner will show the unchanged value.
      if (state.layout.instances.some((i) => i.instanceId === trimmed)) {
        return state;
      }
      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: {
            ...state.layout,
            instances: state.layout.instances.map((i) =>
              i.instanceId === instanceId ? { ...i, instanceId: trimmed } : i,
            ),
          },
          selectedInstanceId:
            state.selectedInstanceId === instanceId
              ? trimmed
              : state.selectedInstanceId,
          additionalSelectionIds: state.additionalSelectionIds.map((id) =>
            id === instanceId ? trimmed : id,
          ),
        }),
      };
    });
  },

  moveInstanceToFront: (instanceId) =>
    set((state) => {
      const idx = state.layout.instances.findIndex(
        (i) => i.instanceId === instanceId,
      );
      if (idx < 0 || idx === state.layout.instances.length - 1) return state;
      const next = state.layout.instances.slice();
      const [moved] = next.splice(idx, 1);
      next.push(moved);
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  moveInstanceToBack: (instanceId) =>
    set((state) => {
      const idx = state.layout.instances.findIndex(
        (i) => i.instanceId === instanceId,
      );
      if (idx <= 0) return state;
      const next = state.layout.instances.slice();
      const [moved] = next.splice(idx, 1);
      next.unshift(moved);
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  moveInstanceForward: (instanceId) =>
    set((state) => {
      const idx = state.layout.instances.findIndex(
        (i) => i.instanceId === instanceId,
      );
      if (idx < 0 || idx === state.layout.instances.length - 1) return state;
      const next = state.layout.instances.slice();
      [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  moveInstanceBackward: (instanceId) =>
    set((state) => {
      const idx = state.layout.instances.findIndex(
        (i) => i.instanceId === instanceId,
      );
      if (idx <= 0) return state;
      const next = state.layout.instances.slice();
      [next[idx], next[idx - 1]] = [next[idx - 1], next[idx]];
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  moveInstancesToFront: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      const selected = state.layout.instances.filter((i) =>
        idSet.has(i.instanceId),
      );
      if (selected.length === 0) return state;
      const rest = state.layout.instances.filter(
        (i) => !idSet.has(i.instanceId),
      );
      const next = [...rest, ...selected];
      // Already at the top — suppress a no-op history entry.
      const sameOrder =
        next.length === state.layout.instances.length &&
        next.every(
          (inst, idx) =>
            inst.instanceId === state.layout.instances[idx].instanceId,
        );
      if (sameOrder) return state;
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  moveInstancesToBack: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      const selected = state.layout.instances.filter((i) =>
        idSet.has(i.instanceId),
      );
      if (selected.length === 0) return state;
      const rest = state.layout.instances.filter(
        (i) => !idSet.has(i.instanceId),
      );
      const next = [...selected, ...rest];
      const sameOrder =
        next.length === state.layout.instances.length &&
        next.every(
          (inst, idx) =>
            inst.instanceId === state.layout.instances[idx].instanceId,
        );
      if (sameOrder) return state;
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  moveInstancesForward: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      // Iterate from the back so swaps don't cascade — each
      // selected instance moves at most one slot toward the end.
      // Skip swaps where the next neighbor is also selected so a
      // contiguous selected block moves as a unit.
      const next = state.layout.instances.slice();
      let changed = false;
      for (let i = next.length - 2; i >= 0; i--) {
        if (!idSet.has(next[i].instanceId)) continue;
        if (idSet.has(next[i + 1].instanceId)) continue;
        [next[i], next[i + 1]] = [next[i + 1], next[i]];
        changed = true;
      }
      if (!changed) return state;
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  moveInstancesBackward: (ids) =>
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      // Mirror of forward: iterate from the front.
      const next = state.layout.instances.slice();
      let changed = false;
      for (let i = 1; i < next.length; i++) {
        if (!idSet.has(next[i].instanceId)) continue;
        if (idSet.has(next[i - 1].instanceId)) continue;
        [next[i], next[i - 1]] = [next[i - 1], next[i]];
        changed = true;
      }
      if (!changed) return state;
      return {
        ...historyFor(state, "other", null),
        ...dirty({ layout: { ...state.layout, instances: next } }),
      };
    }),

  alignInstanceToViewport: (instanceId, edge, viewport) =>
    set((state) => {
      const inst = state.layout.instances.find(
        (i) => i.instanceId === instanceId,
      );
      if (!inst || inst.position.kind !== "anchored") return state;

      // Resolve the rendered size. Per-instance width/height (set by
      // resize handles) wins; otherwise fall back to the widget
      // manifest's defaultSize (converted to px) or the editor
      // default. Keeps alignment geometry consistent with
      // `computeLogicalBox` in LayoutPreview.
      const widget = uiLayoutRegistry.getWidget(inst.widgetId);
      const manifestSize = widget?.manifest.defaultSize;
      const width =
        inst.position.width ??
        (manifestSize ? manifestSize.width * 24 : DEFAULT_WIDGET_PX.width);
      const height =
        inst.position.height ??
        (manifestSize ? manifestSize.height * 24 : DEFAULT_WIDGET_PX.height);

      const nextPos = alignAnchoredToViewport(
        inst.position,
        { width, height },
        edge,
        viewport,
      );

      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: {
            ...state.layout,
            instances: state.layout.instances.map((i) =>
              i.instanceId === instanceId ? { ...i, position: nextPos } : i,
            ),
          },
        }),
      };
    }),

  alignInstancesToViewport: (ids, edge, viewport) =>
    set((state) => {
      if (ids.length === 0) return state;
      const idSet = new Set(ids);
      let changed = false;
      const nextInstances = state.layout.instances.map((inst) => {
        if (!idSet.has(inst.instanceId)) return inst;
        if (inst.position.kind !== "anchored") return inst;
        const widget = uiLayoutRegistry.getWidget(inst.widgetId);
        const manifestSize = widget?.manifest.defaultSize;
        const width =
          inst.position.width ??
          (manifestSize ? manifestSize.width * 24 : DEFAULT_WIDGET_PX.width);
        const height =
          inst.position.height ??
          (manifestSize ? manifestSize.height * 24 : DEFAULT_WIDGET_PX.height);
        const nextPos = alignAnchoredToViewport(
          inst.position,
          { width, height },
          edge,
          viewport,
        );
        changed = true;
        return { ...inst, position: nextPos };
      });
      if (!changed) return state;
      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: { ...state.layout, instances: nextInstances },
        }),
      };
    }),

  alignInstancesToSelection: (ids, edge, viewport) =>
    set((state) => {
      if (ids.length < 2) return state;
      const idSet = new Set(ids);
      const members: SelectionMember[] = [];
      for (const inst of state.layout.instances) {
        if (!idSet.has(inst.instanceId)) continue;
        if (inst.position.kind !== "anchored") continue;
        const widget = uiLayoutRegistry.getWidget(inst.widgetId);
        const manifestSize = widget?.manifest.defaultSize;
        const width =
          inst.position.width ??
          (manifestSize ? manifestSize.width * 24 : DEFAULT_WIDGET_PX.width);
        const height =
          inst.position.height ??
          (manifestSize ? manifestSize.height * 24 : DEFAULT_WIDGET_PX.height);
        members.push({
          id: inst.instanceId,
          pos: inst.position,
          size: { width, height },
        });
      }
      if (members.length < 2) return state;
      const updates = alignAnchoredToSelection(members, edge, viewport);
      if (updates.size === 0) return state;
      const nextInstances = state.layout.instances.map((inst) => {
        const nextPos = updates.get(inst.instanceId);
        return nextPos ? { ...inst, position: nextPos } : inst;
      });
      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: { ...state.layout, instances: nextInstances },
        }),
      };
    }),

  distributeInstances: (ids, axis, viewport) =>
    set((state) => {
      if (ids.length < 3) return state;
      const idSet = new Set(ids);
      const members: SelectionMember[] = [];
      for (const inst of state.layout.instances) {
        if (!idSet.has(inst.instanceId)) continue;
        if (inst.position.kind !== "anchored") continue;
        const widget = uiLayoutRegistry.getWidget(inst.widgetId);
        const manifestSize = widget?.manifest.defaultSize;
        const width =
          inst.position.width ??
          (manifestSize ? manifestSize.width * 24 : DEFAULT_WIDGET_PX.width);
        const height =
          inst.position.height ??
          (manifestSize ? manifestSize.height * 24 : DEFAULT_WIDGET_PX.height);
        members.push({
          id: inst.instanceId,
          pos: inst.position,
          size: { width, height },
        });
      }
      if (members.length < 3) return state;
      const updates = distributeAnchored(members, axis, viewport);
      if (updates.size === 0) return state;
      const nextInstances = state.layout.instances.map((inst) => {
        const nextPos = updates.get(inst.instanceId);
        return nextPos ? { ...inst, position: nextPos } : inst;
      });
      return {
        ...historyFor(state, "other", null),
        ...dirty({
          layout: { ...state.layout, instances: nextInstances },
        }),
      };
    }),

  selectAll: () =>
    set((state) => {
      const allIds = state.layout.instances.map((i) => i.instanceId);
      if (allIds.length === 0) {
        return { selectedInstanceId: null, additionalSelectionIds: [] };
      }
      const [primary, ...additional] = allIds;
      return {
        selectedInstanceId: primary,
        additionalSelectionIds: additional,
      };
    }),

  resetLayout: () =>
    set({
      layout: EMPTY_LAYOUT,
      asset: null,
      selectedInstanceId: null,
      additionalSelectionIds: [],
      isDirty: false,
      ...emptyHistory(),
    }),

  loadAsset: (detail) => {
    const {
      id,
      teamId,
      gameId,
      name,
      slug,
      description,
      version,
      isTemplate,
      isPublic,
      createdBy,
      createdAt,
      updatedAt,
      manifestData,
    } = detail;
    set({
      layout: manifestData,
      asset: {
        id,
        teamId,
        gameId,
        name,
        slug,
        description,
        version,
        isTemplate,
        isPublic,
        createdBy,
        createdAt,
        updatedAt,
      },
      selectedInstanceId: null,
      additionalSelectionIds: [],
      isDirty: false,
      ...emptyHistory(),
    });
  },

  updateAssetMetadata: (patch) =>
    set((state) => {
      if (!state.asset) return state;
      return dirty({
        asset: { ...state.asset, ...patch },
      });
    }),

  markClean: (asset) =>
    set((state) => ({
      asset: asset ?? state.asset,
      isDirty: false,
    })),

  undo: () =>
    set((state) => {
      if (state.past.length === 0) return state;
      const prev = state.past[state.past.length - 1];
      const newPast = state.past.slice(0, -1);
      // After undo the selection may no longer exist; filter both
      // primary and additional against the restored instances.
      const exists = (id: string | null) =>
        !!id && prev.instances.some((i) => i.instanceId === id);
      return {
        layout: prev,
        past: newPast,
        future: [state.layout, ...state.future].slice(0, HISTORY_LIMIT),
        selectedInstanceId: exists(state.selectedInstanceId)
          ? state.selectedInstanceId
          : null,
        additionalSelectionIds: state.additionalSelectionIds.filter(exists),
        isDirty: true,
        _lastMutation: { kind: "other", instanceId: null, time: Date.now() },
      };
    }),

  redo: () =>
    set((state) => {
      if (state.future.length === 0) return state;
      const [next, ...rest] = state.future;
      const exists = (id: string | null) =>
        !!id && next.instances.some((i) => i.instanceId === id);
      return {
        layout: next,
        past: [...state.past, state.layout].slice(-HISTORY_LIMIT),
        future: rest,
        selectedInstanceId: exists(state.selectedInstanceId)
          ? state.selectedInstanceId
          : null,
        additionalSelectionIds: state.additionalSelectionIds.filter(exists),
        isDirty: true,
        _lastMutation: { kind: "other", instanceId: null, time: Date.now() },
      };
    }),

  canUndo: () => get().past.length > 0,
  canRedo: () => get().future.length > 0,
}));

/**
 * Allocate a unique instance id based on `source`. Matches the
 * numeric-suffix pattern produced by `addWidget` ("hp-bar-3" →
 * "hp-bar-4", "hp-bar-5"…) so duplicates stay visually grouped in
 * the outliner. Falls back to appending "-copy" then "-copy-N" when
 * the source id has no numeric suffix.
 */
function generateUniqueInstanceId(
  source: string,
  existing: ReadonlyArray<WidgetInstance>,
): string {
  const taken = new Set(existing.map((i) => i.instanceId));
  const numericSuffix = source.match(/^(.*)-(\d+)$/);
  if (numericSuffix) {
    const [, base, nStr] = numericSuffix;
    let n = Number(nStr) + 1;
    while (taken.has(`${base}-${n}`)) n += 1;
    return `${base}-${n}`;
  }
  // Source has no numeric suffix — try -copy, -copy-2, …
  let candidate = `${source}-copy`;
  if (!taken.has(candidate)) return candidate;
  let n = 2;
  while (taken.has(`${source}-copy-${n}`)) n += 1;
  candidate = `${source}-copy-${n}`;
  return candidate;
}

/**
 * Offset a cloned instance's position so the duplicate is visible
 * instead of sitting directly on top of the source:
 *   - anchored: +24px on both axes
 *   - grid: advance one column (wraps to next row if the column would
 *     exceed grid width). When grid isn't set, advances within a
 *     conservative 24-column fallback.
 *   - flex: bumps `order` by +1 so flex children don't collide at the
 *     same order index.
 */
function offsetDuplicatePosition(
  position: WidgetPosition,
  grid: { columns: number; rows: number } | undefined,
): WidgetPosition {
  if (position.kind === "anchored") {
    return {
      ...position,
      offset: {
        x: position.offset.x + 24,
        y: position.offset.y + 24,
      },
    };
  }
  if (position.kind === "grid") {
    const columns = grid?.columns ?? 24;
    const span = position.columnSpan ?? 1;
    const nextCol = position.column + 1;
    const wraps = nextCol + span > columns;
    return {
      ...position,
      column: wraps ? 0 : nextCol,
      row: wraps ? position.row + 1 : position.row,
    };
  }
  return {
    ...position,
    order: position.order + 1,
  };
}

/**
 * Returns the full selected-id list (primary first, additionals
 * after) for a given store snapshot. Handy for group operations
 * that treat every selected widget equally.
 */
export function allSelectedIds(state: {
  selectedInstanceId: string | null;
  additionalSelectionIds: string[];
}): string[] {
  return state.selectedInstanceId
    ? [state.selectedInstanceId, ...state.additionalSelectionIds]
    : state.additionalSelectionIds;
}

/**
 * Derive validation issues from the store. Kept as a standalone
 * helper so components that care about validity don't have to bloat
 * the store with cached state.
 */
export function useLayoutValidation() {
  const layout = useUILayoutStore((s) => s.layout);
  return validateLayout(layout, uiLayoutRegistry);
}
