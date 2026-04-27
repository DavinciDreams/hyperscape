/**
 * Client-side UI framework bindings — Phase D6.
 *
 * Single entry point for everything manifest-driven: the registry of
 * bound React components, the default layout, and theme application
 * helpers.
 */

export { uiRegistry, bindAllWidgets, allBuiltinsBound } from "./bindings";
export type { UIWidgetComponent } from "./bindings";

// Widget components are now implemented in @hyperforge/ui-widgets —
// re-exported here so legacy client imports keep resolving. Per-widget
// Props interfaces have been dropped: consumers should derive props
// from the Zod schemas shipped by @hyperforge/ui-framework.
export {
  ActionBarWidget,
  ChatWidget,
  HpBarWidget,
  InventoryWidget,
  MinimapWidget,
  TooltipWidget,
} from "@hyperforge/ui-widgets";

export {
  DEFAULT_UI_LAYOUT,
  DEFAULT_UI_LAYOUT_ID,
  SHOOTER_DEMO_UI_LAYOUT,
  SHOOTER_DEMO_UI_LAYOUT_ID,
  getDefaultUILayoutForGame,
} from "./defaultLayout";

// Phase D9 proof-of-concept — Hyperscape's reference UIPackManifest.
export { HYPERSCAPE_UI_PACK, HYPERSCAPE_UI_PACK_ID } from "./hyperscapePack";

// Phase D9 client-side glue — bridges loadUIPack to the local
// themeRegistry. Hosts call loadUIPackOnClient(pack) instead of the
// engine-level loadUIPack to get automatic theme registration.
export { loadHyperscapeUIPack, loadUIPackOnClient } from "./uiPackLoader";
export type { LoadUIPackOnClientOptions } from "./uiPackLoader";

// Phase D10 — pack registry singleton + React hook. Loaded packs
// register here; ManifestHud (next slice) reads via useActiveUIPack.
export {
  getActiveUIPack,
  getActiveUIPackId,
  listRegisteredUIPacks,
  registerUIPack,
  resolveUIPackById,
  setActiveUIPack,
  subscribeUIPackRegistry,
  uiPackRegistrySize,
  unregisterUIPack,
} from "./uiPackRegistry";
export { useActiveUIPack } from "./useActiveUIPack";

export {
  buildPlayerDataContext,
  playerDataSourceRegistry,
} from "./dataContext";
export type { PlayerDataSnapshot } from "./dataContext";

export { ManifestRenderer } from "./ManifestRenderer";
export type { ManifestRendererProps } from "./ManifestRenderer";

export { ManifestHud } from "./ManifestHud";

export { isManifestHudEnabled } from "./featureFlag";

export { applyTheme, applyDefaultTheme } from "./theme";
export type { ApplyThemeOptions } from "./theme";

export { LayoutSwitcher } from "./LayoutSwitcher";

export { useViewportVariant } from "./useViewportVariant";

export { useInputActions } from "./useInputActions";
export type {
  InputActionHandler,
  UseInputActionsOptions,
} from "./useInputActions";

export {
  useSetActionChords,
  useUserInputBindings,
  useUserInputBindingsStore,
} from "./useUserInputBindings";

export { InputRebindingPanel } from "./InputRebindingPanel";
export type { InputRebindingPanelProps } from "./InputRebindingPanel";

export {
  reportSafeLoadFailure,
  setSafeLoadFailureHandler,
  _resetSafeLoadFailureHandler,
} from "./safeLoadReport";
export type { SafeLoadContext, SafeLoadFailureHandler } from "./safeLoadReport";

export {
  _resetSafeLoadReportingBootstrap,
  bootstrapSafeLoadReporting,
} from "./bootstrapSafeLoadReporting";

export {
  readPlayerLayoutOverride,
  setPlayerLayoutOverride,
  useActiveUILayout,
  useGameUILayouts,
} from "./useActiveUILayout";
export type {
  UILayoutSummary,
  UseActiveUILayoutResult,
  UseGameUILayoutsResult,
} from "./useActiveUILayout";
