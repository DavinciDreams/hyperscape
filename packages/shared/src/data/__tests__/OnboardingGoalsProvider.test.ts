/**
 * Tests for the OnboardingGoalsProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { onboardingGoalsProvider } from "../OnboardingGoalsProvider";

beforeEach(() => {
  onboardingGoalsProvider.unload();
});
afterEach(() => {
  onboardingGoalsProvider.unload();
});

// Baseline: disabled manifest — refinement requires ≥1 goal when enabled.
const baseline = { enabled: false };

describe("OnboardingGoalsProvider", () => {
  it("starts unloaded", () => {
    expect(onboardingGoalsProvider.isLoaded()).toBe(false);
    expect(onboardingGoalsProvider.getManifest()).toBeNull();
  });

  it("loadRaw() rejects {} — enabled defaults to true, requires ≥1 goal", () => {
    expect(() => onboardingGoalsProvider.loadRaw({})).toThrow();
  });

  it("loadRaw() accepts {enabled:false} baseline", () => {
    const parsed = onboardingGoalsProvider.loadRaw(baseline);
    expect(parsed.enabled).toBe(false);
    expect(parsed.goals).toEqual([]);
    expect(parsed.showTracker).toBe(true);
  });

  it("loadRaw() rejects unknown top-level keys (.strict())", () => {
    expect(() => onboardingGoalsProvider.loadRaw({ bogusField: 1 })).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = onboardingGoalsProvider.loadRaw(baseline);
    onboardingGoalsProvider.unload();
    onboardingGoalsProvider.load(parsed);
    expect(onboardingGoalsProvider.isLoaded()).toBe(true);
  });

  it("hotReload(null) clears the manifest", () => {
    onboardingGoalsProvider.loadRaw(baseline);
    onboardingGoalsProvider.hotReload(null);
    expect(onboardingGoalsProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    onboardingGoalsProvider.loadRaw(baseline);
    onboardingGoalsProvider.unload();
    expect(onboardingGoalsProvider.isLoaded()).toBe(false);
  });

  it("singleton returns the same instance", () => {
    expect(onboardingGoalsProvider).toBe(onboardingGoalsProvider);
  });
});
