import { create } from "zustand";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MusicZone {
  id: string;
  name: string;
  trackId: string;
  volume: number;
  polygon: Array<{ x: number; z: number }>;
  fadeDistance: number;
  priority: number;
}

interface AmbientZone {
  id: string;
  name: string;
  ambientType: string;
  sounds: Array<{ path: string; weight: number }>;
  volume: number;
  polygon: Array<{ x: number; z: number }>;
  fadeDistance: number;
}

interface SFXTrigger {
  id: string;
  name: string;
  soundPath: string;
  position: { x: number; y: number; z: number };
  radius: number;
  volume: number;
  looping: boolean;
  cooldown: number;
}

// ---------------------------------------------------------------------------
// Store interface
// ---------------------------------------------------------------------------

interface AudioStore {
  /** Music zones with track assignments and polygonal boundaries */
  musicZones: MusicZone[];
  /** Ambient sound zones with weighted sound lists */
  ambientZones: AmbientZone[];
  /** Point-based SFX triggers with spatial radius */
  sfxTriggers: SFXTrigger[];

  // Music zone actions
  addMusicZone: (zone: MusicZone) => void;
  updateMusicZone: (id: string, updates: Partial<MusicZone>) => void;
  removeMusicZone: (id: string) => void;

  // Ambient zone actions
  addAmbientZone: (zone: AmbientZone) => void;
  updateAmbientZone: (id: string, updates: Partial<AmbientZone>) => void;
  removeAmbientZone: (id: string) => void;

  // SFX trigger actions
  addSFXTrigger: (trigger: SFXTrigger) => void;
  updateSFXTrigger: (id: string, updates: Partial<SFXTrigger>) => void;
  removeSFXTrigger: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Store
// ---------------------------------------------------------------------------

export const useAudioStore = create<AudioStore>()((set) => ({
  musicZones: [],
  ambientZones: [],
  sfxTriggers: [],

  // Music zones
  addMusicZone: (zone) =>
    set((state) => ({ musicZones: [...state.musicZones, zone] })),

  updateMusicZone: (id, updates) =>
    set((state) => ({
      musicZones: state.musicZones.map((z) =>
        z.id === id ? { ...z, ...updates } : z,
      ),
    })),

  removeMusicZone: (id) =>
    set((state) => ({
      musicZones: state.musicZones.filter((z) => z.id !== id),
    })),

  // Ambient zones
  addAmbientZone: (zone) =>
    set((state) => ({ ambientZones: [...state.ambientZones, zone] })),

  updateAmbientZone: (id, updates) =>
    set((state) => ({
      ambientZones: state.ambientZones.map((z) =>
        z.id === id ? { ...z, ...updates } : z,
      ),
    })),

  removeAmbientZone: (id) =>
    set((state) => ({
      ambientZones: state.ambientZones.filter((z) => z.id !== id),
    })),

  // SFX triggers
  addSFXTrigger: (trigger) =>
    set((state) => ({ sfxTriggers: [...state.sfxTriggers, trigger] })),

  updateSFXTrigger: (id, updates) =>
    set((state) => ({
      sfxTriggers: state.sfxTriggers.map((t) =>
        t.id === id ? { ...t, ...updates } : t,
      ),
    })),

  removeSFXTrigger: (id) =>
    set((state) => ({
      sfxTriggers: state.sfxTriggers.filter((t) => t.id !== id),
    })),
}));
