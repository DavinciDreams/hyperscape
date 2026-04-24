/**
 * ItemIconContext — pluggable icon renderer for widgets that show items.
 *
 * The default renderer is purely visual (a small text chip showing the
 * item id prefix). Real consumers — the game client and the UI Layout
 * Editor preview — provide their own renderer that pulls iconPath from
 * the item manifest and emits an <img>.
 *
 * Using a React context means widgets stay dependency-free at the
 * package level: no `@hyperforge/shared` pull-in, no runtime asset URL
 * resolution, no item manifest lookup.
 */

import {
  createContext,
  memo,
  useContext,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";

export interface ItemIconRenderProps {
  itemId: string;
  size?: number;
  className?: string;
  style?: CSSProperties;
}

export type ItemIconRenderer = ComponentType<ItemIconRenderProps>;

/**
 * Default icon — a subtle text chip with the first 3 characters of the
 * item id. Good enough for the editor preview when no runtime is wired.
 */
const DefaultItemIcon: ItemIconRenderer = memo(function DefaultItemIcon({
  itemId,
  size = 24,
  className,
  style,
}: ItemIconRenderProps) {
  return (
    <div
      className={className}
      style={{
        width: size,
        height: size,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "rgba(255, 255, 255, 0.08)",
        border: "1px solid rgba(255, 255, 255, 0.12)",
        borderRadius: 3,
        fontSize: Math.max(8, size / 3),
        fontWeight: 600,
        color: "#a5b4fc",
        fontFamily: "Inter, system-ui, sans-serif",
        textTransform: "uppercase",
        letterSpacing: 0.5,
        ...style,
      }}
    >
      {itemId.replace(/_noted$/, "").slice(0, 3)}
    </div>
  );
});

const ItemIconContext = createContext<ItemIconRenderer>(DefaultItemIcon);

export interface ItemIconProviderProps {
  /**
   * Icon renderer to use for all item-bearing widgets inside this
   * subtree. Omit to use the built-in default (a small text chip),
   * which is fine for the editor preview when no production icon
   * pipeline is available.
   */
  render?: ItemIconRenderer;
  children: ReactNode;
}

export function ItemIconProvider({ render, children }: ItemIconProviderProps) {
  return (
    <ItemIconContext.Provider value={render ?? DefaultItemIcon}>
      {children}
    </ItemIconContext.Provider>
  );
}

/**
 * Hook to get the current ItemIcon renderer. Every widget that needs
 * to draw item icons should use this instead of importing a concrete
 * component — keeps the widget package consumer-agnostic.
 */
export function useItemIcon(): ItemIconRenderer {
  return useContext(ItemIconContext);
}
