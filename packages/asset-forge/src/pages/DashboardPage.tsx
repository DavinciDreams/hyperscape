import {
  Wand2,
  Database,
  Map,
  Globe,
  Gamepad2,
  FileJson,
  Wrench,
  Shield,
  Hand,
  Shuffle,
  Image,
  Sparkles,
  Building2,
  Mountain,
  TreePine,
  Flower2,
  Route,
  Sprout,
  Anchor,
  BrickWall,
  Landmark,
  ArrowRight,
} from "lucide-react";
import React from "react";
import { Link } from "react-router-dom";

import { useForgeAuth } from "../auth/ForgeAuthProvider";
import { ROUTES } from "../constants";

interface ToolCard {
  route: string;
  label: string;
  desc: string;
  icon: React.ElementType;
  accent?: string;
}

const QUICK_ACTIONS: ToolCard[] = [
  {
    route: ROUTES.GENERATION,
    label: "Generate",
    desc: "Create 3D models with AI",
    icon: Wand2,
    accent: "from-violet-500/20 to-purple-500/20 border-violet-500/20",
  },
  {
    route: ROUTES.WORLD_STUDIO,
    label: "World Studio",
    desc: "Build and edit game worlds",
    icon: Map,
    accent: "from-emerald-500/20 to-teal-500/20 border-emerald-500/20",
  },
  {
    route: ROUTES.ASSETS,
    label: "Assets",
    desc: "Browse and manage all assets",
    icon: Database,
    accent: "from-blue-500/20 to-cyan-500/20 border-blue-500/20",
  },
  {
    route: ROUTES.MANIFESTS,
    label: "Manifests",
    desc: "Game data and configurations",
    icon: FileJson,
    accent: "from-amber-500/20 to-orange-500/20 border-amber-500/20",
  },
];

const WORLD_TOOLS: ToolCard[] = [
  {
    route: ROUTES.WORLD_BUILDER,
    label: "World Builder",
    desc: "Legacy world builder",
    icon: Globe,
  },
  {
    route: ROUTES.WORLD_EDITOR,
    label: "World Editor",
    desc: "Game systems editor",
    icon: Gamepad2,
  },
  {
    route: ROUTES.TERRAIN_GEN,
    label: "Terrain",
    desc: "Heightmaps & erosion",
    icon: Mountain,
  },
  {
    route: ROUTES.BUILDING_GEN,
    label: "Buildings",
    desc: "Towns & structures",
    icon: Building2,
  },
  {
    route: ROUTES.ROADS_GEN,
    label: "Roads",
    desc: "Path networks",
    icon: Route,
  },
  {
    route: ROUTES.LANDMARK_GEN,
    label: "Landmarks",
    desc: "Points of interest",
    icon: Landmark,
  },
  {
    route: ROUTES.DOCK_GEN,
    label: "Docks",
    desc: "Harbor structures",
    icon: Anchor,
  },
  {
    route: ROUTES.BRIDGE_GEN,
    label: "Bridges",
    desc: "River crossings",
    icon: BrickWall,
  },
];

const NATURE_TOOLS: ToolCard[] = [
  {
    route: ROUTES.TREE_GEN,
    label: "Trees",
    desc: "Procedural trees",
    icon: TreePine,
  },
  {
    route: ROUTES.PLANT_GEN,
    label: "Plants",
    desc: "Foliage & bushes",
    icon: Flower2,
  },
  {
    route: ROUTES.VEGETATION_GEN,
    label: "Vegetation",
    desc: "Grass & flowers",
    icon: Sprout,
  },
];

const PIPELINE_TOOLS: ToolCard[] = [
  {
    route: ROUTES.EQUIPMENT,
    label: "Equipment",
    desc: "Manage gear",
    icon: Wrench,
  },
  {
    route: ROUTES.ARMOR_FITTING,
    label: "Armor Fitting",
    desc: "Fit to avatar",
    icon: Shield,
  },
  {
    route: ROUTES.HAND_RIGGING,
    label: "Hand Rigging",
    desc: "Weapon grips",
    icon: Hand,
  },
  {
    route: ROUTES.RETARGET_ANIMATE,
    label: "Retarget",
    desc: "Animation retarget",
    icon: Shuffle,
  },
  {
    route: ROUTES.BATCH_SPRITES,
    label: "Batch Sprites",
    desc: "Sprite sheets",
    icon: Image,
  },
  { route: ROUTES.VFX, label: "VFX", desc: "Visual effects", icon: Sparkles },
];

function QuickActionCard({ card }: { card: ToolCard }) {
  return (
    <Link
      to={card.route}
      className={`group relative flex flex-col gap-3 p-5 rounded-xl bg-gradient-to-br ${card.accent} border backdrop-blur-sm hover:scale-[1.02] hover:shadow-lg transition-all duration-200`}
    >
      <div className="flex items-center justify-between">
        <card.icon size={22} className="text-text-primary" />
        <ArrowRight
          size={14}
          className="text-text-tertiary opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all duration-200"
        />
      </div>
      <div>
        <h3 className="text-sm font-semibold text-text-primary">
          {card.label}
        </h3>
        <p className="text-xs text-text-tertiary mt-0.5">{card.desc}</p>
      </div>
    </Link>
  );
}

function ToolGrid({ title, tools }: { title: string; tools: ToolCard[] }) {
  return (
    <div>
      <h2 className="text-xs font-semibold text-text-tertiary uppercase tracking-wider mb-3">
        {title}
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
        {tools.map((tool) => (
          <Link
            key={tool.route}
            to={tool.route}
            className="group flex items-center gap-3 px-3.5 py-2.5 rounded-lg bg-bg-secondary/60 border border-border-primary/50 hover:border-primary/30 hover:bg-bg-secondary transition-all duration-150"
          >
            <tool.icon
              size={16}
              className="text-text-tertiary group-hover:text-primary transition-colors flex-shrink-0"
            />
            <div className="min-w-0">
              <p className="text-sm font-medium text-text-primary truncate">
                {tool.label}
              </p>
              <p className="text-[10px] text-text-tertiary truncate">
                {tool.desc}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function DashboardPage() {
  const auth = useForgeAuth();

  const displayName =
    auth.user?.email?.address?.split("@")[0] ||
    auth.user?.wallet?.address?.slice(0, 8) ||
    "there";

  return (
    <div className="max-w-5xl mx-auto px-6 py-8">
      {/* Welcome */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text-primary">
          Welcome back, {displayName}
        </h1>
        <p className="text-sm text-text-tertiary mt-1">
          What would you like to work on?
        </p>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-10">
        {QUICK_ACTIONS.map((card) => (
          <QuickActionCard key={card.route} card={card} />
        ))}
      </div>

      {/* Tool sections */}
      <div className="space-y-8">
        <ToolGrid title="World & Environment" tools={WORLD_TOOLS} />
        <ToolGrid title="Nature & Vegetation" tools={NATURE_TOOLS} />
        <ToolGrid title="Asset Pipeline" tools={PIPELINE_TOOLS} />
      </div>
    </div>
  );
}
