import React, {
  useEffect,
  useId,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from "react";
import { X } from "lucide-react";
import { UI, useThemeStore } from "@/ui";
import {
  getPanelHeaderStyle,
  getPanelSurfaceStyle,
  getShellControlButtonStyle,
} from "@/ui/theme/themes";

interface DialoguePopupShellProps {
  visible: boolean;
  title: string;
  children: ReactNode;
  onClose: () => void;
  width?: number | string;
  maxWidth?: number | string;
  maxHeight?: number | string;
  contentStyle?: CSSProperties;
}

export function DialoguePopupShell({
  visible,
  title,
  children,
  onClose,
  width = 700,
  maxWidth = "min(86vw, 700px)",
  maxHeight = "min(40vh, 400px)",
  contentStyle,
}: DialoguePopupShellProps) {
  const theme = useThemeStore((s) => s.theme);
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  const [isCloseHovered, setIsCloseHovered] = useState(false);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    panelRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") {
        return;
      }

      event.preventDefault();
      event.stopPropagation();
      onCloseRef.current();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [visible]);

  if (!visible) {
    return null;
  }

  const closeButtonStyle = {
    ...getShellControlButtonStyle(theme, "danger"),
    width: 22,
    height: 22,
  } satisfies CSSProperties;
  const closeButtonHoverBackground =
    "var(--shell-button-hover-bg)" as CSSProperties["background"];
  const closeButtonHoverColor =
    "var(--shell-button-hover-fg)" as CSSProperties["color"];

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      data-modal="true"
      className="fixed inset-0 flex items-end justify-center p-4 md:px-6 md:pt-6"
      style={{
        zIndex: UI.Z_INDEX.MODAL,
        pointerEvents: "auto",
        paddingBottom: "clamp(2.5rem, 5vh, 4.75rem)",
      }}
      onMouseDown={(e) => {
        (e.nativeEvent as PointerEvent & { isCoreUI?: boolean }).isCoreUI =
          true;
      }}
      onPointerDown={(e) => {
        (e.nativeEvent as PointerEvent & { isCoreUI?: boolean }).isCoreUI =
          true;
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        className="relative flex w-full flex-col overflow-hidden outline-none"
        style={{
          width,
          maxWidth,
          maxHeight,
          borderRadius: theme.borderRadius.xl,
          ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
          boxShadow: `${theme.shadows.lg}, inset 0 1px 0 rgba(255, 255, 255, 0.07), inset 0 0 18px rgba(92, 103, 118, 0.05)`,
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="absolute left-1/2 top-0 h-[3px] w-[62%] -translate-x-1/2"
          style={{
            background: `linear-gradient(to right, transparent, ${theme.colors.accent.gold}cc, transparent)`,
          }}
        />

        <div
          className="flex items-center justify-between gap-3 px-4 py-1.5 md:px-5 md:py-1.5"
          style={{
            ...getPanelHeaderStyle(theme),
            minHeight: 32,
          }}
        >
          <h2
            id={titleId}
            className="m-0 text-[0.9rem] font-bold tracking-[0.005em]"
            style={{
              color: theme.colors.text.primary,
              fontFamily: theme.typography.fontFamily.heading,
            }}
          >
            {title}
          </h2>

          <button
            type="button"
            aria-label="Close dialogue"
            style={{
              ...closeButtonStyle,
              background: isCloseHovered
                ? closeButtonHoverBackground
                : closeButtonStyle.background,
              color: isCloseHovered
                ? closeButtonHoverColor
                : closeButtonStyle.color,
            }}
            onClick={onClose}
            onMouseEnter={() => setIsCloseHovered(true)}
            onMouseLeave={() => setIsCloseHovered(false)}
          >
            <X size={18} />
          </button>
        </div>

        <div
          className="min-h-0 flex-1 overflow-hidden px-3 py-3 md:px-4 md:py-3"
          style={contentStyle}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
