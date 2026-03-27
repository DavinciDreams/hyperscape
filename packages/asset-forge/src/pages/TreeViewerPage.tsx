import { TreePine, Eye, ChevronRight, Info } from "lucide-react";
import React, { useState, useRef, useCallback, useMemo } from "react";

import { API_BASE_URL } from "../constants/api";

import ThreeViewer, { ThreeViewerRef } from "@/components/shared/ThreeViewer";

/** Minimal tree data extracted from the woodcutting manifest. */
interface TreeEntry {
  id: string;
  name: string;
  levelRequired: number;
  examine: string;
  scale: number;
  respawnTicks: number;
  modelPath: string | null;
  modelVariants: string[] | undefined;
  harvestYield: { itemId: string; itemName: string; xpAmount: number }[];
}

/** Hardcoded manifest data — avoids a fetch to the game server. */
const TREES: TreeEntry[] = [
  {
    id: "tree_fir",
    name: "Fir Tree",
    levelRequired: 1,
    examine: "A tall fir tree with strong, durable wood.",
    scale: 0.01,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: ["fir_01.glb", "fir_02.glb", "fir_03.glb", "fir_04.glb"],
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 25 }],
  },
  {
    id: "tree_dead",
    name: "Dead Tree",
    levelRequired: 1,
    examine: "A withered, lifeless tree.",
    scale: 0.015,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: [
      "dead_01.glb",
      "dead_02.glb",
      "dead_03.glb",
      "dead_04.glb",
      "dead_05.glb",
    ],
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 25 }],
  },
  {
    id: "tree_cactus",
    name: "Cactus",
    levelRequired: 1,
    examine: "A prickly desert cactus.",
    scale: 0.008,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: [
      "cactus01.glb",
      "cactus02.glb",
      "cactus03.glb",
      "cactus04.glb",
      "cactus05.glb",
      "cactus06.glb",
      "cactus07.glb",
      "cactus08.glb",
    ],
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 25 }],
  },
  {
    id: "tree_birch",
    name: "Birch Tree",
    levelRequired: 5,
    examine: "A slender birch tree with distinctive white bark.",
    scale: 0.008,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: [
      "birch_01.glb",
      "birch_02.glb",
      "birch_03.glb",
      "birch_04.glb",
      "birch_05.glb",
    ],
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 30 }],
  },
  {
    id: "tree_coconut",
    name: "Coconut Palm",
    levelRequired: 8,
    examine: "A tall coconut palm swaying gently.",
    scale: 0.015,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: [
      "coconut_01.glb",
      "coconut_02.glb",
      "coconut_03.glb",
      "coconut_04.glb",
      "coconut_05.glb",
    ],
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 32.5 }],
  },
  {
    id: "tree_palm",
    name: "Desert Palm",
    levelRequired: 8,
    examine: "A hardy desert palm with fan-shaped leaves.",
    scale: 0.012,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: [
      "palm_01.glb",
      "palm_02.glb",
      "palm_03.glb",
      "palm_04.glb",
      "palm_05.glb",
    ],
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 32.5 }],
  },
  {
    id: "tree_chinaPine",
    name: "China Pine",
    levelRequired: 10,
    examine: "An elegant china pine with spreading branches.",
    scale: 0.015,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: [
      "chinaPine_01.glb",
      "chinaPine_02.glb",
      "chinaPine_03.glb",
      "chinaPine_04.glb",
    ],
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 35 }],
  },
  {
    id: "tree_windPine",
    name: "Wind Pine",
    levelRequired: 12,
    examine: "A wind-battered pine, bent and stripped by harsh tundra gales.",
    scale: 0.015,
    respawnTicks: 80,
    modelPath: "dead_06.glb",
    modelVariants: undefined,
    harvestYield: [{ itemId: "logs", itemName: "Logs", xpAmount: 37.5 }],
  },
  {
    id: "tree_oak",
    name: "Oak Tree",
    levelRequired: 15,
    examine: "A large oak tree with thick, strong wood.",
    scale: 0.008,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: ["oak_01.glb", "oak_02.glb", "oak_03.glb", "oak_04.glb"],
    harvestYield: [
      { itemId: "oak_logs", itemName: "Oak Logs", xpAmount: 37.5 },
    ],
  },
  {
    id: "tree_willow",
    name: "Willow Tree",
    levelRequired: 30,
    examine: "A large willow tree with long, drooping branches.",
    scale: 0.01,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: undefined,
    harvestYield: [
      { itemId: "willow_logs", itemName: "Willow Logs", xpAmount: 67.5 },
    ],
  },
  {
    id: "tree_teak",
    name: "Teak Tree",
    levelRequired: 35,
    examine: "A tall teak tree with dark, valuable hardwood.",
    scale: 0.01,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: undefined,
    harvestYield: [
      { itemId: "teak_logs", itemName: "Teak Logs", xpAmount: 85 },
    ],
  },
  {
    id: "tree_maple",
    name: "Maple Tree",
    levelRequired: 45,
    examine: "A beautiful maple tree with vibrant red leaves.",
    scale: 0.008,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: ["maple_01.glb", "maple_02.glb", "maple_03.glb"],
    harvestYield: [
      { itemId: "maple_logs", itemName: "Maple Logs", xpAmount: 100 },
    ],
  },
  {
    id: "tree_mahogany",
    name: "Mahogany Tree",
    levelRequired: 50,
    examine: "A grand mahogany tree with rich, reddish-brown wood.",
    scale: 0.01,
    respawnTicks: 100,
    modelPath: null,
    modelVariants: undefined,
    harvestYield: [
      { itemId: "mahogany_logs", itemName: "Mahogany Logs", xpAmount: 125 },
    ],
  },
  {
    id: "tree_pine",
    name: "Pine Tree",
    levelRequired: 54,
    examine: "A sturdy pine tree with fragrant wood.",
    scale: 0.015,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: ["pine_01.glb", "pine_02.glb", "pine_03.glb"],
    harvestYield: [
      { itemId: "pine_logs", itemName: "Pine Logs", xpAmount: 140 },
    ],
  },
  {
    id: "tree_yew",
    name: "Yew Tree",
    levelRequired: 60,
    examine: "An ancient yew tree with dense, flexible wood prized by archers.",
    scale: 0.008,
    respawnTicks: 160,
    modelPath: null,
    modelVariants: [
      "knotwood_01.glb",
      "knotwood_02.glb",
      "knotwood_03.glb",
      "knotwood_04.glb",
    ],
    harvestYield: [{ itemId: "yew_logs", itemName: "Yew Logs", xpAmount: 175 }],
  },
  {
    id: "tree_magic",
    name: "Magic Tree",
    levelRequired: 75,
    examine: "A mysterious tree pulsing with magical energy.",
    scale: 0.01,
    respawnTicks: 200,
    modelPath: null,
    modelVariants: undefined,
    harvestYield: [
      { itemId: "magic_logs", itemName: "Magic Logs", xpAmount: 250 },
    ],
  },
  {
    id: "tree_bamboo",
    name: "Bamboo Tree",
    levelRequired: 90,
    examine: "A tall bamboo stalk swaying in the breeze.",
    scale: 0.8,
    respawnTicks: 80,
    modelPath: null,
    modelVariants: [
      "bamboo_01.glb",
      "bamboo_02.glb",
      "bamboo_03.glb",
      "bamboo_04.glb",
    ],
    harvestYield: [{ itemId: "bamboo", itemName: "Bamboo", xpAmount: 325 }],
  },
];

/** Build a full model URL from a filename. */
function modelUrl(filename: string): string {
  return `${API_BASE_URL}/game-models/trees/${filename}`;
}

/** Get all loadable variant filenames for a tree. */
function getVariants(tree: TreeEntry): string[] {
  if (tree.modelVariants && tree.modelVariants.length > 0) {
    return tree.modelVariants;
  }
  if (tree.modelPath) {
    return [tree.modelPath];
  }
  return [];
}

export const TreeViewerPage: React.FC = () => {
  const [selectedTreeId, setSelectedTreeId] = useState<string>(TREES[0].id);
  const [selectedVariantIdx, setSelectedVariantIdx] = useState(0);
  const [showGroundPlane, setShowGroundPlane] = useState(true);
  const [modelInfo, setModelInfo] = useState<{
    vertices: number;
    faces: number;
    materials: number;
  } | null>(null);
  const viewerRef = useRef<ThreeViewerRef>(null);

  const selectedTree = useMemo(
    () => TREES.find((t) => t.id === selectedTreeId) ?? TREES[0],
    [selectedTreeId],
  );

  const variants = useMemo(() => getVariants(selectedTree), [selectedTree]);
  const hasModel = variants.length > 0;

  const currentModelUrl = useMemo(() => {
    if (!hasModel) return undefined;
    const idx = Math.min(selectedVariantIdx, variants.length - 1);
    return modelUrl(variants[idx]);
  }, [hasModel, variants, selectedVariantIdx]);

  const handleSelectTree = useCallback((id: string) => {
    setSelectedTreeId(id);
    setSelectedVariantIdx(0);
    setModelInfo(null);
  }, []);

  const handleModelLoad = useCallback(
    (info: {
      vertices: number;
      faces: number;
      materials: number;
      fileSize?: number;
    }) => {
      setModelInfo(info);
    },
    [],
  );

  return (
    <div className="page-container-no-padding flex-col">
      <div className="flex-1 flex gap-4 p-4 overflow-hidden min-h-0">
        {/* Sidebar — tree list */}
        <div className="flex flex-col gap-3 w-72 min-w-[18rem] animate-slide-in-left">
          <div className="card p-3">
            <div className="flex items-center gap-2 mb-3">
              <TreePine size={18} className="text-primary" />
              <h2 className="text-sm font-semibold text-text-primary">
                Trees ({TREES.length})
              </h2>
            </div>

            <div className="flex flex-col gap-1 max-h-[calc(100vh-220px)] overflow-y-auto pr-1">
              {TREES.map((tree) => {
                const treeVariants = getVariants(tree);
                const noModel = treeVariants.length === 0;
                return (
                  <button
                    key={tree.id}
                    className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all duration-base text-left ${
                      selectedTreeId === tree.id
                        ? "bg-primary bg-opacity-10 text-primary"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                    } ${noModel ? "opacity-50" : ""}`}
                    onClick={() => handleSelectTree(tree.id)}
                  >
                    <ChevronRight
                      size={14}
                      className={`transition-transform flex-shrink-0 ${selectedTreeId === tree.id ? "rotate-90" : ""}`}
                    />
                    <span className="flex-1 truncate">{tree.name}</span>
                    <span className="text-xs text-text-tertiary flex-shrink-0">
                      Lv{tree.levelRequired}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Main viewer area */}
        <div className="flex-1 flex flex-col gap-4 min-w-0 animate-fade-in">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h1 className="text-lg font-semibold text-text-primary">
                {selectedTree.name}
              </h1>
              <span className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary">
                Level {selectedTree.levelRequired}
              </span>
              {selectedTree.harvestYield[0] && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-bg-tertiary text-text-secondary">
                  {selectedTree.harvestYield[0].xpAmount} XP &middot;{" "}
                  {selectedTree.harvestYield[0].itemName}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
                  showGroundPlane
                    ? "bg-primary bg-opacity-10 text-primary"
                    : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                }`}
                onClick={() => setShowGroundPlane(!showGroundPlane)}
              >
                <Eye size={14} />
                Ground
              </button>
              <button
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium text-text-secondary hover:text-text-primary hover:bg-bg-tertiary transition-all"
                onClick={() => viewerRef.current?.resetCamera()}
              >
                Reset
              </button>
            </div>
          </div>

          {/* Viewer */}
          <div className="flex-1 relative rounded-xl border border-border-primary shadow-2xl overflow-hidden">
            {hasModel ? (
              <div className="absolute inset-0">
                <ThreeViewer
                  ref={viewerRef}
                  modelUrl={currentModelUrl}
                  showGroundPlane={showGroundPlane}
                  lightMode
                  onModelLoad={handleModelLoad}
                />
              </div>
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="text-center text-text-tertiary">
                  <TreePine size={48} className="mx-auto mb-3 opacity-30" />
                  <p className="text-sm font-medium">No model available</p>
                  <p className="text-xs mt-1">
                    This tree needs a 3D model assigned
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Bottom bar — variant selector + model info */}
          <div className="flex items-center justify-between">
            {/* Variant selector */}
            {variants.length > 1 && (
              <div className="flex items-center gap-1">
                <span className="text-xs text-text-tertiary mr-2">
                  Variants:
                </span>
                {variants.map((v, i) => (
                  <button
                    key={v}
                    className={`px-2.5 py-1 rounded text-xs font-medium transition-all ${
                      selectedVariantIdx === i
                        ? "bg-primary bg-opacity-10 text-primary"
                        : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
                    }`}
                    onClick={() => {
                      setSelectedVariantIdx(i);
                      setModelInfo(null);
                    }}
                  >
                    {i + 1}
                  </button>
                ))}
              </div>
            )}
            {variants.length <= 1 && <div />}

            {/* Model info + tree details */}
            <div className="flex items-center gap-4 text-xs text-text-tertiary">
              {modelInfo && (
                <>
                  <span>{modelInfo.vertices.toLocaleString()} verts</span>
                  <span>{modelInfo.faces.toLocaleString()} faces</span>
                  <span>{modelInfo.materials} materials</span>
                </>
              )}
              <span title={selectedTree.examine}>
                <Info size={14} className="inline -mt-0.5" />{" "}
                {selectedTree.examine}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
