/**
 * WidgetPropertyInspector — generates a form from the selected
 * widget's Zod propsSchema via `inspectWidgetProps`.
 *
 * Uses the existing WorldStudio PropertyControls atoms so it visually
 * matches the entity property editor.
 */

import {
  BindingParseError,
  inspectWidgetProps,
  parseBindingExpression,
  type LayoutAnchor,
  type LayoutVariantOverride,
  type UIOverridePosition,
  type UIPropField,
  type ViewportKey,
  type WidgetCustomization,
  type WidgetInstance,
  type WidgetPosition,
  type WidgetVisibilityRule,
} from "@hyperforge/ui-framework";
import { useEffect, useMemo, useState } from "react";
import {
  JsonInput,
  NumberInput,
  PropertySection,
  SelectInput,
  SliderInput,
  TagsInput,
  TextInput,
  Toggle,
} from "../WorldStudio/panels/properties/PropertyControls";
import { AnchorPicker } from "./AnchorPicker";
import { useCanvasViewStore } from "./canvasViewStore";
import { uiLayoutRegistry } from "./registry";
import { useUILayoutStore } from "./store";

export function WidgetPropertyInspector() {
  const selectedId = useUILayoutStore((s) => s.selectedInstanceId);
  const additionalSelectionIds = useUILayoutStore(
    (s) => s.additionalSelectionIds,
  );
  const instances = useUILayoutStore((s) => s.layout.instances);
  const grid = useUILayoutStore((s) => s.layout.grid);
  const updateProps = useUILayoutStore((s) => s.updateInstanceProps);
  const updateBinding = useUILayoutStore((s) => s.updateInstanceBinding);
  const updatePosition = useUILayoutStore((s) => s.updateInstancePosition);
  const updateCustomization = useUILayoutStore(
    (s) => s.updateInstanceCustomization,
  );
  const updateVisibility = useUILayoutStore((s) => s.updateInstanceVisibility);
  const variants = useUILayoutStore((s) => s.layout.variants);
  const updateVariantOverride = useUILayoutStore(
    (s) => s.updateVariantOverride,
  );
  const clearVariantOverride = useUILayoutStore((s) => s.clearVariantOverride);
  const activeVariant = useCanvasViewStore((s) => s.activeVariant);

  if (!selectedId) {
    return (
      <div className="p-3">
        <p className="text-xs text-text-tertiary">
          Select a widget to edit its properties.
        </p>
      </div>
    );
  }

  // Multi-select branch — the single-instance inspector below
  // assumes one target. When the author has several widgets selected
  // we show a summary + the subset of actions that make sense to
  // apply in bulk (delete, duplicate, z-order, and — when every
  // selected widget is anchored — a shared anchor override).
  if (additionalSelectionIds.length > 0) {
    const allIds = [selectedId, ...additionalSelectionIds];
    const selectedInstances = instances.filter((i) =>
      allIds.includes(i.instanceId),
    );
    // The above filter drops ids that no longer exist (e.g. mid-
    // undo). If nothing survived, fall through to the "selected
    // widget no longer exists" path by pretending we're single-select.
    if (selectedInstances.length > 1) {
      return <MultiSelectPanel instances={selectedInstances} />;
    }
  }

  const instance = instances.find((i) => i.instanceId === selectedId);
  if (!instance) {
    return (
      <div className="p-3 text-xs text-text-tertiary">
        Selected widget no longer exists.
      </div>
    );
  }

  const widget = uiLayoutRegistry.getWidget(instance.widgetId);
  if (!widget) {
    return (
      <div className="p-3 text-xs text-red-400">
        Widget id "{instance.widgetId}" is not registered.
      </div>
    );
  }

  const fields = inspectWidgetProps(widget);

  return (
    <div className="flex flex-col gap-2 p-3">
      <header className="flex flex-col">
        <h2 className="text-xs font-semibold text-text-primary">
          {widget.manifest.name}
        </h2>
        <p className="text-[10px] text-text-tertiary">{instance.instanceId}</p>
      </header>

      <PositionSection
        instance={instance}
        grid={grid}
        onChange={(next) => updatePosition(instance.instanceId, next)}
      />

      <PropertySection title="Props">
        {fields.map((field) => (
          <PropField
            key={field.key}
            field={field}
            value={instance.props[field.key]}
            onChange={(v) =>
              updateProps(instance.instanceId, { [field.key]: v })
            }
          />
        ))}
      </PropertySection>

      <PropertySection title="Bindings">
        <p className="text-[10px] text-text-tertiary">
          Bind a prop to a live expression (e.g. <code>$player.hp</code>). Leave
          blank to use the static prop value.
        </p>
        {fields.map((field) => (
          <BindingField
            key={field.key}
            field={field}
            value={instance.bindings?.[field.key] ?? ""}
            onCommit={(expr) =>
              updateBinding(instance.instanceId, field.key, expr)
            }
          />
        ))}
      </PropertySection>

      <CustomizationSection
        instance={instance}
        onChange={(patch) => updateCustomization(instance.instanceId, patch)}
      />

      <VisibilitySection
        instance={instance}
        onChange={(patch) => updateVisibility(instance.instanceId, patch)}
      />

      {activeVariant !== "base" && (
        <VariantOverrideSection
          viewport={activeVariant}
          instance={instance}
          override={
            variants?.[activeVariant]?.overrides.find(
              (o) => o.instanceId === instance.instanceId,
            ) ?? null
          }
          onPositionPatch={(patch) =>
            updateVariantOverride(activeVariant, instance.instanceId, {
              position: patch,
            })
          }
          onHiddenChange={(hidden) =>
            updateVariantOverride(activeVariant, instance.instanceId, {
              hidden,
            })
          }
          onClear={() =>
            clearVariantOverride(activeVariant, instance.instanceId)
          }
        />
      )}
    </div>
  );
}

// ---------- Multi-select panel ----------

/**
 * Inspector rendered when >1 widget is selected. Shows a summary of
 * what's in the selection and exposes the batched store actions
 * (delete, duplicate, z-order, and — when every member is anchored
 * — a shared anchor override). Per-widget props are intentionally
 * hidden: different widget kinds have different Zod schemas, so
 * editing "the prop" across heterogeneous selections is ambiguous.
 */
function MultiSelectPanel({ instances }: { instances: WidgetInstance[] }) {
  const removeInstances = useUILayoutStore((s) => s.removeInstances);
  const duplicateInstances = useUILayoutStore((s) => s.duplicateInstances);
  const moveInstancesToFront = useUILayoutStore((s) => s.moveInstancesToFront);
  const moveInstancesToBack = useUILayoutStore((s) => s.moveInstancesToBack);
  const moveInstancesForward = useUILayoutStore((s) => s.moveInstancesForward);
  const moveInstancesBackward = useUILayoutStore(
    (s) => s.moveInstancesBackward,
  );
  const updatePosition = useUILayoutStore((s) => s.updateInstancePosition);

  const ids = instances.map((i) => i.instanceId);

  // Breakdown by widget manifest name so the author can see what
  // kinds are in their selection without expanding a tree.
  const byKind = new Map<string, number>();
  for (const inst of instances) {
    const w = uiLayoutRegistry.getWidget(inst.widgetId);
    const name = w?.manifest.name ?? inst.widgetId;
    byKind.set(name, (byKind.get(name) ?? 0) + 1);
  }

  // Shared anchor — set only when every selected instance is
  // anchored AND they share the same anchor value. Otherwise we
  // either hide the control (mixed position kinds) or show it in
  // indeterminate state (mixed anchor values).
  const allAnchored = instances.every((i) => i.position.kind === "anchored");
  let sharedAnchor: LayoutAnchor | null = null;
  if (allAnchored) {
    const first =
      instances[0].position.kind === "anchored"
        ? instances[0].position.anchor
        : null;
    const allSame = instances.every(
      (i) => i.position.kind === "anchored" && i.position.anchor === first,
    );
    sharedAnchor = allSame ? first : null;
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <header className="flex flex-col">
        <h2 className="text-xs font-semibold text-text-primary">
          {instances.length} widgets selected
        </h2>
      </header>

      <PropertySection title="Selection">
        <ul className="space-y-0.5 text-[10px] text-text-secondary">
          {Array.from(byKind.entries()).map(([name, count]) => (
            <li key={name} className="flex justify-between">
              <span>{name}</span>
              <span className="font-mono text-text-tertiary">×{count}</span>
            </li>
          ))}
        </ul>
      </PropertySection>

      {allAnchored && (
        <PropertySection title="Anchor (applies to all)">
          <AnchorPicker
            value={sharedAnchor ?? "top-left"}
            onChange={(next) => {
              // Apply the chosen anchor to every anchored instance.
              // Offset is preserved so authors can use this to fix a
              // batch that was mistakenly anchored in different
              // corners. Non-anchored members are filtered above.
              for (const inst of instances) {
                if (inst.position.kind !== "anchored") continue;
                updatePosition(inst.instanceId, {
                  ...inst.position,
                  anchor: next,
                });
              }
            }}
            label={sharedAnchor === null ? "Anchor (mixed)" : "Anchor"}
          />
        </PropertySection>
      )}

      <PropertySection title="Actions">
        <div className="grid grid-cols-2 gap-1.5 text-[10px]">
          <BatchButton onClick={() => duplicateInstances(ids)}>
            Duplicate
          </BatchButton>
          <BatchButton onClick={() => removeInstances(ids)} tone="danger">
            Delete
          </BatchButton>
          <BatchButton onClick={() => moveInstancesToFront(ids)}>
            Bring to Front
          </BatchButton>
          <BatchButton onClick={() => moveInstancesToBack(ids)}>
            Send to Back
          </BatchButton>
          <BatchButton onClick={() => moveInstancesForward(ids)}>
            Bring Forward
          </BatchButton>
          <BatchButton onClick={() => moveInstancesBackward(ids)}>
            Send Backward
          </BatchButton>
        </div>
      </PropertySection>
    </div>
  );
}

function BatchButton({
  onClick,
  children,
  tone = "default",
}: {
  onClick: () => void;
  children: React.ReactNode;
  tone?: "default" | "danger";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={
        "rounded border px-2 py-1 text-left transition-colors " +
        (tone === "danger"
          ? "border-red-500/40 text-red-400 hover:bg-red-500/10"
          : "border-bg-tertiary text-text-primary hover:bg-bg-tertiary")
      }
    >
      {children}
    </button>
  );
}

// ---------- Position section ----------

interface PositionSectionProps {
  instance: WidgetInstance;
  grid: { columns: number; rows: number } | undefined;
  onChange: (next: WidgetPosition) => void;
}

/**
 * Default payloads used when the user switches position kinds. Chosen
 * to keep the widget at a sensible, visible place after the switch
 * (top-left anchor, first grid cell, default flex container).
 */
function defaultPositionFor(
  kind: WidgetPosition["kind"],
  current: WidgetPosition,
): WidgetPosition {
  if (kind === current.kind) return current;
  switch (kind) {
    case "anchored":
      return { kind: "anchored", anchor: "top-left", offset: { x: 12, y: 12 } };
    case "grid":
      return { kind: "grid", column: 0, row: 0, columnSpan: 1, rowSpan: 1 };
    case "flex":
      return { kind: "flex", container: "main", order: 0 };
  }
}

function PositionSection({ instance, grid, onChange }: PositionSectionProps) {
  const pos = instance.position;
  return (
    <PropertySection title="Position">
      <SelectInput
        label="Kind"
        value={pos.kind}
        onChange={(v) =>
          onChange(defaultPositionFor(v as WidgetPosition["kind"], pos))
        }
        options={[
          { value: "anchored", label: "Anchored (pixel offset)" },
          { value: "grid", label: "Grid (cell)" },
          { value: "flex", label: "Flex (container + order)" },
        ]}
      />

      {pos.kind === "anchored" && (
        <>
          <AnchorPicker
            value={pos.anchor}
            onChange={(v) => onChange({ ...pos, anchor: v })}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="Offset X"
              value={pos.offset.x}
              onChange={(v) =>
                onChange({ ...pos, offset: { ...pos.offset, x: v } })
              }
              step={1}
            />
            <NumberInput
              label="Offset Y"
              value={pos.offset.y}
              onChange={(v) =>
                onChange({ ...pos, offset: { ...pos.offset, y: v } })
              }
              step={1}
            />
          </div>
          {/* Explicit size. When unset (0) we strip the field so the
              widget falls back to its manifest-declared defaultSize.
              Resize handles write into these same fields — the
              inspector is just another way to drive the same value. */}
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="Width (px)"
              value={pos.width ?? 0}
              onChange={(v) => {
                const { width: _w, ...rest } = pos;
                onChange(v > 0 ? { ...rest, width: v } : rest);
              }}
              min={0}
              step={1}
            />
            <NumberInput
              label="Height (px)"
              value={pos.height ?? 0}
              onChange={(v) => {
                const { height: _h, ...rest } = pos;
                onChange(v > 0 ? { ...rest, height: v } : rest);
              }}
              min={0}
              step={1}
            />
          </div>
        </>
      )}

      {pos.kind === "grid" && (
        <>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="Column"
              value={pos.column}
              onChange={(v) =>
                onChange({
                  ...pos,
                  column: clampInt(v, 0, (grid?.columns ?? 24) - 1),
                })
              }
              min={0}
              max={(grid?.columns ?? 24) - 1}
              step={1}
            />
            <NumberInput
              label="Row"
              value={pos.row}
              onChange={(v) =>
                onChange({
                  ...pos,
                  row: clampInt(v, 0, (grid?.rows ?? 16) - 1),
                })
              }
              min={0}
              max={(grid?.rows ?? 16) - 1}
              step={1}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <NumberInput
              label="Column Span"
              value={pos.columnSpan ?? 1}
              onChange={(v) =>
                onChange({
                  ...pos,
                  columnSpan: clampInt(v, 1, grid?.columns ?? 24),
                })
              }
              min={1}
              max={grid?.columns ?? 24}
              step={1}
            />
            <NumberInput
              label="Row Span"
              value={pos.rowSpan ?? 1}
              onChange={(v) =>
                onChange({
                  ...pos,
                  rowSpan: clampInt(v, 1, grid?.rows ?? 16),
                })
              }
              min={1}
              max={grid?.rows ?? 16}
              step={1}
            />
          </div>
        </>
      )}

      {pos.kind === "flex" && (
        <>
          <TextInput
            label="Container"
            value={pos.container}
            onChange={(v) =>
              onChange({ ...pos, container: v.trim() || "main" })
            }
          />
          <NumberInput
            label="Order"
            value={pos.order}
            onChange={(v) => onChange({ ...pos, order: Math.trunc(v) })}
            step={1}
          />
        </>
      )}
    </PropertySection>
  );
}

function clampInt(v: number, min: number, max: number): number {
  const n = Math.trunc(v);
  if (!Number.isFinite(n)) return min;
  return Math.max(min, Math.min(max, n));
}

interface BindingFieldProps {
  field: UIPropField;
  value: string;
  onCommit: (expression: string | null) => void;
}

/**
 * Local binding-expression input. Tracks a draft string so the user
 * can type freely without partial expressions getting rejected, and
 * validates on blur via `parseBindingExpression`. Commits `null` when
 * the input is emptied so the store can prune the key from bindings.
 */
function BindingField({ field, value, onCommit }: BindingFieldProps) {
  const [draft, setDraft] = useState(value);

  // Re-sync draft when a different instance is selected or the store
  // changes the canonical value from elsewhere.
  useEffect(() => {
    setDraft(value);
  }, [value]);

  const error = useMemo<string | null>(() => {
    const trimmed = draft.trim();
    if (!trimmed) return null;
    try {
      parseBindingExpression(trimmed);
      return null;
    } catch (e) {
      return e instanceof BindingParseError ? e.message : "Invalid expression";
    }
  }, [draft]);

  const commit = () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      onCommit(null);
      return;
    }
    // Don't commit a syntactically invalid expression — keep the
    // draft on screen so the user can fix it.
    if (error) return;
    onCommit(trimmed);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs text-text-secondary">{field.label}</label>
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.currentTarget.blur();
          }
        }}
        placeholder="$namespace.path"
        className="w-full px-2 py-1.5 text-xs border rounded-[3px] text-text-primary placeholder:text-text-muted focus:outline-none font-mono"
        style={{
          background: "var(--input-bg)",
          borderColor: error ? "rgb(239, 68, 68)" : "var(--input-border)",
          boxShadow: "var(--input-shadow)",
        }}
      />
      {error && <p className="text-[10px] text-red-400">{error}</p>}
    </div>
  );
}

interface PropFieldProps {
  field: UIPropField;
  value: unknown;
  onChange: (v: unknown) => void;
}

function PropField({ field, value, onChange }: PropFieldProps) {
  switch (field.type) {
    case "text":
      return (
        <TextInput
          label={field.label}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
        />
      );
    case "boolean":
      return (
        <Toggle
          label={field.label}
          value={Boolean(value)}
          onChange={onChange as (v: boolean) => void}
        />
      );
    case "enum":
      return (
        <SelectInput
          label={field.label}
          value={String(value ?? "")}
          onChange={onChange as (v: string) => void}
          options={(field.options ?? []).map((o) => ({ value: o, label: o }))}
        />
      );
    case "slider":
      return (
        <SliderInput
          label={field.label}
          value={Number(value ?? field.min ?? 0)}
          onChange={onChange as (v: number) => void}
          min={field.min ?? 0}
          max={field.max ?? 100}
          step={field.integer ? 1 : undefined}
          hint={field.description}
        />
      );
    case "integer":
    case "number":
      return (
        <NumberInput
          label={field.label}
          value={Number(value ?? 0)}
          onChange={onChange as (v: number) => void}
          min={field.min}
          max={field.max}
          step={field.integer ? 1 : undefined}
        />
      );
    case "json":
    default:
      return (
        <JsonInput label={field.label} value={value} onChange={onChange} />
      );
  }
}

// ---------- Customization section ----------

interface CustomizationSectionProps {
  instance: WidgetInstance;
  onChange: (patch: Partial<WidgetCustomization>) => void;
}

/**
 * Author-facing "Customization" editor. Exposes the per-widget
 * customization policy (`movable`, `resizable`, min/max size, per-widget
 * grid snap) so designers can decide which HUD elements a player is
 * allowed to tweak at runtime. Every field is optional — absent means
 * "use the layout's global customization default" at resolve time.
 */
function CustomizationSection({
  instance,
  onChange,
}: CustomizationSectionProps) {
  const c = instance.customization ?? {};
  // Helper that preserves "undefined = unchanged" semantics of the
  // store update while still letting the user clear a value by unchecking
  // the corresponding enable toggle.
  const patch = (next: Partial<WidgetCustomization>) => onChange(next);

  return (
    <PropertySection title="Customization">
      <p className="text-[10px] text-text-tertiary">
        Runtime policy — what players can do to this widget in HUD edit mode.
        Leave a field off to inherit layout-wide defaults.
      </p>
      <Toggle
        label="Movable"
        value={c.movable === true}
        onChange={(v) => patch({ movable: v })}
      />
      <Toggle
        label="Resizable"
        value={c.resizable === true}
        onChange={(v) => patch({ resizable: v })}
      />
      <Toggle
        label="Lockable"
        value={c.lockable === true}
        onChange={(v) => patch({ lockable: v })}
      />

      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Min W"
          value={c.minWidth ?? 0}
          onChange={(v) => patch({ minWidth: v > 0 ? v : undefined })}
          min={0}
          step={1}
        />
        <NumberInput
          label="Max W"
          value={c.maxWidth ?? 0}
          onChange={(v) => patch({ maxWidth: v > 0 ? v : undefined })}
          min={0}
          step={1}
        />
        <NumberInput
          label="Min H"
          value={c.minHeight ?? 0}
          onChange={(v) => patch({ minHeight: v > 0 ? v : undefined })}
          min={0}
          step={1}
        />
        <NumberInput
          label="Max H"
          value={c.maxHeight ?? 0}
          onChange={(v) => patch({ maxHeight: v > 0 ? v : undefined })}
          min={0}
          step={1}
        />
      </div>

      <NumberInput
        label="Snap grid (px)"
        value={c.snapToGrid ?? 0}
        onChange={(v) => patch({ snapToGrid: v > 0 ? v : undefined })}
        min={0}
        step={1}
      />
      <NumberInput
        label="Aspect ratio (W÷H)"
        value={c.aspectRatio ?? 0}
        onChange={(v) => patch({ aspectRatio: v > 0 ? v : undefined })}
        min={0}
        step={0.1}
      />
    </PropertySection>
  );
}

// ---------- Visibility section ----------

interface VisibilitySectionProps {
  instance: WidgetInstance;
  onChange: (patch: Partial<WidgetVisibilityRule>) => void;
}

/**
 * Author-facing "Visibility" editor (U8). Exposes the three gate
 * fields the runtime evaluator understands. Every field is optional
 * and combined with AND at runtime — empty rule = "defer to the
 * `visible` flag". Expression validation is local-only (same parse
 * path the runtime uses); an invalid expression is persisted so the
 * author can keep typing, but a warning is shown and the runtime
 * fails closed.
 */
function VisibilitySection({ instance, onChange }: VisibilitySectionProps) {
  const rule = instance.visibility ?? {};

  // Local expression state lets us validate on blur/commit instead of
  // every keystroke, matching the BindingField UX in the Bindings
  // section above.
  const [exprDraft, setExprDraft] = useState(rule.expression ?? "");
  useEffect(() => {
    setExprDraft(rule.expression ?? "");
  }, [rule.expression, instance.instanceId]);

  // Trim + parse the draft to surface typos before commit. The
  // runtime also fails closed on an invalid expression, so this is
  // author-facing feedback, not a gate on commit.
  let exprError: string | null = null;
  if (exprDraft.trim().length > 0) {
    try {
      parseBindingExpression(exprDraft.trim());
    } catch (err) {
      exprError =
        err instanceof BindingParseError ? err.message : "Invalid expression";
    }
  }

  const commitExpr = (next: string) => {
    const trimmed = next.trim();
    if (trimmed.length === 0) {
      onChange({ expression: undefined });
    } else {
      onChange({ expression: trimmed });
    }
  };

  const commitTagList = (key: "contexts" | "hiddenIn", next: string[]) => {
    const cleaned = next.map((s) => s.trim()).filter((s) => s.length > 0);
    onChange({ [key]: cleaned.length > 0 ? cleaned : undefined });
  };

  return (
    <PropertySection title="Visibility">
      <p className="text-[10px] text-text-tertiary">
        Gate this widget on game context or a live expression. Rules are
        combined with AND — all must pass. Leave empty to always render.
      </p>

      <TagsInput
        label="Visible in (contexts)"
        value={rule.contexts ?? []}
        onChange={(next) => commitTagList("contexts", next)}
      />
      <TagsInput
        label="Hidden in (contexts)"
        value={rule.hiddenIn ?? []}
        onChange={(next) => commitTagList("hiddenIn", next)}
      />

      <div className="space-y-1">
        <label className="text-xs text-text-secondary">Expression</label>
        <input
          type="text"
          value={exprDraft}
          onChange={(e) => setExprDraft(e.target.value)}
          onBlur={() => commitExpr(exprDraft)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          placeholder="$player.inCombat"
          className="w-full px-2 py-1.5 text-xs border rounded-[3px] text-text-primary placeholder:text-text-muted focus:outline-none font-mono"
          style={{
            background: "var(--input-bg)",
            borderColor: exprError ? "rgb(239, 68, 68)" : "var(--input-border)",
            boxShadow: "var(--input-shadow)",
          }}
        />
        {exprError ? (
          <p className="text-[10px] text-red-400">{exprError}</p>
        ) : null}
      </div>
    </PropertySection>
  );
}

// ---------- Variant override section ----------

const VARIANT_LABELS: Record<ViewportKey, string> = {
  mobile: "Mobile",
  tablet: "Tablet",
  desktop: "Desktop",
};

interface VariantOverrideSectionProps {
  viewport: ViewportKey;
  instance: WidgetInstance;
  override: LayoutVariantOverride | null;
  onPositionPatch: (patch: Partial<UIOverridePosition>) => void;
  onHiddenChange: (hidden: boolean | undefined) => void;
  onClear: () => void;
}

/**
 * Viewport-scoped override editor (U9). Only rendered when the
 * ViewportSwitcher has selected a non-base variant. Writes land in
 * `layout.variants[viewport].overrides[]` via the store's
 * `updateVariantOverride` / `clearVariantOverride` actions, leaving
 * the authored base props untouched.
 *
 * Fields are intentionally minimal — just what the schema supports:
 *   - position offset (x/y) override
 *   - hidden toggle (drop the widget in this viewport)
 *
 * `width`/`height` overrides aren't exposed yet because the store
 * action's `position` patch doesn't thread them through today. When
 * the schema + store are extended they can be added here without
 * schema churn.
 */
function VariantOverrideSection({
  viewport,
  override,
  onPositionPatch,
  onHiddenChange,
  onClear,
}: VariantOverrideSectionProps) {
  const pos = override?.position ?? {};
  const hidden = override?.hidden === true;
  const hasAnyOverride =
    override !== null &&
    (pos.offsetX !== undefined ||
      pos.offsetY !== undefined ||
      override.hidden !== undefined);

  return (
    <PropertySection title={`${VARIANT_LABELS[viewport]} variant`}>
      <p className="text-[10px] text-text-tertiary">
        Overrides apply only on <b>{VARIANT_LABELS[viewport].toLowerCase()}</b>.
        Fields left blank fall back to the base layout at runtime.
      </p>

      <Toggle
        label="Hidden in this viewport"
        value={hidden}
        onChange={(next) => onHiddenChange(next ? true : undefined)}
      />

      <div className="grid grid-cols-2 gap-2">
        <NumberInput
          label="Offset X"
          value={pos.offsetX ?? 0}
          onChange={(v) => onPositionPatch({ offsetX: v })}
        />
        <NumberInput
          label="Offset Y"
          value={pos.offsetY ?? 0}
          onChange={(v) => onPositionPatch({ offsetY: v })}
        />
      </div>

      {hasAnyOverride ? (
        <button
          type="button"
          onClick={onClear}
          className="w-full rounded border border-bg-tertiary bg-bg-secondary px-2 py-1 text-[11px] text-text-secondary hover:border-red-400/50 hover:text-red-400"
          title={`Remove this widget's ${viewport} override entirely`}
        >
          Clear {VARIANT_LABELS[viewport].toLowerCase()} override
        </button>
      ) : (
        <p className="text-[10px] italic text-text-tertiary">
          No {viewport} override yet — edits above will create one.
        </p>
      )}
    </PropertySection>
  );
}
