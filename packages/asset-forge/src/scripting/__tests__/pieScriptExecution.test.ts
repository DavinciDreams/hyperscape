/**
 * PIE Script Execution — End-to-end tests for the Play-In-Editor runtime.
 *
 * Verifies that script graphs authored in the editor actually execute inside
 * `PlayTestWorld` via the bundled `PIEScriptRunner`. Covers the critical
 * pipeline links the user can break by editing the runtime:
 *
 *   1. `trigger/onReady` fires when a graph is loaded onto an entity
 *   2. `world.interactWith()` synthesizes `entity:interacted` and dispatches
 *      to `trigger/onInteract` nodes
 *   3. `action/*` nodes emit world events that `world.scripts.on()` observes
 *   4. The `debugSink` receives one entry per trigger fire and action emit
 *   5. `world.stop()` tears down all script state
 *
 * These tests use the *built* PIE bundle (via the `@hyperscape/shared/runtime`
 * subpath export) rather than reaching into source so they exercise the same
 * artifact World Studio loads in the browser.
 */

import { describe, it, expect } from "vitest";
import {
  createPlayTestWorld,
  type PIEDebugEntry,
  type RuntimeScriptGraph,
} from "@hyperscape/shared/runtime";

// ---------------------------------------------------------------------------
// Graph factories — keep tests readable
// ---------------------------------------------------------------------------

/** A 2-node graph: `trigger/<triggerType>` → `action/showDialogue`. */
function makeTriggerToDialogueGraph(
  graphId: string,
  triggerType: string,
  dialogueText: string,
): RuntimeScriptGraph {
  return {
    id: graphId,
    name: graphId,
    graphType: "behavior",
    variables: [],
    nodes: [
      {
        id: "trig",
        type: triggerType,
        data: {},
        inputs: [],
        outputs: [{ id: "out", type: "flow" }],
      },
      {
        id: "act",
        type: "action/showDialogue",
        data: { title: "Test", text: dialogueText },
        inputs: [{ id: "in", type: "flow" }],
        outputs: [{ id: "out", type: "flow" }],
      },
    ],
    edges: [
      {
        id: "e1",
        sourceNodeId: "trig",
        sourcePortId: "out",
        targetNodeId: "act",
        targetPortId: "in",
      },
    ],
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("PIE Script Execution", () => {
  it("fires trigger/onReady when a graph is loaded onto an NPC", async () => {
    const world = createPlayTestWorld();
    const graph = makeTriggerToDialogueGraph(
      "ready-graph",
      "trigger/onReady",
      "Hello from onReady",
    );

    // onReady fires synchronously inside loadGraph() (called from start()),
    // so we observe via debugSink — wired into start() before the trigger
    // fires — rather than via .on() which would subscribe too late.
    const entries: PIEDebugEntry[] = [];

    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      npcs: [
        {
          id: "guard",
          type: "guard",
          name: "Town Guard",
          position: { x: 5, y: 0, z: 0 },
          behaviorGraph: graph,
        },
      ],
      debugSink: (e) => entries.push(e),
    });

    // Drain microtasks so the action handler chain completes.
    await Promise.resolve();
    await Promise.resolve();

    const dialogueEntry = entries.find((e) => e.source === "dialogue:start");
    expect(dialogueEntry).toBeDefined();
    expect(dialogueEntry?.data?.text).toBe("Hello from onReady");

    const triggerEntry = entries.find((e) => e.source === "trigger/onReady");
    expect(triggerEntry).toBeDefined();
    expect(triggerEntry?.entityId).toBe("npc_guard");

    world.stop();
  });

  it("fires trigger/onInteract via world.interactWith()", async () => {
    const world = createPlayTestWorld();
    const graph = makeTriggerToDialogueGraph(
      "interact-graph",
      "trigger/onInteract",
      "You interacted with me",
    );

    const dialogueEvents: Array<Record<string, unknown>> = [];

    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      npcs: [
        {
          id: "shopkeeper",
          type: "merchant",
          name: "Shopkeeper",
          position: { x: 1, y: 0, z: 1 },
          behaviorGraph: graph,
        },
      ],
    });

    // Subscribe BEFORE the interaction so we don't miss the emit.
    world.scripts!.on("dialogue:start", (data) => {
      dialogueEvents.push(data);
    });

    // The PlayTestWorld assigns NPC ids as `npc_<input.id>`.
    world.interactWith("npc_shopkeeper");

    await Promise.resolve();
    await Promise.resolve();

    expect(dialogueEvents).toHaveLength(1);
    expect(dialogueEvents[0]?.text).toBe("You interacted with me");

    world.stop();
  });

  it("does not fire onInteract for a different entity (matchesEntity scope)", async () => {
    const world = createPlayTestWorld();
    const graph = makeTriggerToDialogueGraph(
      "scoped-graph",
      "trigger/onInteract",
      "scoped",
    );

    const dialogueEvents: Array<Record<string, unknown>> = [];

    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      npcs: [
        {
          id: "alice",
          type: "merchant",
          name: "Alice",
          position: { x: 1, y: 0, z: 1 },
          behaviorGraph: graph,
        },
        {
          id: "bob",
          type: "merchant",
          name: "Bob",
          position: { x: 2, y: 0, z: 2 },
          // No graph on Bob.
        },
      ],
    });

    world.scripts!.on("dialogue:start", (data) => {
      dialogueEvents.push(data);
    });

    // Interact with Bob — Alice's graph should NOT respond because the
    // `entity:interacted` event payload references Bob's id.
    world.interactWith("npc_bob");

    await Promise.resolve();
    await Promise.resolve();

    expect(dialogueEvents).toHaveLength(0);

    world.stop();
  });

  it("forwards trigger and action entries to debugSink", async () => {
    const entries: PIEDebugEntry[] = [];
    const world = createPlayTestWorld();

    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      npcs: [
        {
          id: "logger",
          type: "test",
          name: "Logger",
          position: { x: 0, y: 0, z: 5 },
          behaviorGraph: makeTriggerToDialogueGraph(
            "debug-graph",
            "trigger/onReady",
            "debug message",
          ),
        },
      ],
      debugSink: (e) => entries.push(e),
    });

    await Promise.resolve();
    await Promise.resolve();

    // Expect at least: one info entry (loadGraph), one trigger entry
    // (onReady fired), and one action entry (dialogue:start emitted).
    const levels = entries.map((e) => e.level);
    expect(levels).toContain("info");
    expect(levels).toContain("trigger");
    expect(levels).toContain("action");

    const dialogueEntry = entries.find((e) => e.source === "dialogue:start");
    expect(dialogueEntry).toBeDefined();
    expect(dialogueEntry?.data?.text).toBe("debug message");

    world.stop();
  });

  it("loads behavior graphs from mob spawns", async () => {
    const world = createPlayTestWorld();
    const entries: PIEDebugEntry[] = [];

    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      mobSpawns: [
        {
          id: "goblins",
          mobId: "goblin",
          name: "Goblin",
          position: { x: 10, y: 0, z: 10 },
          spawnRadius: 2,
          maxCount: 1,
          behaviorGraph: makeTriggerToDialogueGraph(
            "mob-graph",
            "trigger/onReady",
            "I am a goblin",
          ),
        },
      ],
      debugSink: (e) => entries.push(e),
    });

    await Promise.resolve();
    await Promise.resolve();

    const dialogueEntry = entries.find((e) => e.source === "dialogue:start");
    expect(dialogueEntry).toBeDefined();
    expect(dialogueEntry?.data?.text).toBe("I am a goblin");

    world.stop();
  });

  it("clears all script state on stop()", async () => {
    const world = createPlayTestWorld();

    world.start({
      playerSpawn: { x: 0, y: 0, z: 0 },
      npcs: [
        {
          id: "ephemeral",
          type: "test",
          name: "Ephemeral",
          position: { x: 0, y: 0, z: 0 },
          behaviorGraph: makeTriggerToDialogueGraph(
            "ephemeral-graph",
            "trigger/onReady",
            "x",
          ),
        },
      ],
    });

    expect(world.scripts).not.toBeNull();
    expect(world.entities.size).toBeGreaterThan(0);

    world.stop();

    expect(world.scripts).toBeNull();
    expect(world.entities.size).toBe(0);
    expect(world.player).toBeNull();
    expect(world.isRunning).toBe(false);
  });
});
