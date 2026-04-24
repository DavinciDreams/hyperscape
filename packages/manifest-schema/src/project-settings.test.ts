/**
 * Faithfulness + defensiveness tests for `ProjectSettingsManifestSchema`.
 */

import { describe, expect, it } from "vitest";

import {
  ProjectSettingsManifestSchema,
  type ProjectSettingsManifest,
} from "./project-settings.js";

const reference: ProjectSettingsManifest = {
  projectName: "Hyperscape",
  gameModeId: "hyperscape",
  plugins: [
    { id: "com.hyperforge.core", version: "^0.1.0", enabled: true },
    { id: "com.hyperforge.combat", version: "1.0.0", enabled: true },
  ],
  renderProfile: {
    preset: "high",
    targetFps: 120,
    resolutionScale: 1.25,
    antialiasing: "taa",
  },
  defaultInputScheme: "keyboard-mouse",
  defaultLocale: "en-US",
  worldSeed: "hyperia-alpha-42",
  pieFlags: { skipIntro: true, autoLogin: false },
};

describe("ProjectSettingsManifestSchema", () => {
  it("parses the reference manifest cleanly", () => {
    const result = ProjectSettingsManifestSchema.safeParse(reference);
    if (!result.success) {
      throw new Error(
        `Reference manifest failed validation:\n${JSON.stringify(result.error.format(), null, 2)}`,
      );
    }
    expect(result.success).toBe(true);
  });

  it("applies defaults on a minimal manifest", () => {
    const parsed = ProjectSettingsManifestSchema.parse({
      projectName: "Project",
      gameModeId: "hyperscape",
    });
    expect(parsed.plugins).toEqual([]);
    expect(parsed.renderProfile.preset).toBe("medium");
    expect(parsed.renderProfile.targetFps).toBe(60);
    expect(parsed.renderProfile.resolutionScale).toBe(1.0);
    expect(parsed.renderProfile.antialiasing).toBe("taa");
    expect(parsed.defaultInputScheme).toBe("auto");
    expect(parsed.defaultLocale).toBe("en");
    expect(parsed.worldSeed).toBe("");
    expect(parsed.pieFlags).toEqual({});
  });

  it("rejects missing gameModeId", () => {
    const bad = { projectName: "P" };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects empty projectName", () => {
    const bad = { ...reference, projectName: "" };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown render preset", () => {
    const bad = {
      ...reference,
      renderProfile: { ...reference.renderProfile, preset: "overkill" },
    };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects negative targetFps", () => {
    const bad = {
      ...reference,
      renderProfile: { ...reference.renderProfile, targetFps: -1 },
    };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects resolutionScale above 2.0", () => {
    const bad = {
      ...reference,
      renderProfile: { ...reference.renderProfile, resolutionScale: 3 },
    };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown antialiasing mode", () => {
    const bad = {
      ...reference,
      renderProfile: { ...reference.renderProfile, antialiasing: "smaa" },
    };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects unknown input scheme", () => {
    const bad = { ...reference, defaultInputScheme: "vr" };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects malformed default locale", () => {
    const bad = { ...reference, defaultLocale: "english" };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects plugin id that isn't reverse-domain", () => {
    const bad = {
      ...reference,
      plugins: [{ id: "combat", version: "1.0.0" }],
    };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });

  it("rejects duplicate plugin ids", () => {
    const bad = {
      ...reference,
      plugins: [
        { id: "com.hyperforge.core", version: "0.1.0" },
        { id: "com.hyperforge.core", version: "0.2.0" },
      ],
    };
    expect(ProjectSettingsManifestSchema.safeParse(bad).success).toBe(false);
  });
});
