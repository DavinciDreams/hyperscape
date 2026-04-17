import { describe, it, expect, vi } from "vitest";
import {
  ScriptGraphInterpreter,
  type RuntimeScriptGraph,
  type RuntimeScriptNode,
  type RuntimeScriptEdge,
  type RuntimeScriptVariable,
  type ExecutionContext,
  type ScriptingWorldInterface,
  type GraphRegistry,
} from "../ScriptGraphInterpreter";

// ---------------------------------------------------------------------------
// Helper factories
// ---------------------------------------------------------------------------

let _idCounter = 0;
function uid(): string {
  return `id_${++_idCounter}`;
}

function makeNode(
  id: string,
  type: string,
  data: Record<string, unknown> = {},
  inputs: RuntimeScriptNode["inputs"] = [],
  outputs: RuntimeScriptNode["outputs"] = [],
): RuntimeScriptNode {
  return { id, type, data, inputs, outputs };
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

function makeGraph(
  nodes: RuntimeScriptNode[],
  edges: RuntimeScriptEdge[],
  variables: RuntimeScriptVariable[] = [],
): RuntimeScriptGraph {
  return {
    id: uid(),
    name: "test-graph",
    graphType: "entity",
    nodes,
    edges,
    variables,
  };
}

function makeCtx(overrides: Partial<ExecutionContext> = {}): ExecutionContext {
  const mockWorld: ScriptingWorldInterface = {
    emit: vi.fn(),
    getEntityById: vi.fn().mockReturnValue(null),
    getTime: vi.fn().mockReturnValue(1000),
  };

  return {
    triggerData: {},
    variables: new Map(),
    entityId: "entity_1",
    world: mockWorld,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Basic execution
// ---------------------------------------------------------------------------

describe("Basic execution", () => {
  it("executes a trigger -> action chain (2 nodes)", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const action = makeNode("a1", "action/emitEvent", { event: "test" });
    const edge = makeEdge("t1", "flow_out", "a1", "flow_in");
    const graph = makeGraph([trigger, action], [edge]);

    const interp = new ScriptGraphInterpreter(graph);
    const handler = vi.fn();
    interp.registerAction("action/emitEvent", handler);

    const ctx = makeCtx();
    await interp.execute("t1", ctx);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(action.data, ctx);
  });

  it("executes a trigger -> action -> action chain (3 nodes)", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const action1 = makeNode("a1", "action/log", { msg: "first" });
    const action2 = makeNode("a2", "action/log", { msg: "second" });
    const edges = [
      makeEdge("t1", "flow_out", "a1", "flow_in"),
      makeEdge("a1", "flow_out", "a2", "flow_in"),
    ];
    const graph = makeGraph([trigger, action1, action2], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toEqual(["first", "second"]);
  });

  it("warns but does not crash on unknown node category", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const unknown = makeNode("u1", "banana/split");
    const edges = [makeEdge("t1", "flow_out", "u1", "flow_in")];
    const graph = makeGraph([trigger, unknown], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const continuations = await interp.execute("t1", makeCtx());

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("Unknown node category: banana"),
    );
    expect(continuations).toEqual([]);
    warnSpy.mockRestore();
  });

  it("runs a chain under MAX_NODES_PER_TICK (60 nodes) to completion", async () => {
    // Build a linear chain of 60 action nodes — well under the 1000 cap.
    const trigger = makeNode("t1", "trigger/onSpawn");
    const nodes: RuntimeScriptNode[] = [trigger];
    const edges: RuntimeScriptEdge[] = [];
    let prevId = "t1";

    for (let i = 0; i < 60; i++) {
      const id = `a${i}`;
      nodes.push(makeNode(id, "action/noop"));
      edges.push(makeEdge(prevId, "flow_out", id, "flow_in"));
      prevId = id;
    }

    const graph = makeGraph(nodes, edges);
    const interp = new ScriptGraphInterpreter(graph);

    let count = 0;
    interp.registerAction("action/noop", () => {
      count++;
    });

    await interp.execute("t1", makeCtx());

    // All 60 run because MAX_NODES_PER_TICK is 1000.
    expect(count).toBe(60);
  });

  it("returns empty continuations when trigger node ID does not exist", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const graph = makeGraph([trigger], []);

    const interp = new ScriptGraphInterpreter(graph);
    const result = await interp.execute("nonexistent", makeCtx());

    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// 2. Condition nodes
// ---------------------------------------------------------------------------

describe("Condition nodes", () => {
  it("follows true branch when condition evaluates true", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const cond = makeNode("c1", "condition/hasItem", { itemId: "sword" });
    const trueAction = makeNode("a_t", "action/log", { msg: "yes" });
    const falseAction = makeNode("a_f", "action/log", { msg: "no" });
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "true", "a_t", "flow_in"),
      makeEdge("c1", "false", "a_f", "flow_in"),
    ];
    const graph = makeGraph([trigger, cond, trueAction, falseAction], edges);

    const interp = new ScriptGraphInterpreter(graph);
    interp.registerCondition("condition/hasItem", () => true);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toEqual(["yes"]);
  });

  it("follows false branch when condition evaluates false", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const cond = makeNode("c1", "condition/hasItem", { itemId: "sword" });
    const trueAction = makeNode("a_t", "action/log", { msg: "yes" });
    const falseAction = makeNode("a_f", "action/log", { msg: "no" });
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "true", "a_t", "flow_in"),
      makeEdge("c1", "false", "a_f", "flow_in"),
    ];
    const graph = makeGraph([trigger, cond, trueAction, falseAction], edges);

    const interp = new ScriptGraphInterpreter(graph);
    interp.registerCondition("condition/hasItem", () => false);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toEqual(["no"]);
  });

  it("stops execution when no evaluator is registered for a condition", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const cond = makeNode("c1", "condition/unknownCond");
    const action = makeNode("a1", "action/log", { msg: "after" });
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "true", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, cond, action], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const handler = vi.fn();
    interp.registerAction("action/log", handler);

    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    await interp.execute("t1", makeCtx());
    warnSpy.mockRestore();

    expect(handler).not.toHaveBeenCalled();
  });

  it("matches port variants out_true / out_false", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const cond = makeNode("c1", "condition/check");
    const trueAction = makeNode("a_t", "action/log", { msg: "yes" });
    const falseAction = makeNode("a_f", "action/log", { msg: "no" });
    // Use alternate port names
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "out_true", "a_t", "flow_in"),
      makeEdge("c1", "out_false", "a_f", "flow_in"),
    ];
    const graph = makeGraph([trigger, cond, trueAction, falseAction], edges);

    const interp = new ScriptGraphInterpreter(graph);
    interp.registerCondition("condition/check", () => true);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toEqual(["yes"]);
  });
});

// ---------------------------------------------------------------------------
// 3. Flow control nodes
// ---------------------------------------------------------------------------

describe("Flow control nodes", () => {
  it("flow/branch follows true path when value is truthy", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const branch = makeNode("b1", "flow/branch", { value: true });
    const trueAction = makeNode("a_t", "action/log", { msg: "true" });
    const falseAction = makeNode("a_f", "action/log", { msg: "false" });
    const edges = [
      makeEdge("t1", "flow_out", "b1", "flow_in"),
      makeEdge("b1", "true", "a_t", "flow_in"),
      makeEdge("b1", "false", "a_f", "flow_in"),
    ];
    const graph = makeGraph([trigger, branch, trueAction, falseAction], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toEqual(["true"]);
  });

  it("flow/branch follows false path when value is falsy", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const branch = makeNode("b1", "flow/branch", { value: false });
    const trueAction = makeNode("a_t", "action/log", { msg: "true" });
    const falseAction = makeNode("a_f", "action/log", { msg: "false" });
    const edges = [
      makeEdge("t1", "flow_out", "b1", "flow_in"),
      makeEdge("b1", "true", "a_t", "flow_in"),
      makeEdge("b1", "false", "a_f", "flow_in"),
    ];
    const graph = makeGraph([trigger, branch, trueAction, falseAction], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toEqual(["false"]);
  });

  it("flow/sequence passes execution to all successors", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const seq = makeNode("s1", "flow/sequence");
    const a1 = makeNode("a1", "action/log", { msg: "one" });
    const a2 = makeNode("a2", "action/log", { msg: "two" });
    const edges = [
      makeEdge("t1", "flow_out", "s1", "flow_in"),
      makeEdge("s1", "out_0", "a1", "flow_in"),
      makeEdge("s1", "out_1", "a2", "flow_in"),
    ];
    const graph = makeGraph([trigger, seq, a1, a2], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toContain("one");
    expect(calls).toContain("two");
    expect(calls).toHaveLength(2);
  });

  it("flow/delay returns a DelayedContinuation with correct delayMs", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const delay = makeNode("d1", "flow/delay", { delayMs: 2000 });
    const action = makeNode("a1", "action/log", { msg: "delayed" });
    const edges = [
      makeEdge("t1", "flow_out", "d1", "flow_in"),
      makeEdge("d1", "flow_out", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, delay, action], edges);

    const interp = new ScriptGraphInterpreter(graph);
    interp.registerAction("action/log", vi.fn());

    const continuations = await interp.execute("t1", makeCtx());

    expect(continuations).toHaveLength(1);
    expect(continuations[0].delayMs).toBe(2000);
    expect(continuations[0].resumeNodeIds).toContain("a1");
  });

  it("flow/delay converts duration (seconds) to delayMs", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const delay = makeNode("d1", "flow/delay", { duration: 3 });
    const action = makeNode("a1", "action/log");
    const edges = [
      makeEdge("t1", "flow_out", "d1", "flow_in"),
      makeEdge("d1", "flow_out", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, delay, action], edges);

    const interp = new ScriptGraphInterpreter(graph);
    interp.registerAction("action/log", vi.fn());

    const continuations = await interp.execute("t1", makeCtx());

    expect(continuations).toHaveLength(1);
    expect(continuations[0].delayMs).toBe(3000);
  });

  it("flow/gate passes through when open", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const gate = makeNode("g1", "flow/gate", { startOpen: true });
    const action = makeNode("a1", "action/log", { msg: "passed" });
    const edges = [
      makeEdge("t1", "flow_out", "g1", "flow_in"),
      makeEdge("g1", "flow_out", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, gate, action], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const handler = vi.fn();
    interp.registerAction("action/log", handler);

    await interp.execute("t1", makeCtx());

    expect(handler).toHaveBeenCalledOnce();
  });

  it("flow/gate blocks when closed", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const gate = makeNode("g1", "flow/gate", { startOpen: false });
    const action = makeNode("a1", "action/log", { msg: "blocked" });
    const edges = [
      makeEdge("t1", "flow_out", "g1", "flow_in"),
      makeEdge("g1", "flow_out", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, gate, action], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const handler = vi.fn();
    interp.registerAction("action/log", handler);

    await interp.execute("t1", makeCtx());

    expect(handler).not.toHaveBeenCalled();
  });

  it("flow/doN allows N executions then stops", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const doN = makeNode("dn1", "flow/doN", { count: 3 });
    const action = makeNode("a1", "action/log", { msg: "tick" });
    const edges = [
      makeEdge("t1", "flow_out", "dn1", "flow_in"),
      makeEdge("dn1", "flow_out", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, doN, action], edges);

    const interp = new ScriptGraphInterpreter(graph);
    let count = 0;
    interp.registerAction("action/log", () => {
      count++;
    });

    // Execute 5 times — only first 3 should pass through
    for (let i = 0; i < 5; i++) {
      await interp.execute("t1", makeCtx());
    }

    expect(count).toBe(3);
  });

  it("flow/flipFlop alternates between a_out and b_out", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const flip = makeNode("ff1", "flow/flipFlop");
    const actionA = makeNode("a_a", "action/log", { msg: "A" });
    const actionB = makeNode("a_b", "action/log", { msg: "B" });
    const edges = [
      makeEdge("t1", "flow_out", "ff1", "flow_in"),
      makeEdge("ff1", "a_out", "a_a", "flow_in"),
      makeEdge("ff1", "b_out", "a_b", "flow_in"),
    ];
    const graph = makeGraph([trigger, flip, actionA, actionB], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());
    await interp.execute("t1", makeCtx());
    await interp.execute("t1", makeCtx());
    await interp.execute("t1", makeCtx());

    // First execution: isA starts undefined, !undefined = true → a_out
    // Second execution: !true = false → b_out
    // Third execution: !false = true → a_out
    // Fourth execution: !true = false → b_out
    expect(calls).toEqual(["A", "B", "A", "B"]);
  });
});

// ---------------------------------------------------------------------------
// 4. Math nodes
// ---------------------------------------------------------------------------

describe("Math nodes", () => {
  function evalMath(op: string, data: Record<string, unknown> = {}): unknown {
    const node = makeNode("m1", `math/${op}`, data);
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    return interp.evaluateDataNode(node, "result", makeCtx());
  }

  it("math/add: 3 + 5 = 8", () => {
    expect(evalMath("add", { a: 3, b: 5 })).toBe(8);
  });

  it("math/subtract: 10 - 3 = 7", () => {
    expect(evalMath("subtract", { a: 10, b: 3 })).toBe(7);
  });

  it("math/multiply: 4 * 6 = 24", () => {
    expect(evalMath("multiply", { a: 4, b: 6 })).toBe(24);
  });

  it("math/divide: 15 / 3 = 5", () => {
    expect(evalMath("divide", { a: 15, b: 3 })).toBe(5);
  });

  it("math/divide by zero returns 0", () => {
    expect(evalMath("divide", { a: 15, b: 0 })).toBe(0);
  });

  it("math/clamp: clamp(15, 0, 10) = 10", () => {
    expect(evalMath("clamp", { value: 15, min: 0, max: 10 })).toBe(10);
  });

  it("math/lerp: lerp(0, 100, 0.5) = 50", () => {
    expect(evalMath("lerp", { a: 0, b: 100, alpha: 0.5 })).toBe(50);
  });

  it("math/abs: abs(-5) = 5", () => {
    expect(evalMath("abs", { a: -5 })).toBe(5);
  });

  it("math/floor: floor(3.7) = 3", () => {
    expect(evalMath("floor", { a: 3.7 })).toBe(3);
  });

  it("math/ceil: ceil(3.2) = 4", () => {
    expect(evalMath("ceil", { a: 3.2 })).toBe(4);
  });

  it("math/distance3D: distance((0,0,0), (3,4,0)) = 5", () => {
    expect(
      evalMath("distance3D", { x1: 0, y1: 0, z1: 0, x2: 3, y2: 4, z2: 0 }),
    ).toBe(5);
  });

  it("math/compare: 5 > 3 = true", () => {
    expect(evalMath("compare", { a: 5, b: 3, operator: ">" })).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 5. Variable nodes
// ---------------------------------------------------------------------------

describe("Variable nodes", () => {
  it("variable/set stores value in context.variables", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const setVar = makeNode("v1", "variable/set", {
      variableName: "score",
      value: 42,
    });
    const edges = [makeEdge("t1", "flow_out", "v1", "flow_in")];
    const graph = makeGraph([trigger, setVar], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx();

    await interp.execute("t1", ctx);

    expect(ctx.variables.get("score")).toBe(42);
  });

  it("variable/get reads value from context.variables", () => {
    const getNode = makeNode("v1", "variable/get", { variableName: "health" });
    const graph = makeGraph([getNode], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx();
    ctx.variables.set("health", 75);

    const result = interp.evaluateDataNode(getNode, "value", ctx);

    expect(result).toBe(75);
  });

  it("variable/increment adds amount to existing variable", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const inc = makeNode("v1", "variable/increment", {
      variableName: "counter",
      amount: 5,
    });
    const edges = [makeEdge("t1", "flow_out", "v1", "flow_in")];
    const graph = makeGraph([trigger, inc], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx();
    ctx.variables.set("counter", 10);

    await interp.execute("t1", ctx);

    expect(ctx.variables.get("counter")).toBe(15);
  });

  it("variable/increment starts from 0 when variable does not exist", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const inc = makeNode("v1", "variable/increment", {
      variableName: "fresh",
      amount: 7,
    });
    const edges = [makeEdge("t1", "flow_out", "v1", "flow_in")];
    const graph = makeGraph([trigger, inc], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx();

    await interp.execute("t1", ctx);

    expect(ctx.variables.get("fresh")).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// 6. Data nodes
// ---------------------------------------------------------------------------

describe("Data nodes", () => {
  it("data/constant returns configured value", () => {
    const node = makeNode("d1", "data/constant", { value: "hello" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    const result = interp.evaluateDataNode(node, "value", makeCtx());

    expect(result).toBe("hello");
  });

  it("data/getTime returns world time", () => {
    const node = makeNode("d1", "data/getTime");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx();
    (ctx.world.getTime as ReturnType<typeof vi.fn>).mockReturnValue(5000);

    const result = interp.evaluateDataNode(node, "time", ctx);

    expect(result).toBe(5000);
  });

  it("data/makeVector3 creates { x, y, z } object", () => {
    const node = makeNode("d1", "data/makeVector3", { x: 1, y: 2, z: 3 });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    const result = interp.evaluateDataNode(node, "vector", makeCtx());

    expect(result).toEqual({ x: 1, y: 2, z: 3 });
  });

  it("data/breakVector3 extracts components", () => {
    const vecNode = makeNode("vec1", "data/makeVector3", {
      x: 10,
      y: 20,
      z: 30,
    });
    const breakNode = makeNode("brk1", "data/breakVector3");
    // Connect makeVector3's output to breakVector3's vector input
    const edge = makeEdge("vec1", "vector", "brk1", "vector");
    const graph = makeGraph([vecNode, breakNode], [edge]);

    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx();

    const x = interp.evaluateDataNode(breakNode, "x", ctx);
    const y = interp.evaluateDataNode(breakNode, "y", ctx);
    const z = interp.evaluateDataNode(breakNode, "z", ctx);

    expect(x).toBe(10);
    expect(y).toBe(20);
    expect(z).toBe(30);
  });
});

// ---------------------------------------------------------------------------
// 7. readDataInput
// ---------------------------------------------------------------------------

describe("readDataInput", () => {
  it("returns null when no edge connects to port", () => {
    const node = makeNode("a1", "action/doStuff");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    const result = interp.readDataInput("a1", "damage", makeCtx());

    expect(result).toBeNull();
  });

  it("returns static data from source node when connected to a non-pure node", () => {
    const srcNode = makeNode("src1", "action/getStat", { statValue: 99 });
    const dstNode = makeNode("dst1", "action/useStat");
    const edge = makeEdge("src1", "statValue", "dst1", "input");
    const graph = makeGraph([srcNode, dstNode], [edge]);

    const interp = new ScriptGraphInterpreter(graph);
    const result = interp.readDataInput("dst1", "input", makeCtx());

    expect(result).toBe(99);
  });

  it("evaluates math node when connected to a math source", () => {
    const mathNode = makeNode("m1", "math/add", { a: 7, b: 3 });
    const actionNode = makeNode("a1", "action/useDamage");
    const edge = makeEdge("m1", "result", "a1", "damage");
    const graph = makeGraph([mathNode, actionNode], [edge]);

    const interp = new ScriptGraphInterpreter(graph);
    const result = interp.readDataInput("a1", "damage", makeCtx());

    expect(result).toBe(10);
  });
});

// ---------------------------------------------------------------------------
// 8. Edge traversal
// ---------------------------------------------------------------------------

describe("Edge traversal", () => {
  it("getTriggerNodes returns only trigger/* nodes", () => {
    const t1 = makeNode("t1", "trigger/onSpawn");
    const t2 = makeNode("t2", "trigger/onDeath");
    const a1 = makeNode("a1", "action/log");
    const c1 = makeNode("c1", "condition/check");
    const graph = makeGraph([t1, t2, a1, c1], []);

    const interp = new ScriptGraphInterpreter(graph);
    const triggers = interp.getTriggerNodes();

    expect(triggers).toHaveLength(2);
    expect(triggers.map((n) => n.id).sort()).toEqual(["t1", "t2"]);
  });

  it("getFlowSuccessors returns correct node IDs (via execute chain)", async () => {
    // Verify that a trigger with two flow outputs reaches both successors
    const trigger = makeNode("t1", "trigger/onSpawn");
    const a1 = makeNode("a1", "action/log", { msg: "one" });
    const a2 = makeNode("a2", "action/log", { msg: "two" });
    const edges = [
      makeEdge("t1", "flow_out", "a1", "flow_in"),
      makeEdge("t1", "flow_out_2", "a2", "flow_in"),
    ];
    const graph = makeGraph([trigger, a1, a2], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    await interp.execute("t1", makeCtx());

    expect(calls).toContain("one");
    expect(calls).toContain("two");
    expect(calls).toHaveLength(2);
  });

  it("getPortSuccessors filters by specific port (via flow/flipFlop)", async () => {
    // flipFlop uses getMatchingPortSuccessors with specific port IDs,
    // verifying that only the matching port's successor is followed
    const trigger = makeNode("t1", "trigger/onSpawn");
    const flip = makeNode("ff1", "flow/flipFlop");
    const aA = makeNode("a_a", "action/log", { msg: "A" });
    const aB = makeNode("a_b", "action/log", { msg: "B" });
    const edges = [
      makeEdge("t1", "flow_out", "ff1", "flow_in"),
      makeEdge("ff1", "a_out", "a_a", "flow_in"),
      makeEdge("ff1", "b_out", "a_b", "flow_in"),
    ];
    const graph = makeGraph([trigger, flip, aA, aB], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const calls: string[] = [];
    interp.registerAction("action/log", (data) => {
      calls.push(data.msg as string);
    });

    // First execution should go to a_out only
    await interp.execute("t1", makeCtx());

    expect(calls).toEqual(["A"]);
  });
});

// ---------------------------------------------------------------------------
// Execution safety limits (Phase 5.2)
// ---------------------------------------------------------------------------

describe("ScriptGraphInterpreter execution limits", () => {
  it("aborts after MAX_NODES_PER_TICK and emits scripting:limit_hit", async () => {
    // Build a long linear chain of log actions that exceeds 1000 nodes.
    const totalNodes = 1200;
    const trigger = makeNode("t", "trigger/onReady");
    const nodes: RuntimeScriptNode[] = [trigger];
    const edges: RuntimeScriptEdge[] = [];
    for (let i = 0; i < totalNodes; i++) {
      const id = `a_${i}`;
      nodes.push(makeNode(id, "action/log", { msg: `${i}` }));
      const prev = i === 0 ? "t" : `a_${i - 1}`;
      edges.push(makeEdge(prev, "flow_out", id, "flow_in"));
    }
    const graph = makeGraph(nodes, edges);

    const interp = new ScriptGraphInterpreter(graph);
    let executed = 0;
    interp.registerAction("action/log", () => {
      executed++;
    });

    const ctx = makeCtx();
    await interp.execute("t", ctx);

    // Interpreter must stop at or below the tick cap
    expect(executed).toBeLessThanOrEqual(1000);

    // And must emit the limit-hit event exactly once
    const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
    const limitCalls = emitMock.mock.calls.filter(
      (c) => c[0] === "scripting:limit_hit",
    );
    expect(limitCalls).toHaveLength(1);
    expect(limitCalls[0][1]).toMatchObject({
      limit: "MAX_NODES_PER_TICK",
      graphId: graph.id,
    });
  });

  it("caps delayed continuations at MAX_DELAYED_CONTINUATIONS", async () => {
    // Build a trigger that fans out to N flow/delay nodes. Each delay
    // becomes a separate DelayedContinuation. We expect at most 256.
    const trigger = makeNode("t", "trigger/onReady");
    const fanoutCount = 300;
    const delays: RuntimeScriptNode[] = [];
    const edges: RuntimeScriptEdge[] = [];
    for (let i = 0; i < fanoutCount; i++) {
      const id = `d_${i}`;
      delays.push(makeNode(id, "flow/delay", { delayMs: 1000 }));
      edges.push(makeEdge("t", "flow_out", id, "flow_in"));
    }
    const graph = makeGraph([trigger, ...delays], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx();
    const continuations = await interp.execute("t", ctx);

    expect(continuations.length).toBeLessThanOrEqual(256);

    const emitMock = ctx.world.emit as unknown as ReturnType<typeof vi.fn>;
    const limitCalls = emitMock.mock.calls.filter(
      (c) => c[0] === "scripting:limit_hit",
    );
    expect(
      limitCalls.some((c) => c[1].limit === "MAX_DELAYED_CONTINUATIONS"),
    ).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 9. Spatial query nodes (Phase 2.1)
// ---------------------------------------------------------------------------

type SpatialEntity = {
  id: string;
  type: string;
  position: { x: number; y: number; z: number };
};

function makeSpatialCtx(
  entities: SpatialEntity[],
  selfId: string = "self",
  opts: {
    raycast?: ScriptingWorldInterface["raycast"];
  } = {},
): ExecutionContext {
  const byId = new Map<string, SpatialEntity>();
  for (const e of entities) byId.set(e.id, e);
  if (!byId.has(selfId)) {
    byId.set(selfId, {
      id: selfId,
      type: "Player",
      position: { x: 0, y: 0, z: 0 },
    });
  }

  const world: ScriptingWorldInterface = {
    emit: vi.fn(),
    getEntityById: vi.fn((id: string) => {
      const e = byId.get(id);
      return e ? (e as unknown as Record<string, unknown>) : null;
    }),
    getTime: vi.fn().mockReturnValue(0),
    getEntitiesInRadius: (
      x: number,
      z: number,
      radius: number,
      type?: string,
    ) => {
      const r2 = radius * radius;
      const out: SpatialEntity[] = [];
      for (const e of byId.values()) {
        const dx = e.position.x - x;
        const dz = e.position.z - z;
        if (dx * dx + dz * dz > r2) continue;
        if (type && e.type !== type) continue;
        out.push(e);
      }
      return out;
    },
    raycast: opts.raycast,
  };

  return {
    triggerData: {},
    variables: new Map(),
    entityId: selfId,
    world,
  };
}

describe("Spatial query nodes", () => {
  it("data/findEntitiesInRadius returns ids within radius on XZ plane", () => {
    const entities: SpatialEntity[] = [
      { id: "self", type: "Player", position: { x: 0, y: 0, z: 0 } },
      { id: "m1", type: "Mob", position: { x: 2, y: 0, z: 0 } },
      { id: "m2", type: "Mob", position: { x: 0, y: 100, z: 3 } }, // far Y but XZ close
      { id: "m3", type: "Mob", position: { x: 50, y: 0, z: 50 } }, // outside
    ];
    const node = makeNode("f1", "data/findEntitiesInRadius", { radius: 10 });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities);

    const ids = interp.evaluateDataNode(node, "entities", ctx) as string[];
    expect(ids).toEqual(expect.arrayContaining(["self", "m1", "m2"]));
    expect(ids).not.toContain("m3");

    const count = interp.evaluateDataNode(node, "count", ctx) as number;
    expect(count).toBe(3);
  });

  it("data/findEntitiesInRadius filters by type when provided", () => {
    const entities: SpatialEntity[] = [
      { id: "self", type: "Player", position: { x: 0, y: 0, z: 0 } },
      { id: "m1", type: "Mob", position: { x: 1, y: 0, z: 0 } },
      { id: "n1", type: "NPC", position: { x: 2, y: 0, z: 0 } },
    ];
    const node = makeNode("f1", "data/findEntitiesInRadius", {
      radius: 5,
      type: "Mob",
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities);

    const ids = interp.evaluateDataNode(node, "entities", ctx) as string[];
    expect(ids).toEqual(["m1"]);
  });

  it("data/findEntitiesInRadius returns [] when world lacks getEntitiesInRadius", () => {
    const node = makeNode("f1", "data/findEntitiesInRadius", { radius: 10 });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCtx(); // no spatial backing
    (ctx.world.getEntityById as ReturnType<typeof vi.fn>).mockReturnValue({
      position: { x: 0, y: 0, z: 0 },
    });

    const ids = interp.evaluateDataNode(node, "entities", ctx) as string[];
    expect(ids).toEqual([]);
  });

  it("data/findClosestEntity excludes self and returns nearest id", () => {
    const entities: SpatialEntity[] = [
      { id: "self", type: "Player", position: { x: 0, y: 0, z: 0 } },
      { id: "far", type: "Mob", position: { x: 8, y: 0, z: 0 } },
      { id: "near", type: "Mob", position: { x: 3, y: 0, z: 0 } },
      { id: "middle", type: "Mob", position: { x: 5, y: 0, z: 0 } },
    ];
    const node = makeNode("f1", "data/findClosestEntity", {
      radius: 20,
      type: "Mob",
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities);

    const id = interp.evaluateDataNode(node, "entityId", ctx);
    expect(id).toBe("near");

    const distance = interp.evaluateDataNode(node, "distance", ctx) as number;
    expect(distance).toBeCloseTo(3);
  });

  it("data/findClosestEntity returns null when no candidates", () => {
    const entities: SpatialEntity[] = [
      { id: "self", type: "Player", position: { x: 0, y: 0, z: 0 } },
    ];
    const node = makeNode("f1", "data/findClosestEntity", { radius: 5 });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities);

    const id = interp.evaluateDataNode(node, "entityId", ctx);
    expect(id).toBeNull();
  });

  it("data/isLineOfSight returns true when no physics raycast is available", () => {
    const entities: SpatialEntity[] = [
      { id: "a", type: "Player", position: { x: 0, y: 0, z: 0 } },
      { id: "b", type: "Mob", position: { x: 5, y: 0, z: 0 } },
    ];
    const node = makeNode("l1", "data/isLineOfSight", { from: "a", to: "b" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities, "a");

    const hasLOS = interp.evaluateDataNode(node, "hasLOS", ctx);
    expect(hasLOS).toBe(true);
  });

  it("data/isLineOfSight returns false when raycast hits an obstacle before target", () => {
    const entities: SpatialEntity[] = [
      { id: "a", type: "Player", position: { x: 0, y: 0, z: 0 } },
      { id: "b", type: "Mob", position: { x: 10, y: 0, z: 0 } },
    ];
    // Fake raycast: hits something 3 units away (before target at dist 10).
    const raycast = vi.fn().mockReturnValue({
      entityId: "wall",
      point: { x: 3, y: 0, z: 0 },
      distance: 3,
    });
    const node = makeNode("l1", "data/isLineOfSight", { from: "a", to: "b" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities, "a", { raycast });

    const hasLOS = interp.evaluateDataNode(node, "hasLOS", ctx);
    expect(hasLOS).toBe(false);
    expect(raycast).toHaveBeenCalledOnce();
  });

  it("data/isLineOfSight returns true when raycast hits the target itself", () => {
    const entities: SpatialEntity[] = [
      { id: "a", type: "Player", position: { x: 0, y: 0, z: 0 } },
      { id: "b", type: "Mob", position: { x: 10, y: 0, z: 0 } },
    ];
    const raycast = vi.fn().mockReturnValue({
      entityId: "b",
      point: { x: 10, y: 0, z: 0 },
      distance: 10,
    });
    const node = makeNode("l1", "data/isLineOfSight", { from: "a", to: "b" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities, "a", { raycast });

    const hasLOS = interp.evaluateDataNode(node, "hasLOS", ctx);
    expect(hasLOS).toBe(true);
  });

  it("data/lineTrace returns hit entityId, distance, and point", () => {
    const raycast = vi.fn().mockReturnValue({
      entityId: "target",
      point: { x: 5, y: 1, z: 0 },
      distance: 5,
    });
    const node = makeNode("t1", "data/lineTrace", {
      dirX: 1,
      dirY: 0,
      dirZ: 0,
      maxDistance: 50,
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx([], "self", { raycast });

    const entityId = interp.evaluateDataNode(node, "entityId", ctx);
    expect(entityId).toBe("target");

    const distance = interp.evaluateDataNode(node, "distance", ctx);
    expect(distance).toBe(5);

    const point = interp.evaluateDataNode(node, "point", ctx);
    expect(point).toEqual({ x: 5, y: 1, z: 0 });
  });

  it("data/lineTrace returns null when raycast misses", () => {
    const raycast = vi.fn().mockReturnValue(null);
    const node = makeNode("t1", "data/lineTrace", {
      dirX: 0,
      dirY: 0,
      dirZ: 1,
      maxDistance: 10,
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx([], "self", { raycast });

    const entityId = interp.evaluateDataNode(node, "entityId", ctx);
    expect(entityId).toBeNull();
  });

  it("data/lineTrace returns null when world lacks raycast", () => {
    const node = makeNode("t1", "data/lineTrace", { maxDistance: 10 });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx([], "self"); // no raycast

    const result = interp.evaluateDataNode(node, "entityId", ctx);
    expect(result).toBeNull();
  });

  it("data/sphereCast excludes entities outside 3D radius even when XZ is close", () => {
    const entities: SpatialEntity[] = [
      { id: "self", type: "Player", position: { x: 0, y: 0, z: 0 } },
      // Inside XZ radius 5 but Y is 100 → excluded by 3D distance.
      { id: "far_up", type: "Mob", position: { x: 0, y: 100, z: 0 } },
      // Within 3D radius.
      { id: "near", type: "Mob", position: { x: 3, y: 1, z: 2 } },
    ];
    const node = makeNode("s1", "data/sphereCast", { radius: 5 });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities);

    const ids = interp.evaluateDataNode(node, "entities", ctx) as string[];
    expect(ids).toContain("self");
    expect(ids).toContain("near");
    expect(ids).not.toContain("far_up");

    const count = interp.evaluateDataNode(node, "count", ctx) as number;
    expect(count).toBe(ids.length);
  });

  it("data/sphereCast filters by type", () => {
    const entities: SpatialEntity[] = [
      { id: "self", type: "Player", position: { x: 0, y: 0, z: 0 } },
      { id: "m1", type: "Mob", position: { x: 1, y: 0, z: 0 } },
      { id: "n1", type: "NPC", position: { x: 1, y: 0, z: 1 } },
    ];
    const node = makeNode("s1", "data/sphereCast", {
      radius: 10,
      type: "Mob",
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities);

    const ids = interp.evaluateDataNode(node, "entities", ctx) as string[];
    expect(ids).toEqual(["m1"]);
  });

  it("resolveOrigin falls back to self when origin input is absent", () => {
    const entities: SpatialEntity[] = [
      { id: "self", type: "Player", position: { x: 10, y: 0, z: 10 } },
      { id: "other", type: "Mob", position: { x: 12, y: 0, z: 10 } },
    ];
    const node = makeNode("f1", "data/findEntitiesInRadius", { radius: 3 });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeSpatialCtx(entities);

    const ids = interp.evaluateDataNode(node, "entities", ctx) as string[];
    // Origin = self's position (10, 10). "other" is 2 away → included.
    expect(ids).toEqual(expect.arrayContaining(["self", "other"]));
  });
});

// ---------------------------------------------------------------------------
// 10. Typed ECS component accessors (Phase 2.3)
// ---------------------------------------------------------------------------

function makeEcsCtx(
  entity: Record<string, unknown>,
  entityId: string = "self",
): ExecutionContext {
  const world: ScriptingWorldInterface = {
    emit: vi.fn(),
    getEntityById: vi.fn((id: string) => {
      if (id === entityId) return entity;
      return null;
    }),
    getTime: vi.fn().mockReturnValue(0),
  };
  return {
    triggerData: {},
    variables: new Map(),
    entityId,
    world,
  };
}

describe("Typed ECS component accessors", () => {
  it("data/getEntityPosition returns full vec3 and individual axes", () => {
    const node = makeNode("p1", "data/getEntityPosition");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      position: { x: 3, y: 4, z: 5 },
      data: {},
    });

    expect(interp.evaluateDataNode(node, "position", ctx)).toEqual({
      x: 3,
      y: 4,
      z: 5,
    });
    expect(interp.evaluateDataNode(node, "x", ctx)).toBe(3);
    expect(interp.evaluateDataNode(node, "y", ctx)).toBe(4);
    expect(interp.evaluateDataNode(node, "z", ctx)).toBe(5);
  });

  it("data/getEntityPosition falls back to data.position", () => {
    const node = makeNode("p1", "data/getEntityPosition");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      data: { position: { x: 1, y: 2, z: 3 } },
    });

    expect(interp.evaluateDataNode(node, "position", ctx)).toEqual({
      x: 1,
      y: 2,
      z: 3,
    });
  });

  it("data/getEntityRotation returns quaternion when w is present", () => {
    const node = makeNode("r1", "data/getEntityRotation");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      rotation: { x: 0, y: 0.707, z: 0, w: 0.707 },
      data: {},
    });

    expect(interp.evaluateDataNode(node, "w", ctx)).toBeCloseTo(0.707);
    expect(interp.evaluateDataNode(node, "y", ctx)).toBeCloseTo(0.707);
  });

  it("data/getEntityRotation returns null when no rotation exists", () => {
    const node = makeNode("r1", "data/getEntityRotation");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({ data: {} });

    expect(interp.evaluateDataNode(node, "rotation", ctx)).toBeNull();
  });

  it("data/getPlayerHealth returns current, max, and percent", () => {
    const node = makeNode("h1", "data/getPlayerHealth");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      data: { health: 25, maxHealth: 100 },
    });

    expect(interp.evaluateDataNode(node, "current", ctx)).toBe(25);
    expect(interp.evaluateDataNode(node, "max", ctx)).toBe(100);
    expect(interp.evaluateDataNode(node, "percent", ctx)).toBe(0.25);
  });

  it("data/getPlayerHealth percent is 0 when maxHealth is 0", () => {
    const node = makeNode("h1", "data/getPlayerHealth");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      data: { health: 0, maxHealth: 0 },
    });

    expect(interp.evaluateDataNode(node, "percent", ctx)).toBe(0);
  });

  it("data/getPlayerStats returns skill level via `skill` field", () => {
    const node = makeNode("s1", "data/getPlayerStats", { skill: "attack" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      data: {
        level: 42,
        skills: {
          attack: { level: 60, xp: 273742 },
          strength: { level: 50, xp: 101333 },
        },
      },
    });

    // outputPortId = "level" falls back to combat level (data.level = 42).
    expect(interp.evaluateDataNode(node, "level", ctx)).toBe(42);
    expect(interp.evaluateDataNode(node, "xp", ctx)).toBe(273742);
  });

  it("data/getPlayerStats returns 0 for unknown skill", () => {
    const node = makeNode("s1", "data/getPlayerStats", { skill: "cooking" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      data: {
        skills: {
          attack: { level: 60, xp: 1000 },
        },
      },
    });

    expect(interp.evaluateDataNode(node, "xp", ctx)).toBe(0);
  });

  it("data/getPlayerInventory returns item-id array, count, and hasSpace", () => {
    const node = makeNode("inv1", "data/getPlayerInventory");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      data: {
        inventory: [{ id: "bronze_sword" }, { id: "logs" }, { id: "coins" }],
      },
    });

    const items = interp.evaluateDataNode(node, "items", ctx);
    expect(items).toEqual(["bronze_sword", "logs", "coins"]);
    expect(interp.evaluateDataNode(node, "count", ctx)).toBe(3);
    expect(interp.evaluateDataNode(node, "hasSpace", ctx)).toBe(true);
  });

  it("data/getPlayerInventory hasSpace is false at default capacity 28", () => {
    const full = Array.from({ length: 28 }, (_, i) => ({ id: `item_${i}` }));
    const node = makeNode("inv1", "data/getPlayerInventory");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({ data: { inventory: full } });

    expect(interp.evaluateDataNode(node, "count", ctx)).toBe(28);
    expect(interp.evaluateDataNode(node, "hasSpace", ctx)).toBe(false);
  });

  it("data/getPlayerInventory returns [] when no inventory present", () => {
    const node = makeNode("inv1", "data/getPlayerInventory");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({ data: {} });

    expect(interp.evaluateDataNode(node, "items", ctx)).toEqual([]);
    expect(interp.evaluateDataNode(node, "count", ctx)).toBe(0);
  });

  it("data/getPlayerEquipment returns slot item id or null", () => {
    const node = makeNode("eq1", "data/getPlayerEquipment");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeEcsCtx({
      data: {
        equipment: {
          weapon: { id: "bronze_sword" },
          shield: { id: "wooden_shield" },
          helmet: null,
        },
      },
    });

    expect(interp.evaluateDataNode(node, "weapon", ctx)).toBe("bronze_sword");
    expect(interp.evaluateDataNode(node, "shield", ctx)).toBe("wooden_shield");
    expect(interp.evaluateDataNode(node, "helmet", ctx)).toBeNull();
    expect(interp.evaluateDataNode(node, "boots", ctx)).toBeNull();
  });

  it("accessors honor entityId data field over self", () => {
    const world: ScriptingWorldInterface = {
      emit: vi.fn(),
      getEntityById: vi.fn((id: string) => {
        if (id === "other") {
          return { data: { health: 77, maxHealth: 100 } };
        }
        if (id === "self") {
          return { data: { health: 10, maxHealth: 100 } };
        }
        return null;
      }),
      getTime: vi.fn().mockReturnValue(0),
    };
    const node = makeNode("h1", "data/getPlayerHealth", { playerId: "other" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx: ExecutionContext = {
      triggerData: {},
      variables: new Map(),
      entityId: "self",
      world,
    };

    expect(interp.evaluateDataNode(node, "current", ctx)).toBe(77);
  });

  it("accessors return 0/null when entity cannot be resolved", () => {
    const world: ScriptingWorldInterface = {
      emit: vi.fn(),
      getEntityById: vi.fn().mockReturnValue(null),
      getTime: vi.fn().mockReturnValue(0),
    };
    const node = makeNode("h1", "data/getPlayerHealth");
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx: ExecutionContext = {
      triggerData: {},
      variables: new Map(),
      entityId: "missing",
      world,
    };

    expect(interp.evaluateDataNode(node, "current", ctx)).toBe(0);
    expect(interp.evaluateDataNode(node, "max", ctx)).toBe(0);
    expect(interp.evaluateDataNode(node, "percent", ctx)).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 11. Vector math nodes (Phase 3.1)
// ---------------------------------------------------------------------------

describe("Vector math nodes", () => {
  it("math/vectorAdd component-wise", () => {
    const node = makeNode("v1", "math/vectorAdd", {
      a: { x: 1, y: 2, z: 3 },
      b: { x: 4, y: 5, z: 6 },
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    const result = interp.evaluateDataNode(node, "result", makeCtx());
    expect(result).toEqual({ x: 5, y: 7, z: 9 });
  });

  it("math/vectorSubtract component-wise", () => {
    const node = makeNode("v1", "math/vectorSubtract", {
      a: { x: 10, y: 10, z: 10 },
      b: { x: 1, y: 2, z: 3 },
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    const result = interp.evaluateDataNode(node, "result", makeCtx());
    expect(result).toEqual({ x: 9, y: 8, z: 7 });
  });

  it("math/vectorScale by scalar", () => {
    const node = makeNode("v1", "math/vectorScale", {
      a: { x: 1, y: 2, z: 3 },
      scalar: 2,
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    const result = interp.evaluateDataNode(node, "result", makeCtx());
    expect(result).toEqual({ x: 2, y: 4, z: 6 });
  });

  it("math/vectorNormalize produces unit vector", () => {
    const node = makeNode("v1", "math/vectorNormalize", {
      a: { x: 3, y: 0, z: 4 },
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    const result = interp.evaluateDataNode(node, "result", makeCtx()) as {
      x: number;
      y: number;
      z: number;
    };
    expect(result.x).toBeCloseTo(0.6);
    expect(result.y).toBeCloseTo(0);
    expect(result.z).toBeCloseTo(0.8);
    const len = Math.sqrt(
      result.x * result.x + result.y * result.y + result.z * result.z,
    );
    expect(len).toBeCloseTo(1);
  });

  it("math/vectorNormalize returns zero for zero vector", () => {
    const node = makeNode("v1", "math/vectorNormalize", {
      a: { x: 0, y: 0, z: 0 },
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(node, "result", makeCtx())).toEqual({
      x: 0,
      y: 0,
      z: 0,
    });
  });

  it("math/vectorDot computes scalar product", () => {
    const node = makeNode("v1", "math/vectorDot", {
      a: { x: 1, y: 2, z: 3 },
      b: { x: 4, y: 5, z: 6 },
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    // 1*4 + 2*5 + 3*6 = 32
    expect(interp.evaluateDataNode(node, "result", makeCtx())).toBe(32);
  });

  it("math/vectorCross computes perpendicular vector", () => {
    const node = makeNode("v1", "math/vectorCross", {
      a: { x: 1, y: 0, z: 0 },
      b: { x: 0, y: 1, z: 0 },
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    // x̂ × ŷ = ẑ
    expect(interp.evaluateDataNode(node, "result", makeCtx())).toEqual({
      x: 0,
      y: 0,
      z: 1,
    });
  });

  it("math/vectorLength computes magnitude", () => {
    const node = makeNode("v1", "math/vectorLength", {
      a: { x: 3, y: 4, z: 0 },
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(node, "result", makeCtx())).toBeCloseTo(5);
  });

  it("math/vectorLerp interpolates at alpha=0.5", () => {
    const node = makeNode("v1", "math/vectorLerp", {
      a: { x: 0, y: 0, z: 0 },
      b: { x: 10, y: 10, z: 10 },
      alpha: 0.5,
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(node, "result", makeCtx())).toEqual({
      x: 5,
      y: 5,
      z: 5,
    });
  });

  it("math/vectorLerp clamps alpha to [0, 1]", () => {
    const node = makeNode("v1", "math/vectorLerp", {
      a: { x: 0, y: 0, z: 0 },
      b: { x: 10, y: 10, z: 10 },
      alpha: 2.0,
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    // alpha clamped to 1 → returns b
    expect(interp.evaluateDataNode(node, "result", makeCtx())).toEqual({
      x: 10,
      y: 10,
      z: 10,
    });
  });

  it("vector ops accept array-form [x,y,z] inputs", () => {
    const node = makeNode("v1", "math/vectorAdd", {
      a: [1, 2, 3],
      b: [10, 20, 30],
    });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(node, "result", makeCtx())).toEqual({
      x: 11,
      y: 22,
      z: 33,
    });
  });

  it("vector ops chain through readDataInput when connected", () => {
    const mk = makeNode("mk1", "data/makeVector3", { x: 2, y: 3, z: 4 });
    const scale = makeNode("sc1", "math/vectorScale", { scalar: 5 });
    const edge = makeEdge("mk1", "vector", "sc1", "a");
    const graph = makeGraph([mk, scale], [edge]);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(scale, "result", makeCtx())).toEqual({
      x: 10,
      y: 15,
      z: 20,
    });
  });
});

// ---------------------------------------------------------------------------
// 12. Array / collection nodes (Phase 3.2)
// ---------------------------------------------------------------------------

describe("Array / collection nodes", () => {
  // Helper: build a graph where a constant array feeds another node's `array` input.
  function withArrayInput(
    arr: unknown[],
    consumer: RuntimeScriptNode,
  ): { graph: RuntimeScriptGraph; consumer: RuntimeScriptNode } {
    const source = makeNode("src", "data/constant", { value: arr });
    const edge = makeEdge("src", "value", consumer.id, "array");
    const graph = makeGraph([source, consumer], [edge]);
    return { graph, consumer };
  }

  it("data/arrayLength returns length", () => {
    const consumer = makeNode("a1", "data/arrayLength");
    const { graph, consumer: c } = withArrayInput([1, 2, 3, 4], consumer);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(c, "result", makeCtx())).toBe(4);
  });

  it("data/arrayLength returns 0 for non-array", () => {
    const consumer = makeNode("a1", "data/arrayLength");
    const graph = makeGraph([consumer], []);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(consumer, "result", makeCtx())).toBe(0);
  });

  it("data/arrayContains detects presence", () => {
    const consumer = makeNode("a1", "data/arrayContains", { value: "foo" });
    const { graph, consumer: c } = withArrayInput(
      ["bar", "foo", "baz"],
      consumer,
    );
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(c, "result", makeCtx())).toBe(true);
  });

  it("data/arrayContains returns false when missing", () => {
    const consumer = makeNode("a1", "data/arrayContains", { value: 99 });
    const { graph, consumer: c } = withArrayInput([1, 2, 3], consumer);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(c, "result", makeCtx())).toBe(false);
  });

  it("data/arrayAdd appends without mutating", () => {
    const original = [1, 2, 3];
    const consumer = makeNode("a1", "data/arrayAdd", { value: 4 });
    const { graph, consumer: c } = withArrayInput(original, consumer);
    const interp = new ScriptGraphInterpreter(graph);

    const out = interp.evaluateDataNode(c, "result", makeCtx()) as number[];
    expect(out).toEqual([1, 2, 3, 4]);
    expect(original).toEqual([1, 2, 3]); // unchanged
  });

  it("data/arrayRemove removes first occurrence only", () => {
    const consumer = makeNode("a1", "data/arrayRemove", { value: 2 });
    const { graph, consumer: c } = withArrayInput([1, 2, 3, 2, 4], consumer);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(c, "result", makeCtx())).toEqual([
      1, 3, 2, 4,
    ]);
  });

  it("data/arrayGetAt returns element at index", () => {
    const consumer = makeNode("a1", "data/arrayGetAt", { index: 1 });
    const { graph, consumer: c } = withArrayInput(["a", "b", "c"], consumer);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(c, "result", makeCtx())).toBe("b");
  });

  it("data/arrayGetAt returns null for out-of-bounds", () => {
    const consumer = makeNode("a1", "data/arrayGetAt", { index: 99 });
    const { graph, consumer: c } = withArrayInput(["a"], consumer);
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(c, "result", makeCtx())).toBeNull();
  });

  it("data/arraySlice returns sub-array", () => {
    const consumer = makeNode("a1", "data/arraySlice", { start: 1, end: 4 });
    const { graph, consumer: c } = withArrayInput(
      [10, 20, 30, 40, 50],
      consumer,
    );
    const interp = new ScriptGraphInterpreter(graph);

    expect(interp.evaluateDataNode(c, "result", makeCtx())).toEqual([
      20, 30, 40,
    ]);
  });
});

// ---------------------------------------------------------------------------
// 13. Typed casts / boolean coercion (Phase 3.5)
// ---------------------------------------------------------------------------

describe("Typed casts", () => {
  function makeCastCtx(entities: Record<string, unknown>): ExecutionContext {
    const world: ScriptingWorldInterface = {
      emit: vi.fn(),
      getEntityById: vi.fn((id: string) => {
        const e = entities[id];
        return (e as Record<string, unknown>) ?? null;
      }),
      getTime: vi.fn().mockReturnValue(0),
    };
    return {
      triggerData: {},
      variables: new Map(),
      entityId: "self",
      world,
    };
  }

  it("data/castToPlayer returns id when entity is a player", () => {
    const node = makeNode("c1", "data/castToPlayer", { entityId: "p1" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCastCtx({ p1: { type: "player" } });

    expect(interp.evaluateDataNode(node, "result", ctx)).toBe("p1");
    expect(interp.evaluateDataNode(node, "isValid", ctx)).toBe(true);
  });

  it("data/castToPlayer returns null when entity is a mob", () => {
    const node = makeNode("c1", "data/castToPlayer", { entityId: "m1" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCastCtx({ m1: { type: "mob" } });

    expect(interp.evaluateDataNode(node, "result", ctx)).toBeNull();
    expect(interp.evaluateDataNode(node, "isValid", ctx)).toBe(false);
  });

  it("data/castToMob accepts entity type with mob prefix", () => {
    const node = makeNode("c1", "data/castToMob", { entityId: "m1" });
    const graph = makeGraph([node], []);
    const interp = new ScriptGraphInterpreter(graph);
    const ctx = makeCastCtx({ m1: { type: "Mob" } });

    expect(interp.evaluateDataNode(node, "isValid", ctx)).toBe(true);
  });

  it("data/toBoolean coerces numbers and strings", () => {
    const mk = (value: unknown) =>
      makeNode("b1", "data/toBoolean", { input: value });
    const interp = new ScriptGraphInterpreter(makeGraph([mk(0)], []));

    expect(interp.evaluateDataNode(mk(0), "result", makeCtx())).toBe(false);
    expect(interp.evaluateDataNode(mk(1), "result", makeCtx())).toBe(true);
    expect(interp.evaluateDataNode(mk(""), "result", makeCtx())).toBe(false);
    expect(interp.evaluateDataNode(mk("hi"), "result", makeCtx())).toBe(true);
    expect(interp.evaluateDataNode(mk("false"), "result", makeCtx())).toBe(
      false,
    );
    expect(interp.evaluateDataNode(mk("true"), "result", makeCtx())).toBe(true);
    expect(interp.evaluateDataNode(mk(null), "result", makeCtx())).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 14. Flow loops — forLoop / whileLoop (Phase 3.5)
// ---------------------------------------------------------------------------

describe("Flow loops (forLoop / whileLoop)", () => {
  it("flow/forLoop runs body once per step in [start, end)", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("fl", "flow/forLoop", {
      start: 0,
      end: 3,
      step: 1,
      indexVariable: "i",
    });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const done = makeNode("d", "action/log", { _tag: "done" });
    const edges = [
      makeEdge("t1", "flow_out", "fl", "flow_in"),
      makeEdge("fl", "body", "b", "flow_in"),
      makeEdge("fl", "completed", "d", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body, done], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const tags: string[] = [];
    const indices: number[] = [];
    interp.registerAction("action/log", (data, ctx) => {
      const tag = (data._tag as string | undefined) ?? "";
      tags.push(tag);
      if (tag === "body") {
        indices.push(ctx.variables.get("i") as number);
      }
    });

    await interp.execute("t1", makeCtx());

    expect(tags).toEqual(["body", "body", "body", "done"]);
    expect(indices).toEqual([0, 1, 2]);
  });

  it("flow/forLoop handles negative step", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("fl", "flow/forLoop", {
      start: 3,
      end: 0,
      step: -1,
      indexVariable: "i",
    });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const edges = [
      makeEdge("t1", "flow_out", "fl", "flow_in"),
      makeEdge("fl", "body", "b", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const indices: number[] = [];
    interp.registerAction("action/log", (_d, ctx) => {
      indices.push(ctx.variables.get("i") as number);
    });

    await interp.execute("t1", makeCtx());
    expect(indices).toEqual([3, 2, 1]);
  });

  it("flow/forLoop runs zero iterations when start == end", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("fl", "flow/forLoop", {
      start: 5,
      end: 5,
      step: 1,
      indexVariable: "i",
    });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const done = makeNode("d", "action/log", { _tag: "done" });
    const edges = [
      makeEdge("t1", "flow_out", "fl", "flow_in"),
      makeEdge("fl", "body", "b", "flow_in"),
      makeEdge("fl", "completed", "d", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body, done], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const tags: string[] = [];
    interp.registerAction("action/log", (data) => {
      tags.push((data._tag as string) ?? "");
    });

    await interp.execute("t1", makeCtx());
    expect(tags).toEqual(["done"]);
  });

  it("flow/forLoop emits scripting:limit_hit on step=0 and skips body", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("fl", "flow/forLoop", {
      start: 0,
      end: 5,
      step: 0,
      indexVariable: "i",
    });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const done = makeNode("d", "action/log", { _tag: "done" });
    const edges = [
      makeEdge("t1", "flow_out", "fl", "flow_in"),
      makeEdge("fl", "body", "b", "flow_in"),
      makeEdge("fl", "completed", "d", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body, done], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const tags: string[] = [];
    interp.registerAction("action/log", (data) => {
      tags.push((data._tag as string) ?? "");
    });
    const ctx = makeCtx();
    await interp.execute("t1", ctx);

    expect(tags).toEqual(["done"]);
    expect(ctx.world.emit).toHaveBeenCalledWith(
      "scripting:limit_hit",
      expect.objectContaining({ limit: "FOR_LOOP_ZERO_STEP" }),
    );
  });

  it("flow/forLoop caps at MAX_LOOP_ITERATIONS (10000) and emits limit_hit", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("fl", "flow/forLoop", {
      start: 0,
      end: 50000,
      step: 1,
      indexVariable: "i",
    });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const done = makeNode("d", "action/log", { _tag: "done" });
    const edges = [
      makeEdge("t1", "flow_out", "fl", "flow_in"),
      makeEdge("fl", "body", "b", "flow_in"),
      makeEdge("fl", "completed", "d", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body, done], edges);

    const interp = new ScriptGraphInterpreter(graph);
    let bodyCount = 0;
    interp.registerAction("action/log", (data) => {
      if ((data._tag as string) === "body") bodyCount++;
    });
    const ctx = makeCtx();
    await interp.execute("t1", ctx);

    expect(bodyCount).toBe(10000);
    expect(ctx.world.emit).toHaveBeenCalledWith(
      "scripting:limit_hit",
      expect.objectContaining({ limit: "MAX_LOOP_ITERATIONS" }),
    );
  });

  it("flow/whileLoop runs while condition is truthy; stops when body flips it", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("wl", "flow/whileLoop", { condition: true });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const done = makeNode("d", "action/log", { _tag: "done" });
    const edges = [
      makeEdge("t1", "flow_out", "wl", "flow_in"),
      makeEdge("wl", "body", "b", "flow_in"),
      makeEdge("wl", "completed", "d", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body, done], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const tags: string[] = [];
    let ticks = 0;
    interp.registerAction("action/log", (data) => {
      const tag = (data._tag as string) ?? "";
      tags.push(tag);
      if (tag === "body") {
        ticks++;
        if (ticks >= 3) {
          loop.data.condition = false;
        }
      }
    });

    await interp.execute("t1", makeCtx());
    expect(tags).toEqual(["body", "body", "body", "done"]);
  });

  it("flow/whileLoop does not run body when condition starts false", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("wl", "flow/whileLoop", { condition: false });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const done = makeNode("d", "action/log", { _tag: "done" });
    const edges = [
      makeEdge("t1", "flow_out", "wl", "flow_in"),
      makeEdge("wl", "body", "b", "flow_in"),
      makeEdge("wl", "completed", "d", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body, done], edges);

    const interp = new ScriptGraphInterpreter(graph);
    const tags: string[] = [];
    interp.registerAction("action/log", (data) => {
      tags.push((data._tag as string) ?? "");
    });

    await interp.execute("t1", makeCtx());
    expect(tags).toEqual(["done"]);
  });

  it("flow/whileLoop caps at MAX_LOOP_ITERATIONS and emits limit_hit", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const loop = makeNode("wl", "flow/whileLoop", { condition: true });
    const body = makeNode("b", "action/log", { _tag: "body" });
    const done = makeNode("d", "action/log", { _tag: "done" });
    const edges = [
      makeEdge("t1", "flow_out", "wl", "flow_in"),
      makeEdge("wl", "body", "b", "flow_in"),
      makeEdge("wl", "completed", "d", "flow_in"),
    ];
    const graph = makeGraph([trigger, loop, body, done], edges);

    const interp = new ScriptGraphInterpreter(graph);
    let bodyCount = 0;
    interp.registerAction("action/log", (data) => {
      if ((data._tag as string) === "body") bodyCount++;
    });
    const ctx = makeCtx();
    await interp.execute("t1", ctx);

    expect(bodyCount).toBe(10000);
    expect(ctx.world.emit).toHaveBeenCalledWith(
      "scripting:limit_hit",
      expect.objectContaining({ limit: "MAX_LOOP_ITERATIONS" }),
    );
  });
});

// ---------------------------------------------------------------------------
// 15. flow/callGraph — sub-graph / function dispatch (Phase 2.2)
// ---------------------------------------------------------------------------

function makeFunctionGraph(
  nodes: RuntimeScriptNode[],
  edges: RuntimeScriptEdge[],
  variables: RuntimeScriptVariable[] = [],
): RuntimeScriptGraph {
  return {
    id: uid(),
    name: "fn-graph",
    graphType: "function",
    nodes,
    edges,
    variables,
  };
}

describe("flow/callGraph (sub-graph dispatch)", () => {
  it("no-ops when ctx.graphRegistry is absent", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const call = makeNode("c1", "flow/callGraph", { graphId: "fnA" });
    const after = makeNode("a1", "action/log", { _tag: "after" });
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "completed", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, call, after], edges);
    const interp = new ScriptGraphInterpreter(graph);
    let afterCalled = 0;
    interp.registerAction("action/log", () => {
      afterCalled++;
    });
    const ctx = makeCtx();
    await interp.execute("t1", ctx);
    // No registry → callGraph is a no-op, but Completed still fires.
    expect(afterCalled).toBe(1);
    expect(ctx.world.emit).not.toHaveBeenCalledWith(
      "scripting:limit_hit",
      expect.anything(),
    );
  });

  it("no-ops when the referenced graph id is missing from the registry", async () => {
    const trigger = makeNode("t1", "trigger/onSpawn");
    const call = makeNode("c1", "flow/callGraph", { graphId: "fnMissing" });
    const after = makeNode("a1", "action/log", { _tag: "after" });
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "completed", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, call, after], edges);
    const interp = new ScriptGraphInterpreter(graph);
    let afterCalled = 0;
    interp.registerAction("action/log", () => {
      afterCalled++;
    });
    const registry: GraphRegistry = {
      getFunctionInterpreter: () => null,
    };
    const ctx = makeCtx({ graphRegistry: registry });
    await interp.execute("t1", ctx);
    expect(afterCalled).toBe(1);
  });

  it("invokes the sub-graph and copies return variables back to caller", async () => {
    // --- Function graph: entry → action/log → sets a variable ---
    const fnEntry = makeNode("fe", "trigger/onFunctionCall");
    const fnSet = makeNode("fs", "variable/set", {
      name: "result",
      value: 0, // static; overwritten by the action below
    });
    // Use an action handler to write a known value into ctx.variables
    // (simulates a sub-graph computation producing a return).
    const fnWriter = makeNode("fw", "action/writeResult");
    const fnEdges = [
      makeEdge("fe", "flow_out", "fs", "flow_in"),
      makeEdge("fs", "flow_out", "fw", "flow_in"),
    ];
    const fnGraph = makeFunctionGraph([fnEntry, fnSet, fnWriter], fnEdges);
    const fnInterp = new ScriptGraphInterpreter(fnGraph);
    fnInterp.registerAction("action/writeResult", (_data, subCtx) => {
      // Echo the seeded `input` arg plus 10 back to a `result` variable.
      const input = (subCtx.variables.get("input") as number) ?? 0;
      subCtx.variables.set("result", input + 10);
    });

    // --- Caller graph: trigger → callGraph → assert ---
    const trigger = makeNode("t1", "trigger/onSpawn");
    const call = makeNode("c1", "flow/callGraph", {
      graphId: "fnA",
      arguments: { input: 5 },
      returnVariables: ["result"],
    });
    const after = makeNode("a1", "action/check");
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "completed", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, call, after], edges);
    const interp = new ScriptGraphInterpreter(graph);

    let observedResult: unknown = undefined;
    interp.registerAction("action/check", (_data, ctx) => {
      observedResult = ctx.variables.get("result");
    });

    const registry: GraphRegistry = {
      getFunctionInterpreter: (id) => (id === "fnA" ? fnInterp : null),
    };
    const ctx = makeCtx({ graphRegistry: registry });
    await interp.execute("t1", ctx);

    // 5 (arg) + 10 (sub-graph) = 15, copied back via returnVariables.
    expect(observedResult).toBe(15);
  });

  it("connected data input overrides a static argument of the same key", async () => {
    const fnEntry = makeNode("fe", "trigger/onFunctionCall");
    const fnWriter = makeNode("fw", "action/writeResult");
    const fnEdges = [makeEdge("fe", "flow_out", "fw", "flow_in")];
    const fnGraph = makeFunctionGraph([fnEntry, fnWriter], fnEdges);
    const fnInterp = new ScriptGraphInterpreter(fnGraph);
    fnInterp.registerAction("action/writeResult", (_data, subCtx) => {
      subCtx.variables.set("result", subCtx.variables.get("input"));
    });

    const trigger = makeNode("t1", "trigger/onSpawn");
    // Provide a data constant on port `input` wired into the callGraph node.
    const constNode = makeNode("k", "data/constant", { value: 42 });
    const call = makeNode("c1", "flow/callGraph", {
      graphId: "fnA",
      arguments: { input: 1 }, // static default (should be overridden)
      returnVariables: ["result"],
    });
    const after = makeNode("a1", "action/check");
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "completed", "a1", "flow_in"),
      makeEdge("k", "value", "c1", "input"), // connected data input
    ];
    const graph = makeGraph([trigger, constNode, call, after], edges);
    const interp = new ScriptGraphInterpreter(graph);

    let observedResult: unknown = undefined;
    interp.registerAction("action/check", (_data, ctx) => {
      observedResult = ctx.variables.get("result");
    });

    const registry: GraphRegistry = {
      getFunctionInterpreter: (id) => (id === "fnA" ? fnInterp : null),
    };
    const ctx = makeCtx({ graphRegistry: registry });
    await interp.execute("t1", ctx);

    expect(observedResult).toBe(42);
  });

  it("enforces MAX_CALL_DEPTH (32) and emits scripting:limit_hit", async () => {
    // Build a recursive function that calls itself forever.
    const fnEntry = makeNode("fe", "trigger/onFunctionCall");
    const fnRecurse = makeNode("fr", "flow/callGraph", { graphId: "fnRec" });
    const fnEdges = [makeEdge("fe", "flow_out", "fr", "flow_in")];
    const fnGraph = makeFunctionGraph([fnEntry, fnRecurse], fnEdges);
    const fnInterp = new ScriptGraphInterpreter(fnGraph);

    const trigger = makeNode("t1", "trigger/onSpawn");
    const call = makeNode("c1", "flow/callGraph", { graphId: "fnRec" });
    const edges = [makeEdge("t1", "flow_out", "c1", "flow_in")];
    const graph = makeGraph([trigger, call], edges);
    const interp = new ScriptGraphInterpreter(graph);

    const registry: GraphRegistry = {
      getFunctionInterpreter: (id) => (id === "fnRec" ? fnInterp : null),
    };
    const ctx = makeCtx({ graphRegistry: registry });
    await interp.execute("t1", ctx);

    expect(ctx.world.emit).toHaveBeenCalledWith(
      "scripting:limit_hit",
      expect.objectContaining({ limit: "MAX_CALL_DEPTH", value: 32 }),
    );
  });

  it("return variables not listed in returnVariables are NOT copied back", async () => {
    const fnEntry = makeNode("fe", "trigger/onFunctionCall");
    const fnWriter = makeNode("fw", "action/writeBoth");
    const fnEdges = [makeEdge("fe", "flow_out", "fw", "flow_in")];
    const fnGraph = makeFunctionGraph([fnEntry, fnWriter], fnEdges);
    const fnInterp = new ScriptGraphInterpreter(fnGraph);
    fnInterp.registerAction("action/writeBoth", (_data, subCtx) => {
      subCtx.variables.set("keep", "yes");
      subCtx.variables.set("drop", "should-not-leak");
    });

    const trigger = makeNode("t1", "trigger/onSpawn");
    const call = makeNode("c1", "flow/callGraph", {
      graphId: "fnA",
      returnVariables: ["keep"],
    });
    const after = makeNode("a1", "action/check");
    const edges = [
      makeEdge("t1", "flow_out", "c1", "flow_in"),
      makeEdge("c1", "completed", "a1", "flow_in"),
    ];
    const graph = makeGraph([trigger, call, after], edges);
    const interp = new ScriptGraphInterpreter(graph);

    let keepVal: unknown = undefined;
    let dropVal: unknown = undefined;
    interp.registerAction("action/check", (_data, ctx) => {
      keepVal = ctx.variables.get("keep");
      dropVal = ctx.variables.get("drop");
    });

    const registry: GraphRegistry = {
      getFunctionInterpreter: (id) => (id === "fnA" ? fnInterp : null),
    };
    const ctx = makeCtx({ graphRegistry: registry });
    await interp.execute("t1", ctx);

    expect(keepVal).toBe("yes");
    expect(dropVal).toBeUndefined();
  });
});
