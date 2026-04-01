import { useState, useCallback } from "react";

interface ContextMenuState {
  visible: boolean;
  position: { x: number; y: number };
}

/**
 * Hook for managing context menu visibility and position.
 *
 * Usage:
 * ```tsx
 * const { contextMenu, showContextMenu, hideContextMenu } = useContextMenu();
 *
 * return (
 *   <div onContextMenu={showContextMenu}>
 *     {contextMenu.visible && (
 *       <ContextMenu
 *         items={items}
 *         position={contextMenu.position}
 *         onClose={hideContextMenu}
 *       />
 *     )}
 *   </div>
 * );
 * ```
 */
export function useContextMenu() {
  const [contextMenu, setContextMenu] = useState<ContextMenuState>({
    visible: false,
    position: { x: 0, y: 0 },
  });

  const showContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({
      visible: true,
      position: { x: e.clientX, y: e.clientY },
    });
  }, []);

  const hideContextMenu = useCallback(() => {
    setContextMenu((prev) => ({ ...prev, visible: false }));
  }, []);

  /** Show context menu at specific screen coordinates (no event needed). */
  const showContextMenuAt = useCallback((x: number, y: number) => {
    setContextMenu({ visible: true, position: { x, y } });
  }, []);

  return {
    contextMenu,
    showContextMenu,
    showContextMenuAt,
    hideContextMenu,
  } as const;
}
