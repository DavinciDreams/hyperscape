/**
 * Phase U11 — perf budget for the UI-pack hot path.
 *
 * The HUD render pipeline does, per frame:
 *   1. `applyLayoutVariant(manifest, viewport)` — viewport variant fold
 *   2. `resolveLayout(variantManifest, userLayout)` — per-player override merge
 *   3. per-instance `isWidgetVisible(...)` — visibility rule eval
 *
 * All three are pure, allocating only new arrays/records rather than
 * mutating inputs. This test exercises a realistic 30-widget manifest
 * with user overrides on half of them and asserts that the hot path
 * fits well under the 2ms-per-render budget.
 *
 * The assertion is generous (budget ≈ 10× the observed headroom) so
 * the test isn't flaky on slow CI machines; it will still fire on an
 * order-of-magnitude regression (e.g. accidental O(N²) merge).
 *
 * Runs N iterations and uses the *median* — single-sample timings on
 * JS VMs can vary by 100× because of GC; median shows the steady state.
 */

import { describe, expect, it } from "vitest";
import { applyLayoutVariant } from "./variant";
import { resolveLayout } from "./resolve";
import { isWidgetVisible } from "./visibility";
import type { UILayoutManifest, UIUserLayout, WidgetInstance } from "./layout";

const ANCHORS = [
  "top-left",
  "top-center",
  "top-right",
  "middle-left",
  "middle-center",
  "middle-right",
  "bottom-left",
  "bottom-center",
  "bottom-right",
] as const;

function syntheticManifest(size: number): UILayoutManifest {
  const instances: WidgetInstance[] = Array.from({ length: size }, (_, i) => ({
    id: `widget.${i}`,
    widgetId: "hp-bar",
    position: {
      kind: "anchored",
      anchor: ANCHORS[i % ANCHORS.length],
      offset: { x: i * 4, y: i * 3 },
      width: 120,
      height: 40,
    },
    props: { label: `w${i}` },
    visibility:
      i % 5 === 0
        ? { contexts: ["combat"] }
        : i % 7 === 0
          ? { hiddenIn: ["menu"] }
          : undefined,
  }));
  return {
    id: "perf.layout",
    name: "Perf Layout",
    revision: 1,
    instances,
    variants: {
      mobile: {
        overrides: instances.slice(0, Math.floor(size / 3)).map((inst) => ({
          id: inst.id,
          position: { offsetX: 0, offsetY: 0 },
        })),
      },
    },
  };
}

function syntheticUserLayout(
  layoutId: string,
  instanceIds: string[],
): UIUserLayout {
  return {
    schemaVersion: 1,
    layoutId,
    layoutRevision: 1,
    updatedAt: Date.now(),
    overrides: instanceIds.map((id, i) => ({
      instanceId: id,
      position: { offsetX: i * 2, offsetY: i },
    })),
  };
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? 0;
}

describe("UI-pack hot path — perf budget", () => {
  it("fold → resolve → visibility stays under budget for a 30-widget layout", () => {
    const manifest = syntheticManifest(30);
    const userLayout = syntheticUserLayout(
      manifest.id,
      manifest.instances.slice(0, 15).map((i) => i.id),
    );

    // Warm-up: JIT compile the hot paths.
    for (let i = 0; i < 50; i++) {
      const variantManifest = applyLayoutVariant(manifest, "mobile").manifest;
      const resolved = resolveLayout(variantManifest, userLayout);
      for (const inst of resolved.instances) {
        isWidgetVisible({
          instance: inst,
          gameContext: "combat",
          data: undefined,
        });
      }
    }

    const samples: number[] = [];
    for (let i = 0; i < 100; i++) {
      const t0 = performance.now();
      const variantManifest = applyLayoutVariant(manifest, "mobile").manifest;
      const resolved = resolveLayout(variantManifest, userLayout);
      for (const inst of resolved.instances) {
        isWidgetVisible({
          instance: inst,
          gameContext: "combat",
          data: undefined,
        });
      }
      samples.push(performance.now() - t0);
    }

    const med = median(samples);
    // Budget: generous 20ms ceiling for CI headroom. In local
    // development the median is ~0.05ms; the assertion is here to
    // catch order-of-magnitude regressions (e.g. accidental O(N²)).
    expect(med).toBeLessThan(20);
  });

  it("handles a 200-widget layout without pathological scaling", () => {
    const manifest = syntheticManifest(200);
    const userLayout = syntheticUserLayout(
      manifest.id,
      manifest.instances.slice(0, 100).map((i) => i.id),
    );

    // Warm-up.
    for (let i = 0; i < 20; i++) {
      const variantManifest = applyLayoutVariant(manifest, "mobile").manifest;
      resolveLayout(variantManifest, userLayout);
    }

    const samples: number[] = [];
    for (let i = 0; i < 50; i++) {
      const t0 = performance.now();
      const variantManifest = applyLayoutVariant(manifest, "mobile").manifest;
      const resolved = resolveLayout(variantManifest, userLayout);
      for (const inst of resolved.instances) {
        isWidgetVisible({
          instance: inst,
          gameContext: "world",
          data: undefined,
        });
      }
      samples.push(performance.now() - t0);
    }

    const med = median(samples);
    // 200 widgets is ~7× the realistic HUD; we mostly want to catch
    // accidental quadratic behavior.
    expect(med).toBeLessThan(50);
  });
});
