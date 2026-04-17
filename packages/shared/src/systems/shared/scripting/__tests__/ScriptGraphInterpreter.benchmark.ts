/**
 * Phase 8.6 — ScriptGraphInterpreter micro-benchmarks.
 *
 * These run as vitest `bench` cases. They are intentionally written to
 * exercise the hot-path changes introduced in Phase 6 (pre-built
 * successor caches, O(1) port lookups, trigger-node cache).
 *
 * Run with: `npx vitest bench packages/shared/src/systems/shared/scripting/__tests__/ScriptGraphInterpreter.benchmark.ts`
 */

import { bench, describe, vi } from "vitest";
import {
  ScriptGraphInterpreter,
  type RuntimeScriptGraph,
  type RuntimeScriptNode,
  type RuntimeScriptEdge,
  type ExecutionContext,
  type ScriptingWorldInterface,
} from "../ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// Graph factories
// ---------------------------------------------------------------------------

let _idCounter = 0;
function uid(): string {
  return `id_${++_idCounter}`;
}

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
): RuntimeScriptNode {
  return { id, type, data, inputs: [], outputs: [] };
}

function makeEdge(
  srcId: string,
  srcPort: string,
  tgtId: string,
  tgtPort: string,
): RuntimeScriptEdge {
  return {
    id: uid(),
    sourceNodeId: srcId,
    sourcePortId: srcPort,
    targetNodeId: tgtId,
    targetPortId: tgtPort,
  };
}

function makeWorld(): ScriptingWorldInterface {
  return {
    emit: vi.fn(),
    getEntityById: vi.fn().mockReturnValue(null),
    getTime: vi.fn().mockReturnValue(1000),
  };
}

function makeCtx(): ExecutionContext {
  return {
    triggerData: {},
    variables: new Map(),
    entityId: "bench_entity",
    world: makeWorld(),
  };
}

/** Linear chain of N action nodes. */
function makeLinearChain(n: number): RuntimeScriptGraph {
  const nodes: RuntimeScriptNode[] = [makeNode("t1", "trigger/onSpawn")];
  const edges: RuntimeScriptEdge[] = [];
  let prev = "t1";
  for (let i = 0; i < n; i++) {
    const id = `a${i}`;
    nodes.push(makeNode(id, "action/noop"));
    edges.push(makeEdge(prev, "flow_out", id, "flow_in"));
    prev = id;
  }
  return {
    id: uid(),
    name: "linear",
    graphType: "entity",
    nodes,
    edges,
    variables: [],
  };
}

/** Fan-out: trigger with N action successors. */
function makeFanOut(n: number): RuntimeScriptGraph {
  const nodes: RuntimeScriptNode[] = [makeNode("t1", "trigger/onSpawn")];
  const edges: RuntimeScriptEdge[] = [];
  for (let i = 0; i < n; i++) {
    const id = `a${i}`;
    nodes.push(makeNode(id, "action/noop"));
    edges.push(makeEdge("t1", "flow_out", id, "flow_in"));
  }
  return {
    id: uid(),
    name: "fanout",
    graphType: "entity",
    nodes,
    edges,
    variables: [],
  };
}

// ---------------------------------------------------------------------------
// Construction benchmarks — measure the cost of pre-built caches.
// ---------------------------------------------------------------------------

describe("ScriptGraphInterpreter — construction", () => {
  const small = makeLinearChain(10);
  const medium = makeLinearChain(100);
  const large = makeLinearChain(500);
  const fanOut = makeFanOut(100);

  bench("construct linear x10", () => {
    new ScriptGraphInterpreter(small);
  });

  bench("construct linear x100", () => {
    new ScriptGraphInterpreter(medium);
  });

  bench("construct linear x500", () => {
    new ScriptGraphInterpreter(large);
  });

  bench("construct fan-out x100", () => {
    new ScriptGraphInterpreter(fanOut);
  });
});

// ---------------------------------------------------------------------------
// Execution benchmarks — measure hot-path tick cost.
// ---------------------------------------------------------------------------

describe("ScriptGraphInterpreter — execution", () => {
  const linear100 = new ScriptGraphInterpreter(makeLinearChain(100));
  linear100.registerAction("action/noop", () => {});

  const linear500 = new ScriptGraphInterpreter(makeLinearChain(500));
  linear500.registerAction("action/noop", () => {});

  const fanOut100 = new ScriptGraphInterpreter(makeFanOut(100));
  fanOut100.registerAction("action/noop", () => {});

  bench("execute linear x100 (tick budget limits to 100)", async () => {
    await linear100.execute("t1", makeCtx());
  });

  bench("execute linear x500 (tick budget bounds)", async () => {
    await linear500.execute("t1", makeCtx());
  });

  bench("execute fan-out x100 successors", async () => {
    await fanOut100.execute("t1", makeCtx());
  });
});
