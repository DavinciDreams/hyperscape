/**
 * Window Renderer
 *
 * Renders all visible windows with appropriate wrappers based on window type.
 * Handles action bars, menu bars, minimap, and regular panel windows.
 *
 * @packageDocumentation
 */

import React, { memo, useMemo } from "react";
import { Window, TabBar, useWindowStore, type WindowState } from "@/ui";
import type { ClientWorld } from "../../types";
import {
  WindowContent,
  DraggableContentWrapper,
  ActionBarWrapper,
  MenuBarWrapper,
  MinimapWrapper,
} from "./InterfacePanels";

/** Props for WindowRenderer component */
interface WindowRendererProps {
  /** The game world instance */
  world: ClientWorld | null;
  /** Whether edit mode is active */
  isUnlocked: boolean;
  /** Whether edit mode feature is enabled */
  editModeEnabled: boolean;
  /** Whether window combining is enabled */
  windowCombiningEnabled: boolean;
  /** Function to render panel content */
  renderPanel: (
    panelId: string,
    world?: ClientWorld,
    windowId?: string,
  ) => React.ReactNode;
  /** Changes when panel data updates, breaking through memo barriers */
  panelDataVersion?: number;
}

/**
 * Renders all visible windows with appropriate wrappers
 */
export const WindowRenderer = memo(function WindowRenderer({
  world,
  isUnlocked,
  editModeEnabled,
  windowCombiningEnabled,
  renderPanel,
  panelDataVersion,
}: WindowRendererProps): React.ReactElement {
  const windowsMap = useWindowStore((s) => s.windows);
  const visibleWindows = useMemo(
    () =>
      Array.from(windowsMap.values())
        .filter((w) => w.visible)
        .sort((a, b) => a.zIndex - b.zIndex)
        .map((w) => w.id),
    [windowsMap],
  );
  const isEditMode = isUnlocked && editModeEnabled;

  return (
    <div
      className="fixed inset-0 pointer-events-none"
      style={{ zIndex: isEditMode ? 600 : 300 }}
    >
      {visibleWindows.map((windowId) => (
        <WindowItem
          key={windowId}
          windowId={windowId}
          world={world}
          isEditMode={isEditMode}
          windowCombiningEnabled={windowCombiningEnabled}
          renderPanel={renderPanel}
          panelDataVersion={panelDataVersion}
        />
      ))}
    </div>
  );
});

/** Props for individual window item */
interface WindowItemProps {
  windowId: string;
  world: ClientWorld | null;
  isEditMode: boolean;
  windowCombiningEnabled: boolean;
  renderPanel: (
    panelId: string,
    world?: ClientWorld,
    windowId?: string,
  ) => React.ReactNode;
  panelDataVersion?: number;
}

/**
 * Renders a single window with the appropriate content wrapper
 */
const WindowItem = memo(function WindowItem({
  windowId,
  world,
  isEditMode,
  windowCombiningEnabled,
  renderPanel,
}: WindowItemProps): React.ReactElement {
  const windowState = useWindowStore(
    useMemo(
      () => (state) => state.windows.get(windowId) as WindowState | undefined,
      [windowId],
    ),
  );

  if (!windowState || !windowState.visible) {
    return <></>;
  }

  const isActionBar = windowState.id.startsWith("actionbar-");
  const isMenuBar = windowState.id === "menubar-window";
  const isMinimap = windowState.id === "minimap-window";
  const hasMultipleTabs = windowState.tabs.length > 1;
  const showTabBar =
    !isActionBar && !isMenuBar && !isMinimap && hasMultipleTabs;
  const needsDraggableWrapper =
    !isActionBar && !isMenuBar && !isMinimap && !hasMultipleTabs;

  return (
    <div style={{ pointerEvents: "auto" }}>
      <Window
        windowId={windowState.id}
        windowState={windowState}
        isUnlocked={isEditMode}
        windowCombiningEnabled={windowCombiningEnabled}
      >
        {isActionBar ? (
          <ActionBarWrapper
            activeTabIndex={windowState.activeTabIndex}
            tabs={windowState.tabs}
            renderPanel={renderPanel}
            windowId={windowState.id}
          />
        ) : isMenuBar ? (
          <MenuBarWrapper
            activeTabIndex={windowState.activeTabIndex}
            tabs={windowState.tabs}
            renderPanel={renderPanel}
            windowId={windowState.id}
            isUnlocked={isEditMode}
          />
        ) : isMinimap ? (
          <MinimapWrapper world={world} isUnlocked={isEditMode} />
        ) : showTabBar ? (
          <TabBar windowId={windowState.id} />
        ) : null}

        {!isActionBar && !isMenuBar && !isMinimap && needsDraggableWrapper ? (
          <DraggableContentWrapper
            windowId={windowState.id}
            activeTabIndex={windowState.activeTabIndex}
            tabs={windowState.tabs}
            renderPanel={renderPanel}
            isUnlocked={isEditMode}
          />
        ) : !isActionBar && !isMenuBar && !isMinimap ? (
          <WindowContent
            activeTabIndex={windowState.activeTabIndex}
            tabs={windowState.tabs}
            renderPanel={renderPanel}
            windowId={windowState.id}
            isUnlocked={isEditMode}
          />
        ) : null}
      </Window>
    </div>
  );
});
