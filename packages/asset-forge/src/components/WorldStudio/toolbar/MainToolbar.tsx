/**
 * MainToolbar — Top toolbar with grouped tool modes, transform gizmo controls,
 * undo/redo, save indicator, and panel toggles.
 *
 * UE5-inspired layout:
 *   [Panel] | [ProjectName] | [Select|Place|Brush|Procgen|Path] | [Move|Rotate|Scale | Space] || [Undo|Redo] || [Save] | [Manifest|Automation|Deploy|Panel]
 */

import {
  Undo2,
  Redo2,
  Save,
  MousePointer,
  Plus,
  Paintbrush,
  PenTool,
  Mountain,
  Hexagon,
  PanelLeft,
  PanelRight,
  Loader2,
  Book,
  Rocket,
  Wand2,
  Sparkles,
  Move,
  RotateCw,
  Maximize2,
  Globe,
  Box,
  ChevronDown,
  Users,
  Trash2,
} from "lucide-react";
import React, { useState, useEffect } from "react";

import { commandHistory } from "../../../editor/commands";
import { useWorldStudio, type StudioToolMode } from "../WorldStudioContext";
import { useZoneAutoGen } from "../hooks/useZoneAutoGen";
import {
  GenerationWizardDialog,
  type WizardMode,
} from "../panels/GenerationWizardDialog";

// ---------------------------------------------------------------------------
// Tool definitions
// ---------------------------------------------------------------------------

interface ToolDef {
  mode: StudioToolMode;
  icon: typeof MousePointer;
  label: string;
  shortcut: string;
}

const TOOL_GROUPS: ToolDef[][] = [
  // Group 1: Selection + Placement
  [
    { mode: "select", icon: MousePointer, label: "Select", shortcut: "V" },
    { mode: "place", icon: Plus, label: "Place", shortcut: "P" },
  ],
  // Group 2: Painting + Zones + Procgen
  [
    { mode: "brush", icon: Paintbrush, label: "Brush", shortcut: "B" },
    { mode: "zonePaint", icon: Hexagon, label: "Zone", shortcut: "Z" },
    { mode: "procgen", icon: Mountain, label: "Procgen", shortcut: "G" },
  ],
  // Group 3: Utility
  [{ mode: "path", icon: PenTool, label: "Path", shortcut: "N" }],
];

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

/** Thin vertical divider */
function Divider() {
  return <div className="w-px h-5 bg-border-primary mx-1 flex-shrink-0" />;
}

/** Toolbar icon button with tooltip */
function ToolButton({
  icon: Icon,
  label,
  shortcut,
  active,
  disabled,
  onClick,
  size = 16,
  className = "",
}: {
  icon: typeof MousePointer;
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  size?: number;
  className?: string;
}) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      className={`p-1.5 rounded-md transition-colors relative ${
        active
          ? "text-primary bg-primary/15"
          : disabled
            ? "text-text-tertiary/30 cursor-not-allowed"
            : "text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
      } ${className}`}
      onClick={onClick}
      disabled={disabled}
      title={title}
    >
      <Icon size={size} />
      {active && (
        <span className="absolute bottom-0 left-1/2 -translate-x-1/2 w-3 h-0.5 bg-primary rounded-full" />
      )}
    </button>
  );
}

/** Dropdown menu item */
function DropdownItem({
  icon: Icon,
  label,
  onClick,
  destructive,
}: {
  icon: typeof MousePointer;
  label: string;
  onClick: () => void;
  destructive?: boolean;
}) {
  return (
    <button
      className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs transition-colors ${
        destructive
          ? "text-red-400 hover:bg-red-500/10"
          : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
      }`}
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
    >
      <Icon size={14} />
      {label}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export type RightPanelTab =
  | "properties"
  | "manifests"
  | "deployment"
  | "automation";

interface MainToolbarProps {
  leftPanelOpen: boolean;
  rightPanelOpen: boolean;
  activeRightTab: RightPanelTab;
  onToggleLeft: () => void;
  onToggleRight: () => void;
  onSetRightTab: (tab: RightPanelTab) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MainToolbar({
  leftPanelOpen,
  rightPanelOpen,
  activeRightTab,
  onToggleLeft,
  onToggleRight,
  onSetRightTab,
}: MainToolbarProps) {
  const { state, actions, computed } = useWorldStudio();
  const activeTool = state.tools.activeTool;
  const isSelectTool = activeTool === "select";
  const projectName = state.project.projectName;
  const hasUnsaved = computed.hasUnsavedChanges;

  // Subscribe to command history changes for undo/redo button state
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    return commandHistory.subscribe(() => forceUpdate((n) => n + 1));
  }, []);

  const canUndo = commandHistory.canUndo() || computed.canUndo;
  const canRedo = commandHistory.canRedo() || computed.canRedo;

  const handleUndo = () => {
    if (commandHistory.canUndo()) commandHistory.undo();
    else actions.undo();
  };
  const handleRedo = () => {
    if (commandHistory.canRedo()) commandHistory.redo();
    else actions.redo();
  };

  // Generation wizard
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardMode, setWizardMode] = useState<WizardMode>("full");
  const [genDropdownOpen, setGenDropdownOpen] = useState(false);
  const { clearAutogen } = useZoneAutoGen();

  // Save flash animation
  const [saveFlash, setSaveFlash] = useState(false);
  const handleSave = () => {
    if (!state.persistence.isSaving && hasUnsaved) {
      actions.saveStart();
      setSaveFlash(true);
      setTimeout(() => setSaveFlash(false), 600);
    }
  };

  return (
    <div className="h-10 flex items-center justify-between px-2 bg-bg-secondary border-b border-border-primary flex-shrink-0 select-none">
      {/* ============ LEFT SECTION ============ */}
      <div className="flex items-center gap-0.5 min-w-0">
        {/* Left panel toggle */}
        <ToolButton
          icon={PanelLeft}
          label="Toggle Outliner"
          active={leftPanelOpen}
          onClick={onToggleLeft}
        />

        {/* Project name with dirty indicator */}
        {projectName && (
          <>
            <Divider />
            <span className="text-xs font-medium text-text-secondary truncate max-w-[140px]">
              {hasUnsaved ? `${projectName} *` : projectName}
            </span>
          </>
        )}

        <Divider />

        {/* Tool mode groups with visual separators */}
        {TOOL_GROUPS.map((group, gi) => (
          <React.Fragment key={gi}>
            {gi > 0 && (
              <div className="w-px h-4 bg-border-primary mx-0.5 flex-shrink-0" />
            )}
            {group.map(({ mode, icon, label, shortcut }) => (
              <ToolButton
                key={mode}
                icon={icon}
                label={label}
                shortcut={shortcut}
                active={activeTool === mode}
                onClick={() => actions.setTool(mode)}
              />
            ))}
          </React.Fragment>
        ))}

        {/* Generation wizard dropdown */}
        <Divider />
        <div className="relative">
          <button
            className={`flex items-center gap-1 p-1.5 rounded-md transition-colors ${
              !computed.hasLoadedWorld
                ? "text-text-tertiary/30 cursor-not-allowed"
                : genDropdownOpen
                  ? "text-primary bg-primary/15"
                  : "text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
            }`}
            disabled={!computed.hasLoadedWorld}
            title="World Generation"
            onClick={() => setGenDropdownOpen((v) => !v)}
            onBlur={() => setTimeout(() => setGenDropdownOpen(false), 150)}
          >
            <Sparkles size={16} />
            <ChevronDown size={10} />
          </button>
          {genDropdownOpen && (
            <div className="absolute top-full left-0 mt-1 w-48 py-1 bg-bg-secondary border border-border-primary rounded-md shadow-xl z-50">
              <DropdownItem
                icon={Wand2}
                label="Full World Wizard"
                onClick={() => {
                  setWizardMode("full");
                  setWizardOpen(true);
                  setGenDropdownOpen(false);
                }}
              />
              <DropdownItem
                icon={Hexagon}
                label="Zones Only"
                onClick={() => {
                  setWizardMode("zones-only");
                  setWizardOpen(true);
                  setGenDropdownOpen(false);
                }}
              />
              <DropdownItem
                icon={Users}
                label="Population Only"
                onClick={() => {
                  setWizardMode("population-only");
                  setWizardOpen(true);
                  setGenDropdownOpen(false);
                }}
              />
              <div className="h-px bg-border-primary my-1" />
              <DropdownItem
                icon={Trash2}
                label="Clear All Procgen"
                onClick={() => {
                  clearAutogen();
                  setGenDropdownOpen(false);
                }}
                destructive
              />
            </div>
          )}
        </div>

        {/* Transform mode buttons — only when select tool active */}
        {isSelectTool && (
          <>
            <Divider />
            <ToolButton
              icon={Move}
              label="Translate"
              shortcut="W"
              active={state.tools.transformMode === "translate"}
              onClick={() => actions.setTransformMode("translate")}
              size={14}
            />
            <ToolButton
              icon={RotateCw}
              label="Rotate"
              shortcut="E"
              active={state.tools.transformMode === "rotate"}
              onClick={() => actions.setTransformMode("rotate")}
              size={14}
            />
            <ToolButton
              icon={Maximize2}
              label="Scale"
              shortcut="R"
              active={state.tools.transformMode === "scale"}
              onClick={() => actions.setTransformMode("scale")}
              size={14}
            />
            <div className="w-px h-4 bg-border-primary mx-0.5 flex-shrink-0" />
            <ToolButton
              icon={Globe}
              label="World Space"
              active={state.tools.transformSpace === "world"}
              onClick={() => actions.setTransformSpace("world")}
              size={14}
            />
            <ToolButton
              icon={Box}
              label="Local Space"
              active={state.tools.transformSpace === "local"}
              onClick={() => actions.setTransformSpace("local")}
              size={14}
            />
          </>
        )}
      </div>

      {/* ============ CENTER SECTION ============ */}
      <div className="flex items-center gap-0.5">
        <ToolButton
          icon={Undo2}
          label="Undo"
          shortcut="⌘Z"
          disabled={!canUndo}
          onClick={handleUndo}
        />
        <ToolButton
          icon={Redo2}
          label="Redo"
          shortcut="⌘⇧Z"
          disabled={!canRedo}
          onClick={handleRedo}
        />

        {/* Undo depth indicator */}
        {commandHistory.undoCount > 0 && (
          <span className="text-[9px] text-text-tertiary ml-0.5 tabular-nums">
            {commandHistory.undoCount}
          </span>
        )}
      </div>

      {/* ============ RIGHT SECTION ============ */}
      <div className="flex items-center gap-0.5">
        {/* Save button with flash feedback */}
        {computed.hasProject && (
          <button
            className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
              saveFlash
                ? "text-green-400 bg-green-400/10"
                : state.persistence.isSaving
                  ? "text-text-tertiary cursor-wait"
                  : hasUnsaved
                    ? "text-amber-400 hover:bg-amber-400/10"
                    : "text-text-tertiary hover:text-text-primary hover:bg-bg-tertiary"
            }`}
            onClick={handleSave}
            disabled={state.persistence.isSaving || !hasUnsaved}
            title={
              state.persistence.isSaving
                ? "Saving..."
                : hasUnsaved
                  ? "Save (⌘S)"
                  : "All changes saved"
            }
          >
            {state.persistence.isSaving ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Save size={14} />
            )}
            <span className="hidden sm:inline">
              {saveFlash
                ? "Saved!"
                : state.persistence.isSaving
                  ? "Saving"
                  : hasUnsaved
                    ? "Save"
                    : "Saved"}
            </span>
          </button>
        )}

        <Divider />

        {/* Right panel tabs — clicking opens the panel to that tab */}
        <ToolButton
          icon={Book}
          label="Manifest Browser"
          active={rightPanelOpen && activeRightTab === "manifests"}
          onClick={() => {
            if (rightPanelOpen && activeRightTab === "manifests") {
              onToggleRight();
            } else {
              onSetRightTab("manifests");
            }
          }}
        />
        <ToolButton
          icon={Wand2}
          label="Automation Tools"
          active={rightPanelOpen && activeRightTab === "automation"}
          onClick={() => {
            if (rightPanelOpen && activeRightTab === "automation") {
              onToggleRight();
            } else {
              onSetRightTab("automation");
            }
          }}
        />
        <ToolButton
          icon={Rocket}
          label="Deployment Pipeline"
          active={rightPanelOpen && activeRightTab === "deployment"}
          onClick={() => {
            if (rightPanelOpen && activeRightTab === "deployment") {
              onToggleRight();
            } else {
              onSetRightTab("deployment");
            }
          }}
        />

        <Divider />

        <ToolButton
          icon={PanelRight}
          label="Toggle Properties Panel"
          active={rightPanelOpen}
          onClick={onToggleRight}
        />
      </div>

      {/* Generation wizard dialog (portal) */}
      <GenerationWizardDialog
        open={wizardOpen}
        onClose={() => setWizardOpen(false)}
        mode={wizardMode}
      />
    </div>
  );
}
