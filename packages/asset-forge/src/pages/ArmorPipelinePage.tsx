import { Layers, Wand2, Package, Paintbrush } from "lucide-react";
import React, { useState, useCallback } from "react";

import { ArmorPreviewTab } from "@/components/ArmorPipeline/ArmorPreviewTab";
import { ShellGeneratorTab } from "@/components/ArmorPipeline/ShellGeneratorTab";
import { TextureGeneratorTab } from "@/components/ArmorPipeline/TextureGeneratorTab";
import type { ShellMesh } from "@/services/armor-pipeline/types";

/** A textured armor piece ready for rigging */
export interface ArmorKitPiece {
  shell: ShellMesh;
  texturedUrl: string;
}

type PipelineTab = "shells" | "textures" | "tripo" | "preview";

const TABS: {
  id: PipelineTab;
  label: string;
  icon: typeof Layers;
  description: string;
}[] = [
  {
    id: "shells",
    label: "Shell Generator",
    icon: Layers,
    description: "POC-1: Extract body regions & generate offset shells",
  },
  {
    id: "textures",
    label: "Texture Generator",
    icon: Paintbrush,
    description: "POC-2: AI texture generation on shells via Meshy",
  },
  {
    id: "tripo",
    label: "Tripo Pipeline",
    icon: Wand2,
    description: "POC-3/4/5: Tripo AI generation, segmentation & texturing",
  },
  {
    id: "preview",
    label: "Armor Preview",
    icon: Package,
    description: "POC-3: Re-rig textured shell & preview on animated avatar",
  },
];

export const ArmorPipelinePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState<PipelineTab>("shells");

  // Armor kit: map of "slot_bulk" → piece data (accumulated from Texture Generator)
  const [armorKit, setArmorKit] = useState<Map<string, ArmorKitPiece>>(
    new Map(),
  );

  /** Called by TextureGeneratorTab when user clicks "Add to Kit" */
  const handleAddToKit = useCallback(
    (shell: ShellMesh, texturedGlbUrl: string) => {
      const key = `${shell.slotName}_${shell.bulkClass}`;
      setArmorKit((prev) => {
        const next = new Map(prev);
        next.set(key, { shell, texturedUrl: texturedGlbUrl });
        return next;
      });
      setActiveTab("preview");
    },
    [],
  );

  const kitCount = armorKit.size;

  return (
    <div className="flex flex-col h-[calc(100vh-44px)]">
      {/* Tab bar */}
      <div className="flex items-center gap-1 px-3 py-1.5 bg-bg-secondary border-b border-border-primary">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
                isActive
                  ? "bg-primary/15 text-primary border border-primary/25"
                  : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary border border-transparent"
              }`}
              title={tab.description}
            >
              <Icon size={16} />
              {tab.label}
              {tab.id === "preview" && kitCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-[10px] rounded-full bg-primary/20 text-primary">
                  {kitCount}
                </span>
              )}
            </button>
          );
        })}

        <div className="ml-auto text-xs text-text-tertiary px-3">
          Armor Pipeline v2 — Isolated from existing code
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === "shells" && <ShellGeneratorTab />}
        {activeTab === "textures" && (
          <TextureGeneratorTab onAddToKit={handleAddToKit} />
        )}
        {activeTab === "tripo" && (
          <div className="flex items-center justify-center h-full text-text-tertiary">
            <div className="text-center space-y-2">
              <Wand2 size={48} className="mx-auto opacity-30" />
              <p className="text-sm">Tripo Pipeline — Coming in Phase 4</p>
              <p className="text-xs opacity-60">
                Requires TRIPO_API_KEY in .env
              </p>
            </div>
          </div>
        )}
        {activeTab === "preview" && <ArmorPreviewTab armorKit={armorKit} />}
      </div>
    </div>
  );
};
