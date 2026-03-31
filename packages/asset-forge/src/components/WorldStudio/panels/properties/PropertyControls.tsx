/**
 * PropertyControls — UE5 Details-Panel-style property editing components
 *
 * Provides consistent slider, number input, toggle, select, and text controls
 * used across all per-type property editors.
 *
 * UE5-style features:
 * - Drag-to-scrub on numeric labels (DragNumberInput)
 * - Inline fill-bar sliders with overlay text (SliderInput)
 * - Axis-colored position inputs (PositionEditor)
 * - Collapsible sections with accent bar (PropertySection)
 */

import { ChevronDown, ChevronRight } from "lucide-react";
import React, { useState, useCallback, useRef, useEffect } from "react";

// ============== HELPERS ==============

/** Clamp a number between min and max. */
function clamp(val: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, val));
}

/** Format a number for display: use fixed decimals for small steps, round otherwise. */
function formatValue(val: number, step: number): string {
  if (step < 0.01) return val.toFixed(3);
  if (step < 1) return val.toFixed(2);
  return String(Math.round(val * 100) / 100);
}

/** Compute fill percentage for a value within [min, max]. */
function fillPercent(val: number, min: number, max: number): number {
  if (max <= min) return 0;
  return clamp(((val - min) / (max - min)) * 100, 0, 100);
}

/** Snap a value to the nearest step. */
function snapToStep(val: number, step: number): number {
  return Math.round(val / step) * step;
}

// ============== DRAG-TO-SCRUB HOOK ==============

interface UseDragScrubOptions {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step: number;
  sensitivity?: number;
}

/**
 * Hook providing UE5-style drag-to-scrub on a label element.
 * Returns a ref to attach to the drag handle, plus isDragging state.
 *
 * Shift = 10x speed, Ctrl/Meta = 0.1x precision.
 */
function useDragScrub({
  value,
  onChange,
  min = -Infinity,
  max = Infinity,
  step,
  sensitivity = 1,
}: UseDragScrubOptions) {
  const handleRef = useRef<HTMLElement>(null);
  const dragState = useRef<{
    startX: number;
    startValue: number;
    active: boolean;
  } | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Keep latest value/onChange in ref so listeners always see current values
  const latestRef = useRef({ value, onChange, min, max, step, sensitivity });
  latestRef.current = { value, onChange, min, max, step, sensitivity };

  useEffect(() => {
    const el = handleRef.current;
    if (!el) return;

    const onMouseDown = (e: MouseEvent) => {
      // Only primary button
      if (e.button !== 0) return;
      e.preventDefault();
      dragState.current = {
        startX: e.clientX,
        startValue: latestRef.current.value,
        active: false,
      };

      const onMouseMove = (ev: MouseEvent) => {
        if (!dragState.current) return;
        const ds = dragState.current;
        if (!ds.active) {
          // Require a small deadzone (2px) before activating drag
          if (Math.abs(ev.clientX - ds.startX) < 2) return;
          ds.active = true;
          setIsDragging(true);
          document.body.style.cursor = "ew-resize";
          document.body.style.userSelect = "none";
        }

        const {
          min: lo,
          max: hi,
          step: s,
          sensitivity: sens,
          onChange: cb,
        } = latestRef.current;
        let multiplier = sens;
        if (ev.shiftKey) multiplier *= 10;
        if (ev.ctrlKey || ev.metaKey) multiplier *= 0.1;

        const dx = ev.clientX - ds.startX;
        const rawDelta = dx * s * multiplier;
        const newVal = clamp(snapToStep(ds.startValue + rawDelta, s), lo, hi);
        cb(newVal);
      };

      const onMouseUp = () => {
        dragState.current = null;
        setIsDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    };

    el.addEventListener("mousedown", onMouseDown);
    return () => {
      el.removeEventListener("mousedown", onMouseDown);
    };
  }, []);

  return { handleRef, isDragging };
}

// ============== INLINE EDIT HOOK ==============

/**
 * Hook for click-to-edit-precise-value behavior.
 * Returns editing state, value text, and handlers.
 */
function useInlineEdit(
  value: number,
  onChange: (v: number) => void,
  step: number,
  min?: number,
  max?: number,
) {
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const startEdit = useCallback(() => {
    setEditText(formatValue(value, step));
    setEditing(true);
  }, [value, step]);

  const commitEdit = useCallback(() => {
    setEditing(false);
    const parsed = parseFloat(editText);
    if (!isNaN(parsed)) {
      const lo = min ?? -Infinity;
      const hi = max ?? Infinity;
      onChange(clamp(snapToStep(parsed, step), lo, hi));
    }
  }, [editText, onChange, step, min, max]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        commitEdit();
      } else if (e.key === "Escape") {
        setEditing(false);
      }
    },
    [commitEdit],
  );

  // Auto-focus input when editing starts
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  return {
    editing,
    editText,
    setEditText,
    inputRef,
    startEdit,
    commitEdit,
    handleKeyDown,
  };
}

// ============== SECTION ==============

interface PropertySectionProps {
  title: string;
  icon?: React.ReactNode;
  defaultOpen?: boolean;
  badge?: string | number;
  /** Optional key for localStorage collapse memory. If provided, open/closed state persists. */
  persistKey?: string;
  children: React.ReactNode;
}

const SECTION_STORAGE_KEY = "worldstudio-sections";

function getSectionState(key: string): boolean | null {
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY);
    if (raw) {
      const map = JSON.parse(raw) as Record<string, boolean>;
      if (key in map) return map[key];
    }
  } catch {
    /* ignore */
  }
  return null;
}

function setSectionState(key: string, open: boolean) {
  try {
    const raw = localStorage.getItem(SECTION_STORAGE_KEY);
    const map = raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
    map[key] = open;
    localStorage.setItem(SECTION_STORAGE_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

export function PropertySection({
  title,
  icon,
  defaultOpen = true,
  badge,
  persistKey,
  children,
}: PropertySectionProps) {
  const [open, setOpen] = useState(() => {
    if (persistKey) {
      const saved = getSectionState(persistKey);
      if (saved !== null) return saved;
    }
    return defaultOpen;
  });

  const handleToggle = useCallback(() => {
    setOpen((v) => {
      const next = !v;
      if (persistKey) setSectionState(persistKey, next);
      return next;
    });
  }, [persistKey]);

  return (
    <div className="border-b border-border-primary">
      <button
        className="w-full flex items-center gap-1.5 px-3 py-1.5 bg-[#1a1a1a] hover:bg-bg-tertiary/50 transition-colors relative"
        onClick={handleToggle}
      >
        {/* UE5-style left accent bar when expanded */}
        {open && (
          <div className="absolute left-0 top-0 bottom-0 w-[2px] bg-primary" />
        )}
        {open ? (
          <ChevronDown size={8} className="text-text-tertiary/60" />
        ) : (
          <ChevronRight size={8} className="text-text-tertiary/60" />
        )}
        {icon && <span className="text-text-tertiary">{icon}</span>}
        <span className="text-[11px] font-semibold text-text-tertiary uppercase tracking-wider flex-1 text-left">
          {title}
        </span>
        {badge != null && (
          <span className="text-[10px] text-text-tertiary font-mono">
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-3 py-2 space-y-2">{children}</div>}
    </div>
  );
}

// ============== DRAG NUMBER INPUT ==============

interface DragNumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
  /** Drag speed multiplier (default 1). Higher = faster scrubbing. */
  sensitivity?: number;
}

/**
 * UE5-style drag-to-scrub numeric input.
 *
 * - Hover the label to see `ew-resize` cursor
 * - Drag left/right on the label to scrub the value
 * - Hold Shift for 10x speed, Ctrl for 0.1x precision
 * - The value display has an inline fill bar showing position in [min, max]
 * - Click the value text to type a precise number
 */
export function DragNumberInput({
  label,
  value,
  onChange,
  min = 0,
  max = 100,
  step = 1,
  unit,
  sensitivity = 1,
}: DragNumberInputProps) {
  const { handleRef, isDragging } = useDragScrub({
    value,
    onChange,
    min,
    max,
    step,
    sensitivity,
  });

  const {
    editing,
    editText,
    setEditText,
    inputRef,
    startEdit,
    commitEdit,
    handleKeyDown,
  } = useInlineEdit(value, onChange, step, min, max);

  const pct = fillPercent(value, min, max);

  return (
    <div className="flex items-center justify-between gap-2 group">
      {/* Draggable label */}
      <label
        ref={handleRef as React.RefObject<HTMLLabelElement>}
        className={`text-xs text-text-secondary select-none shrink-0 ${
          isDragging
            ? "cursor-ew-resize text-primary"
            : "cursor-ew-resize hover:text-primary"
        }`}
      >
        {label}
      </label>

      {/* Value display with fill bar */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className="w-20 px-1.5 py-0.5 text-xs bg-bg-tertiary border border-primary/50 rounded font-mono text-text-primary text-right focus:outline-none"
        />
      ) : (
        <div
          className="relative w-20 h-5 bg-bg-tertiary border border-border-primary rounded overflow-hidden cursor-text"
          onClick={startEdit}
        >
          {/* Fill bar */}
          <div
            className="absolute inset-y-0 left-0 bg-primary/20 transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
          {/* Value text */}
          <span className="relative z-10 flex items-center justify-end h-full px-1.5 text-xs font-mono text-text-primary">
            {formatValue(value, step)}
            {unit && (
              <span className="text-text-tertiary/60 ml-0.5">{unit}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ============== SLIDER INPUT (UE5 STYLE) ==============

interface SliderInputProps {
  label: React.ReactNode;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  hint?: string;
}

/**
 * UE5-style inline slider — the entire bar IS the slider.
 *
 * - A colored fill bar shows value position
 * - Numeric value overlays the bar as text
 * - Drag anywhere on the bar to change value
 * - Click the value text to type a precise number
 */
export function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
  hint,
}: SliderInputProps) {
  const barRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const {
    editing,
    editText,
    setEditText,
    inputRef,
    startEdit,
    commitEdit,
    handleKeyDown,
  } = useInlineEdit(value, onChange, step, min, max);

  // Compute value from mouse position on bar
  const valueFromMouse = useCallback(
    (clientX: number) => {
      const bar = barRef.current;
      if (!bar) return value;
      const rect = bar.getBoundingClientRect();
      const pct = clamp((clientX - rect.left) / rect.width, 0, 1);
      const raw = min + pct * (max - min);
      return clamp(snapToStep(raw, step), min, max);
    },
    [min, max, step, value],
  );

  // Keep latest onChange in a ref for event listeners
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const valueFromMouseRef = useRef(valueFromMouse);
  valueFromMouseRef.current = valueFromMouse;

  const handleBarMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      e.preventDefault();
      setDragging(true);
      const newVal = valueFromMouse(e.clientX);
      onChange(newVal);

      const onMouseMove = (ev: MouseEvent) => {
        const v = valueFromMouseRef.current(ev.clientX);
        onChangeRef.current(v);
      };

      const onMouseUp = () => {
        setDragging(false);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      };

      document.body.style.cursor = "ew-resize";
      document.body.style.userSelect = "none";
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [valueFromMouse, onChange],
  );

  const pct = fillPercent(value, min, max);

  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary block" title={hint}>
        {label}
      </label>

      {editing ? (
        <div className="flex items-center gap-1">
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="flex-1 px-1.5 py-0.5 text-xs bg-bg-tertiary border border-primary/50 rounded font-mono text-text-primary text-right focus:outline-none"
          />
          {unit && (
            <span className="text-[10px] text-text-tertiary">{unit}</span>
          )}
        </div>
      ) : (
        <div
          ref={barRef}
          className={`relative h-5 bg-bg-tertiary border rounded overflow-hidden select-none ${
            dragging
              ? "border-primary/50 cursor-ew-resize"
              : "border-border-primary cursor-ew-resize hover:border-border-hover"
          }`}
          onMouseDown={handleBarMouseDown}
          onDoubleClick={startEdit}
        >
          {/* Fill bar */}
          <div
            className="absolute inset-y-0 left-0 bg-primary/25 transition-[width] duration-75"
            style={{ width: `${pct}%` }}
          />
          {/* Value overlay text */}
          <span className="relative z-10 flex items-center justify-end h-full px-1.5 text-xs font-mono text-text-primary pointer-events-none">
            {formatValue(value, step)}
            {unit && (
              <span className="text-text-tertiary/60 ml-0.5">{unit}</span>
            )}
          </span>
        </div>
      )}
    </div>
  );
}

// ============== NUMBER INPUT (UE5 STYLE) ==============

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

/**
 * Upgraded NumberInput with drag-to-scrub on the label and a subtle
 * fill-bar background showing where in the range the value sits.
 */
export function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  unit,
}: NumberInputProps) {
  const { handleRef, isDragging } = useDragScrub({
    value,
    onChange,
    min,
    max,
    step,
    sensitivity: 1,
  });

  const {
    editing,
    editText,
    setEditText,
    inputRef,
    startEdit,
    commitEdit,
    handleKeyDown,
  } = useInlineEdit(value, onChange, step, min, max);

  const hasBounds = min != null && max != null;
  const pct = hasBounds ? fillPercent(value, min!, max!) : 0;

  return (
    <div className="flex items-center justify-between gap-2">
      {/* Draggable label */}
      <label
        ref={handleRef as React.RefObject<HTMLLabelElement>}
        className={`text-xs select-none shrink-0 ${
          isDragging
            ? "cursor-ew-resize text-primary"
            : "cursor-ew-resize text-text-secondary hover:text-primary"
        }`}
      >
        {label}
      </label>

      <div className="flex items-center gap-1">
        {editing ? (
          <input
            ref={inputRef}
            type="text"
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            onBlur={commitEdit}
            onKeyDown={handleKeyDown}
            className="w-16 px-1.5 py-0.5 text-xs bg-bg-tertiary border border-primary/50 rounded font-mono text-text-primary text-right focus:outline-none"
          />
        ) : (
          <div
            className="relative w-16 h-5 bg-bg-tertiary border border-border-primary rounded overflow-hidden cursor-text"
            onClick={startEdit}
          >
            {/* Subtle fill bar when bounds are known */}
            {hasBounds && (
              <div
                className="absolute inset-y-0 left-0 bg-primary/15 transition-[width] duration-75"
                style={{ width: `${pct}%` }}
              />
            )}
            <span className="relative z-10 flex items-center justify-end h-full px-1.5 text-xs font-mono text-text-primary">
              {formatValue(value, step)}
            </span>
          </div>
        )}
        {unit && <span className="text-[10px] text-text-tertiary">{unit}</span>}
      </div>
    </div>
  );
}

// ============== TEXT INPUT ==============

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
}: TextInputProps) {
  return (
    <div className="space-y-0.5">
      <label className="text-xs text-text-secondary">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full px-2 py-1 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary focus:outline-none focus:border-primary/50"
      />
    </div>
  );
}

// ============== TOGGLE ==============

interface ToggleProps {
  label: string;
  value: boolean;
  onChange: (value: boolean) => void;
}

export function Toggle({ label, value, onChange }: ToggleProps) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-text-secondary">{label}</label>
      <button
        className={`w-8 h-4 rounded-full transition-colors relative ${
          value ? "bg-primary" : "bg-bg-tertiary border border-border-primary"
        }`}
        onClick={() => onChange(!value)}
      >
        <div
          className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
            value ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}

// ============== SELECT ==============

interface SelectInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
}

export function SelectInput({
  label,
  value,
  onChange,
  options,
}: SelectInputProps) {
  return (
    <div className="flex items-center justify-between">
      <label className="text-xs text-text-secondary">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-1.5 py-0.5 text-xs bg-bg-tertiary border border-border-primary rounded text-text-primary focus:outline-none focus:border-primary/50"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ============== POSITION EDITOR (UE5 AXIS-COLORED) ==============

const AXIS_COLORS = {
  x: "border-l-red-500",
  y: "border-l-green-500",
  z: "border-l-blue-500",
} as const;

const AXIS_ACCENT = {
  x: "bg-red-500/15",
  y: "bg-green-500/15",
  z: "bg-blue-500/15",
} as const;

interface PositionEditorProps {
  label: string;
  position: { x: number; y: number; z: number };
  onChange: (position: { x: number; y: number; z: number }) => void;
}

/** Single axis input with drag-to-scrub and UE5 color coding. */
function AxisInput({
  axis,
  value,
  onChange,
}: {
  axis: "x" | "y" | "z";
  value: number;
  onChange: (v: number) => void;
}) {
  const step = 0.5;

  const { handleRef, isDragging } = useDragScrub({
    value,
    onChange,
    step,
    sensitivity: 0.5,
  });

  const {
    editing,
    editText,
    setEditText,
    inputRef,
    startEdit,
    commitEdit,
    handleKeyDown,
  } = useInlineEdit(value, onChange, step);

  const display = (Math.round(value * 10) / 10).toFixed(1);

  return (
    <div className="flex items-center gap-0.5">
      {/* Axis label — drag-to-scrub */}
      <span
        ref={handleRef as React.RefObject<HTMLSpanElement>}
        className={`text-[10px] uppercase w-3 text-center select-none font-semibold ${
          isDragging
            ? "cursor-ew-resize text-primary"
            : "cursor-ew-resize text-text-tertiary hover:text-text-secondary"
        }`}
      >
        {axis}
      </span>

      {/* Input with colored left border */}
      {editing ? (
        <input
          ref={inputRef}
          type="text"
          value={editText}
          onChange={(e) => setEditText(e.target.value)}
          onBlur={commitEdit}
          onKeyDown={handleKeyDown}
          className={`flex-1 w-full px-1 py-0.5 text-[11px] bg-bg-tertiary border border-primary/50 border-l-2 ${AXIS_COLORS[axis]} rounded font-mono text-text-primary text-right focus:outline-none`}
        />
      ) : (
        <div
          className={`relative flex-1 w-full h-5 bg-bg-tertiary border border-border-primary border-l-2 ${AXIS_COLORS[axis]} rounded overflow-hidden cursor-text`}
          onClick={startEdit}
        >
          {/* Subtle axis-colored tint */}
          <div className={`absolute inset-0 ${AXIS_ACCENT[axis]}`} />
          <span className="relative z-10 flex items-center justify-end h-full px-1 text-[11px] font-mono text-text-primary">
            {display}
          </span>
        </div>
      )}
    </div>
  );
}

export function PositionEditor({
  label,
  position,
  onChange,
}: PositionEditorProps) {
  const handleChange = useCallback(
    (axis: "x" | "y" | "z", value: number) => {
      onChange({ ...position, [axis]: value });
    },
    [position, onChange],
  );

  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary">{label}</label>
      <div className="grid grid-cols-3 gap-1">
        {(["x", "y", "z"] as const).map((axis) => (
          <AxisInput
            key={axis}
            axis={axis}
            value={position[axis]}
            onChange={(v) => handleChange(axis, v)}
          />
        ))}
      </div>
    </div>
  );
}

// ============== INFO ROW ==============

interface InfoRowProps {
  label: string;
  value: string | number | undefined;
}

export function InfoRow({ label, value }: InfoRowProps) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs text-text-tertiary">{label}</span>
      <span className="text-xs text-text-secondary font-mono">
        {value ?? "\u2014"}
      </span>
    </div>
  );
}
