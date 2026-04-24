/**
 * CanvasContextMenu — right-click menu over a selected widget box.
 *
 * Matches the action set authors expect from UE5 UMG / Figma / Photoshop:
 *   - Duplicate              Ctrl+D
 *   - Delete                 Delete
 *   - Bring to Front         Ctrl+Shift+]
 *   - Send to Back           Ctrl+Shift+[
 *   - Bring Forward          Ctrl+]
 *   - Send Backward          Ctrl+[
 *
 * The menu is purely presentational — it receives the target
 * instanceId and the list of store actions to dispatch, and the
 * parent owns placement (x/y) + dismissal. Positioning is clamped to
 * the viewport so the menu never gets cut off at the right/bottom
 * edge of the window.
 *
 * Dismissal is wired via a window-level mousedown + Escape listener
 * in an effect so clicking anywhere outside (or hitting Esc) closes
 * the menu. The menu's own clicks stop propagation.
 */

import {
  ArrowDown,
  ArrowUp,
  ChevronsDown,
  ChevronsUp,
  Copy,
  Trash2,
} from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";

export interface CanvasContextMenuProps {
  /** Pointer coords in **window** space (clientX/clientY). */
  x: number;
  y: number;
  /** Close without doing anything (background click, Escape). */
  onDismiss: () => void;

  // Store action bindings — passed in rather than imported here so
  // the menu stays a dumb presentational component. The parent
  // decides whether each command operates on the clicked instance
  // or the whole current selection, so these are nullary.
  onDuplicate: () => void;
  onDelete: () => void;
  onBringToFront: () => void;
  onSendToBack: () => void;
  onBringForward: () => void;
  onSendBackward: () => void;
}

interface MenuItem {
  label: string;
  shortcut?: string;
  icon: React.ReactNode;
  onClick: () => void;
  tone?: "default" | "danger";
}

export function CanvasContextMenu({
  x,
  y,
  onDismiss,
  onDuplicate,
  onDelete,
  onBringToFront,
  onSendToBack,
  onBringForward,
  onSendBackward,
}: CanvasContextMenuProps) {
  const menuRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ left: number; top: number }>({
    left: x,
    top: y,
  });

  // Clamp the menu to the window edges on first paint. Uses
  // useLayoutEffect so the clamp happens before the browser paints
  // the un-clamped position (avoids a single-frame flash off-edge).
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const margin = 4;
    const maxLeft = window.innerWidth - rect.width - margin;
    const maxTop = window.innerHeight - rect.height - margin;
    setPos({
      left: Math.max(margin, Math.min(x, maxLeft)),
      top: Math.max(margin, Math.min(y, maxTop)),
    });
  }, [x, y]);

  // Dismiss on outside click or Escape. `mousedown` rather than
  // `click` so the menu closes as soon as the user presses a button
  // on the background (matches native UI behaviour).
  useEffect(() => {
    const onMouseDown = (e: MouseEvent) => {
      if (menuRef.current && menuRef.current.contains(e.target as Node)) return;
      onDismiss();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.preventDefault();
        onDismiss();
      }
    };
    window.addEventListener("mousedown", onMouseDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("mousedown", onMouseDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [onDismiss]);

  const items: MenuItem[] = [
    {
      label: "Duplicate",
      shortcut: "Ctrl+D",
      icon: <Copy size={12} />,
      onClick: () => {
        onDuplicate();
        onDismiss();
      },
    },
    {
      label: "Delete",
      shortcut: "Del",
      icon: <Trash2 size={12} />,
      tone: "danger",
      onClick: () => {
        onDelete();
        onDismiss();
      },
    },
    {
      label: "Bring to Front",
      shortcut: "Ctrl+Shift+]",
      icon: <ChevronsUp size={12} />,
      onClick: () => {
        onBringToFront();
        onDismiss();
      },
    },
    {
      label: "Bring Forward",
      shortcut: "Ctrl+]",
      icon: <ArrowUp size={12} />,
      onClick: () => {
        onBringForward();
        onDismiss();
      },
    },
    {
      label: "Send Backward",
      shortcut: "Ctrl+[",
      icon: <ArrowDown size={12} />,
      onClick: () => {
        onSendBackward();
        onDismiss();
      },
    },
    {
      label: "Send to Back",
      shortcut: "Ctrl+Shift+[",
      icon: <ChevronsDown size={12} />,
      onClick: () => {
        onSendToBack();
        onDismiss();
      },
    },
  ];

  return (
    <div
      ref={menuRef}
      role="menu"
      className="fixed z-50 min-w-[196px] rounded-md border border-bg-tertiary bg-bg-secondary py-1 text-xs shadow-xl"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      {items.map((item, idx) => {
        const isDivider = idx === 2; // Separator before the Z-order group.
        return (
          <div key={item.label}>
            {isDivider ? (
              <div
                className="my-1 h-px bg-bg-tertiary"
                role="separator"
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              role="menuitem"
              onClick={item.onClick}
              className={
                "flex w-full items-center gap-2 px-2.5 py-1 text-left outline-none hover:bg-bg-primary " +
                (item.tone === "danger"
                  ? "text-red-400 hover:text-red-300"
                  : "text-text-secondary hover:text-text-primary")
              }
            >
              <span className="flex h-3.5 w-3.5 items-center justify-center text-text-tertiary">
                {item.icon}
              </span>
              <span className="flex-1">{item.label}</span>
              {item.shortcut ? (
                <span className="ml-4 font-mono text-[10px] text-text-tertiary">
                  {item.shortcut}
                </span>
              ) : null}
            </button>
          </div>
        );
      })}
    </div>
  );
}
