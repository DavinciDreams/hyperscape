/**
 * Landing page — shown when the user is not authenticated.
 *
 * Gates the entire Asset Forge app behind Privy sign-in.
 * Clicking "Sign In" opens the Privy modal (email, Google, or wallet).
 */

import {
  Hammer,
  Mountain,
  TreePine,
  Building2,
  Wand2,
  Layers,
  Sparkles,
  LogIn,
  Loader2,
} from "lucide-react";
import React from "react";

import { useForgeAuth } from "../../auth/ForgeAuthProvider";

const FEATURES = [
  {
    icon: Wand2,
    title: "AI Generation",
    desc: "Create 3D models, textures, and sprites with AI",
  },
  {
    icon: Mountain,
    title: "Procedural Worlds",
    desc: "Terrain, biomes, erosion, and heightmaps",
  },
  {
    icon: Building2,
    title: "World Building",
    desc: "Towns, buildings, NPCs, quests, and roads",
  },
  {
    icon: TreePine,
    title: "Vegetation",
    desc: "Trees, grass, flowers, and foliage scattering",
  },
  {
    icon: Layers,
    title: "Equipment Pipeline",
    desc: "Armor fitting, hand rigging, and retargeting",
  },
  {
    icon: Sparkles,
    title: "Batch Processing",
    desc: "Sprites, LODs, VATs, and manifest management",
  },
];

export function WorldStudioLanding() {
  const auth = useForgeAuth();

  if (!auth.ready) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-bg-primary">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-bg-primary via-bg-secondary to-bg-primary relative overflow-hidden">
      {/* Background grid */}
      <div className="absolute inset-0 pointer-events-none opacity-[0.03]">
        <div
          className="h-full w-full"
          style={{
            backgroundImage:
              "linear-gradient(rgba(99,102,241,0.3) 1px, transparent 1px), linear-gradient(90deg, rgba(99,102,241,0.3) 1px, transparent 1px)",
            backgroundSize: "64px 64px",
          }}
        />
      </div>

      {/* Glow orb */}
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-primary/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Content */}
      <div className="relative z-10 flex flex-col items-center px-6 max-w-3xl text-center">
        {/* Icon */}
        <div className="relative mb-6">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary/20 to-secondary/20 border border-primary/20 flex items-center justify-center">
            <Hammer size={36} className="text-primary" />
          </div>
          <div className="absolute -inset-1 rounded-2xl bg-primary/10 blur-xl -z-10" />
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-text-primary mb-2 tracking-tight">
          Asset Forge
        </h1>
        <p className="text-base text-text-tertiary mb-8 max-w-md leading-relaxed">
          AI-powered 3D asset creation, procedural world building, and game
          content pipeline.
        </p>

        {/* Sign In */}
        <button
          className="group relative inline-flex items-center gap-2.5 px-8 py-3 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary-dark transition-all duration-200 shadow-lg shadow-primary/25 hover:shadow-xl hover:shadow-primary/30 hover:-translate-y-0.5"
          onClick={auth.login}
        >
          <LogIn size={16} />
          Sign In
          <div className="absolute inset-0 rounded-xl bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover:opacity-100 transition-opacity" />
        </button>

        <p className="text-xs text-text-tertiary mt-3">
          Email, Google, or wallet
        </p>

        {/* Features grid */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-14 w-full max-w-xl">
          {FEATURES.map((f) => (
            <div
              key={f.title}
              className="flex flex-col items-center gap-2 p-4 rounded-lg bg-bg-secondary/50 border border-border-primary/50"
            >
              <f.icon size={18} className="text-primary/70" />
              <span className="text-xs font-medium text-text-secondary">
                {f.title}
              </span>
              <span className="text-[10px] text-text-tertiary leading-tight">
                {f.desc}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
