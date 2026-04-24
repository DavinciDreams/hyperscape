/**
 * Shared WidgetRegistry for the UI Layout Editor.
 *
 * Preloads every builtin widget schema *and* binds the real React
 * widget components from `@hyperforge/ui-widgets` — the same package
 * the live game client consumes. That means the editor preview is
 * WYSIWYG: authors see the exact visuals the game will render, not
 * placeholder boxes.
 */

import {
  bindAllWidgets,
  createUIWidgetRegistry,
  type UIWidgetComponent,
} from "@hyperforge/ui-widgets";

export type WidgetComponent = UIWidgetComponent;

export const uiLayoutRegistry = createUIWidgetRegistry();
bindAllWidgets(uiLayoutRegistry);
