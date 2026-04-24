export {
  WIDGET_CATEGORIES,
  WidgetDefaultSizeSchema,
  WidgetManifestSchema,
  defineWidget,
  registerWidget,
} from "./widget";
export type {
  Widget,
  WidgetCategory,
  WidgetDefaultSize,
  WidgetManifest,
  WidgetRegistration,
} from "./widget";

export { WidgetRegistry } from "./registry";
export type { ComponentBinding } from "./registry";

export {
  BUILTIN_WIDGETS,
  actionBarWidget,
  chatWidget,
  hpBarWidget,
  inventoryWidget,
  minimapWidget,
  tooltipWidget,
} from "./builtins";

export {
  UI_PROP_FIELD_TYPES,
  inspectWidgetProps,
  introspectPropsSchema,
} from "./inspect";
export type { UIPropField, UIPropFieldType } from "./inspect";

export {
  AnchoredPositionSchema,
  FlexPositionSchema,
  GridPositionSchema,
  LAYOUT_ANCHORS,
  LayoutVariantOverrideSchema,
  LayoutVariantSchema,
  UILayoutManifestSchema,
  UIOverridePositionSchema,
  UIOverrideSchema,
  UIUserLayoutSchema,
  WidgetCustomizationSchema,
  WidgetInstanceSchema,
  WidgetPositionSchema,
  WidgetVisibilityRuleSchema,
  validateLayout,
} from "./layout";
export type {
  AnchoredPosition,
  FlexPosition,
  GridPosition,
  LayoutAnchor,
  LayoutValidationIssue,
  LayoutValidationResult,
  LayoutVariant,
  LayoutVariantOverride,
  UILayoutManifest,
  UIOverride,
  UIOverridePosition,
  UIUserLayout,
  WidgetCustomization,
  WidgetInstance,
  WidgetPosition,
  WidgetVisibilityRule,
} from "./layout";

export { resolveLayout } from "./resolve";
export type { ResolvedLayout } from "./resolve";

export {
  DEFAULT_VIEWPORT_BREAKPOINTS,
  VIEWPORT_KEYS,
  applyLayoutVariant,
  classifyViewport,
} from "./variant";
export type {
  ApplyVariantResult,
  ViewportClassifierOptions,
  ViewportKey,
} from "./variant";

export {
  registerUserInputBindingsMigration,
  registerUserLayoutMigration,
  safeLoadLayoutManifest,
  safeLoadUserInputBindings,
  safeLoadUserLayout,
} from "./safe-load";
export type { LoadFailure, LoadResult } from "./safe-load";

export {
  INPUT_MODIFIER_KEYS,
  INPUT_POINTER_BUTTONS,
  InputActionSchema,
  InputBindingManifestSchema,
  InputChordSchema,
  UserInputBindingSchema,
  UserInputBindingsSchema,
  chordToString,
  chordsEqual,
  resolveInputBindings,
  validateInputBindings,
} from "./input";
export type {
  InputAction,
  InputBindingManifest,
  InputChord,
  InputModifierKey,
  InputPointerButton,
  InputValidationIssue,
  InputValidationResult,
  ResolvedInputBinding,
  ResolvedInputBindings,
  UserInputBinding,
  UserInputBindings,
} from "./input";

export { isWidgetVisible } from "./visibility";
export type { VisibilityEvaluationInput } from "./visibility";

export { boxEdges, computeAlignmentSnap, snapBoxToViewport } from "./alignment";
export type {
  AlignmentGuide,
  AlignmentSnapOptions,
  AlignmentSnapResult,
  Box,
  BoxEdges,
} from "./alignment";

export {
  DEFAULT_MAJOR_MULTIPLIER,
  computeGridLines,
  snapBoxToGrid,
  snapPointToGrid,
  snapToGrid,
} from "./grid";
export type { GridLines } from "./grid";

export {
  BindingExpressionSchema,
  BindingParseError,
  evaluateBinding,
  evaluateParsedBinding,
  parseBindingExpression,
  resolveWidgetProps,
} from "./bindings";
export type {
  BindingStep,
  DataContext,
  ParsedBinding,
  PropResolutionIssue,
  PropResolutionResult,
} from "./bindings";

export {
  HYPERSCAPE_DARK_THEME,
  THEME_VALIDATION_CODES,
  ThemeColorValueSchema,
  ThemeManifestSchema,
  ThemeSizeValueSchema,
  themeToCssVars,
  validateTheme,
} from "./theme";
export type {
  ThemeManifest,
  ThemeToCssVarsOptions,
  ThemeValidationCode,
  ThemeValidationIssue,
  ThemeValidationResult,
} from "./theme";
