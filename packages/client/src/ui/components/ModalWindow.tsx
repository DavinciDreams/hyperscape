/**
 * Modal Window Component
 *
 * A modal wrapper that displays a Window component with a backdrop overlay.
 * Used for Bank, Store, Dialogue, and other modal panels.
 *
 * Features:
 * - Semi-transparent backdrop overlay
 * - Centered positioning
 * - Click-outside-to-close behavior (optional)
 * - Escape key to close (optional)
 * - Smooth enter/exit animations
 *
 * @packageDocumentation
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
} from "react";
import {
  getPanelHeaderStyle,
  getPanelSurfaceStyle,
  getShellControlButtonStyle,
} from "../theme/themes";
import { useTheme } from "../stores/themeStore";

/** Modal window props */
export interface ModalWindowProps {
  /** Whether the modal is visible */
  visible: boolean;
  /** Called when modal should close */
  onClose: () => void;
  /** Modal title (displayed in header) */
  title: string;
  /** Modal content */
  children: ReactNode;
  /** Close when clicking backdrop (default: true) */
  closeOnBackdropClick?: boolean;
  /** Close when pressing Escape (default: true) */
  closeOnEscape?: boolean;
  /** Modal width (default: auto) */
  width?: number | string;
  /** Modal max width (default: 90vw) */
  maxWidth?: number | string;
  /** Modal max height (default: 90vh) */
  maxHeight?: number | string;
  /** Custom z-index (default: 10000) */
  zIndex?: number;
  /** Show close button in header (default: true) */
  showCloseButton?: boolean;
  /** Additional class name for the modal container */
  className?: string;
  /** Additional style for the modal container */
  style?: CSSProperties;
}

/**
 * Modal Window component
 *
 * @example
 * ```tsx
 * function BankModal() {
 *   const [isOpen, setIsOpen] = useState(false);
 *
 *   return (
 *     <ModalWindow
 *       visible={isOpen}
 *       onClose={() => setIsOpen(false)}
 *       title="Bank"
 *       width={800}
 *     >
 *       <BankPanel />
 *     </ModalWindow>
 *   );
 * }
 * ```
 */
export const ModalWindow = memo(function ModalWindow({
  visible,
  onClose,
  title,
  children,
  closeOnBackdropClick = true,
  closeOnEscape = true,
  width,
  maxWidth = "90vw",
  maxHeight = "90vh",
  zIndex = 10000,
  showCloseButton = true,
  className,
  style,
}: ModalWindowProps): React.ReactElement | null {
  const theme = useTheme();
  const modalRef = useRef<HTMLDivElement>(null);
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

  // Handle escape key
  useEffect(() => {
    if (!visible || !closeOnEscape) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [visible, closeOnEscape, onClose]);

  // Handle backdrop click
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (closeOnBackdropClick && e.target === e.currentTarget) {
        onClose();
      }
    },
    [closeOnBackdropClick, onClose],
  );

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (visible) {
      const originalOverflow = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = originalOverflow;
      };
    }
  }, [visible]);

  // Focus trap - focus modal when opened
  useEffect(() => {
    if (visible && modalRef.current) {
      modalRef.current.focus();
    }
  }, [visible]);

  if (!visible) {
    return null;
  }

  // Backdrop styles
  const backdropStyle: CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    backgroundImage:
      "radial-gradient(circle at top, rgba(255, 255, 255, 0.04), transparent 42%)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex,
    animation: reduceMotion ? undefined : "modalFadeIn 0.2s ease-out",
    // CRITICAL: Enable pointer events to block clicks from reaching the game canvas
    // CoreUI parent has pointer-events: none, so we must explicitly enable them here
    pointerEvents: "auto",
  };

  // Modal container styles
  const modalStyle: CSSProperties = {
    position: "relative",
    width: width ?? "auto",
    maxWidth,
    maxHeight,
    display: "flex",
    flexDirection: "column",
    ...getPanelSurfaceStyle(theme, { emphasis: "strong" }),
    borderRadius: theme.borderRadius.xl,
    boxShadow: `${theme.shadows.xl}, inset 0 1px 0 rgba(255, 255, 255, 0.08)`,
    overflow: "hidden",
    animation: reduceMotion ? undefined : "modalSlideIn 0.22s ease-out",
    outline: "none",
    ...style,
  };

  // Header styles
  const headerStyle: CSSProperties = {
    ...getPanelHeaderStyle(theme),
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: `${theme.spacing.sm}px ${theme.spacing.md}px`,
    userSelect: "none",
    position: "relative",
    zIndex: 5,
    pointerEvents: "auto",
  };

  // Title styles
  const titleStyle: CSSProperties = {
    fontSize: theme.typography.fontSize.lg,
    fontWeight: theme.typography.fontWeight.semibold,
    color: theme.colors.text.primary,
    margin: 0,
  };

  // Close button styles
  const closeButtonStyle: CSSProperties = {
    ...getShellControlButtonStyle(theme, "danger"),
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 28,
    height: 28,
    fontSize: 18,
    position: "relative",
    zIndex: 10,
    pointerEvents: "auto",
  };

  // Content styles
  const contentStyle: CSSProperties = {
    flex: 1,
    overflow: "auto",
    padding: theme.spacing.md,
    background:
      theme.name === "hyperscape"
        ? "linear-gradient(180deg, rgba(255, 255, 255, 0.015) 0%, rgba(0, 0, 0, 0.12) 100%)"
        : "transparent",
    pointerEvents: "auto",
  };

  return (
    <>
      {/* Global keyframes for animations */}
      <style>
        {`
          @keyframes modalFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
          @keyframes modalSlideIn {
            from { 
              opacity: 0;
              transform: scale(0.95) translateY(-10px);
            }
            to { 
              opacity: 1;
              transform: scale(1) translateY(0);
            }
          }
        `}
      </style>

      {/* Backdrop */}
      <div
        style={backdropStyle}
        onClick={handleBackdropClick}
        onMouseDown={(e) => {
          (e.nativeEvent as PointerEvent & { isCoreUI?: boolean }).isCoreUI =
            true;
        }}
        onPointerDown={(e) => {
          (e.nativeEvent as PointerEvent & { isCoreUI?: boolean }).isCoreUI =
            true;
        }}
        onContextMenu={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        role="presentation"
      >
        {/* Modal */}
        <div
          ref={modalRef}
          style={modalStyle}
          className={className}
          role="dialog"
          aria-modal="true"
          aria-label={title}
          tabIndex={-1}
          onMouseDown={(e) => {
            (e.nativeEvent as PointerEvent & { isCoreUI?: boolean }).isCoreUI =
              true;
          }}
          onPointerDown={(e) => {
            (e.nativeEvent as PointerEvent & { isCoreUI?: boolean }).isCoreUI =
              true;
          }}
          onContextMenu={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
        >
          {/* Header */}
          <div style={headerStyle}>
            <h2 id="modal-title" style={titleStyle}>
              {title}
            </h2>
            {showCloseButton && (
              <button
                style={closeButtonStyle}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose();
                }}
                onMouseDown={(e) => {
                  e.stopPropagation();
                }}
                onPointerDown={(e) => {
                  e.stopPropagation();
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.backgroundColor = String(
                    closeButtonStyle["--shell-button-hover-bg"],
                  );
                  e.currentTarget.style.color = String(
                    closeButtonStyle["--shell-button-hover-fg"],
                  );
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.backgroundColor = String(
                    closeButtonStyle.background,
                  );
                  e.currentTarget.style.color = String(closeButtonStyle.color);
                }}
                aria-label="Close modal"
                type="button"
              >
                ✕
              </button>
            )}
          </div>

          {/* Content */}
          <div style={contentStyle}>{children}</div>
        </div>
      </div>
    </>
  );
});

export default ModalWindow;
