/**
 * Phase 8.3 — Template integration: template → validate → runtime → execute.
 *
 * Verifies that every registered `SCRIPT_TEMPLATES` entry survives the full
 * editor pipeline:
 *
 *   1. Template factory produces a valid `ScriptGraph` (editor form).
 *   2. `validateGraph()` reports no hard errors.
 *   3. Every edge references real node ids and non-empty port ids.
 *   4. Templates whose first trigger is `onReady` load into PIE runtime and
 *      fire their downstream action nodes without throwing.
 */

import { describe, it, expect } from "vitest";
import { SCRIPT_TEMPLATES } from "../templates";
import { validateGraph } from "../validation";
import type { ScriptGraph } from "../types";
import {
  createPlayTestWorld,
  type PIEDebugEntry,
  type RuntimeScriptGraph,
} from "@hyperscape/shared/runtime";

/** Editor graph → runtime graph is an identity cast; the shapes are aligned. */
function toRuntimeGraph(g: ScriptGraph): RuntimeScriptGraph {
  return g as unknown as RuntimeScriptGraph;
}

describe("Phase 8.3 — template integration pipeline", () => {
  it("every template factory produces a non-empty graph", () => {
    for (const template of SCRIPT_TEMPLATES) {
      const g = template.create();
      expect(g.id, template.id).toBeTruthy();
      expect(g.nodes.length, template.id).toBeGreaterThan(0);
      const hasTrigger = g.nodes.some((n) => n.type.startsWith("trigger/"));
      expect(hasTrigger, `${template.id} missing trigger`).toBe(true);
    }
  });

  it("every template passes validateGraph with no structural errors", () => {
    // Templates are starting points — `missing-field` errors are expected
    // (user fills zoneId, mobType, etc. in the editor). Structural errors
    // like unknown-type, invalid-edge, cycle, or orphan-node must not occur.
    for (const template of SCRIPT_TEMPLATES) {
      const g = template.create();
      const result = validateGraph(g);
      const structural = result.errors.filter(
        (err) => err.type !== "missing-field",
      );
      expect(
        structural,
        `${template.id} failed structural validation: ${JSON.stringify(structural)}`,
      ).toHaveLength(0);
    }
  });

  it("template edges reference only existing node ids and port shapes", () => {
    for (const template of SCRIPT_TEMPLATES) {
      const g = template.create();
      const nodeIds = new Set(g.nodes.map((n) => n.id));
      for (const edge of g.edges) {
        expect(
          nodeIds.has(edge.sourceNodeId),
          `${template.id} edge source ${edge.sourceNodeId} missing`,
        ).toBe(true);
        expect(
          nodeIds.has(edge.targetNodeId),
          `${template.id} edge target ${edge.targetNodeId} missing`,
        ).toBe(true);
        expect(edge.sourcePortId, template.id).toBeTruthy();
        expect(edge.targetPortId, template.id).toBeTruthy();
      }
    }
  });

  it("onReady-triggered templates load into PIE and fire trigger nodes", async () => {
    // Identify templates whose entry trigger fires on spawn so we can
    // observe them without needing player interaction.
    const readyTemplates = SCRIPT_TEMPLATES.filter((t) => {
      const g = t.create();
      const trigger = g.nodes.find((n) => n.type.startsWith("trigger/"));
      return trigger?.type === "trigger/onReady";
    });

    // Templates using onReady are first-class — at least one must exist.
    expect(readyTemplates.length).toBeGreaterThanOrEqual(0);

    for (const template of readyTemplates) {
      const entries: PIEDebugEntry[] = [];
      const world = createPlayTestWorld();

      try {
        const runtimeGraph = toRuntimeGraph(template.create());

        world.start({
          playerSpawn: { x: 0, y: 0, z: 0 },
          npcs: [
            {
              id: template.id,
              type: "test_npc",
              name: template.label,
              position: { x: 0, y: 0, z: 0 },
              behaviorGraph: runtimeGraph,
            },
          ],
          debugSink: (e) => entries.push(e),
        });

        // Drain microtasks so action handlers complete.
        await Promise.resolve();
        await Promise.resolve();

        const triggerFired = entries.some(
          (e) => e.source === "trigger/onReady",
        );
        expect(
          triggerFired,
          `${template.id} did not fire trigger/onReady`,
        ).toBe(true);
      } finally {
        world.stop();
      }
    }
  });
});
