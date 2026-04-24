import { BehaviorTreeSchema } from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  BehaviorTreeInterpreter,
  type BehaviorContext,
} from "../BehaviorTreeInterpreter.js";

/**
 * Helper: build a `BehaviorContext` with a fake clock + empty blackboard,
 * and user-supplied service/condition maps. Keeps tests terse.
 */
function makeContext(
  opts: Partial<BehaviorContext> & { now?: number } = {},
): BehaviorContext {
  let clock = opts.now ?? 0;
  return {
    services: opts.services ?? {},
    conditions: opts.conditions ?? {},
    blackboard: opts.blackboard ?? {},
    nowSec: () => clock,
    // Expose the clock via a blackboard hack so tests can advance it.
    // (Not part of the public API — just a test convenience.)
    ...{
      __advance: (sec: number) => {
        clock += sec;
      },
    },
  } as unknown as BehaviorContext;
}

function advance(ctx: BehaviorContext, sec: number): void {
  (ctx as unknown as { __advance: (s: number) => void }).__advance(sec);
}

describe("BehaviorTreeInterpreter — leaves", () => {
  it("calls an action and returns its status", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "a",
      nodes: {
        a: { id: "a", kind: "action", action: "attack", params: {} },
      },
    });
    let called = false;
    const ctx = makeContext({
      services: {
        attack: () => {
          called = true;
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("success");
    expect(called).toBe(true);
  });

  it("awaits async actions", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "a",
      nodes: {
        a: { id: "a", kind: "action", action: "slow", params: {} },
      },
    });
    const ctx = makeContext({
      services: {
        slow: async () => {
          await new Promise((r) => setTimeout(r, 1));
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("success");
  });

  it("returns failure for unknown action names", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "a",
      nodes: {
        a: { id: "a", kind: "action", action: "missing", params: {} },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(makeContext())).toBe("failure");
  });

  it("evaluates a condition to success/failure", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "c",
      nodes: {
        c: { id: "c", kind: "condition", condition: "inCombat", params: {} },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(
      await bt.tick(makeContext({ conditions: { inCombat: () => true } })),
    ).toBe("success");
    expect(
      await bt.tick(makeContext({ conditions: { inCombat: () => false } })),
    ).toBe("failure");
  });
});

describe("BehaviorTreeInterpreter — composites", () => {
  it("sequence returns success only if all children succeed", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "seq",
      nodes: {
        seq: { id: "seq", kind: "sequence", children: ["a", "b"] },
        a: { id: "a", kind: "action", action: "ok", params: {} },
        b: { id: "b", kind: "action", action: "ok", params: {} },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(
      await bt.tick(makeContext({ services: { ok: () => "success" } })),
    ).toBe("success");
  });

  it("sequence short-circuits on first failure", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "seq",
      nodes: {
        seq: { id: "seq", kind: "sequence", children: ["a", "b"] },
        a: { id: "a", kind: "action", action: "fail", params: {} },
        b: { id: "b", kind: "action", action: "tracker", params: {} },
      },
    });
    let bCalled = false;
    const ctx = makeContext({
      services: {
        fail: () => "failure",
        tracker: () => {
          bCalled = true;
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("failure");
    expect(bCalled).toBe(false);
  });

  it("selector returns first non-failure", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "sel",
      nodes: {
        sel: { id: "sel", kind: "selector", children: ["a", "b", "c"] },
        a: { id: "a", kind: "action", action: "fail", params: {} },
        b: { id: "b", kind: "action", action: "run", params: {} },
        c: { id: "c", kind: "action", action: "tracker", params: {} },
      },
    });
    let cCalled = false;
    const ctx = makeContext({
      services: {
        fail: () => "failure",
        run: () => "running",
        tracker: () => {
          cCalled = true;
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("running");
    expect(cCalled).toBe(false);
  });

  it("parallel reports failure if any child fails", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "par",
      nodes: {
        par: { id: "par", kind: "parallel", children: ["a", "b"] },
        a: { id: "a", kind: "action", action: "ok", params: {} },
        b: { id: "b", kind: "action", action: "fail", params: {} },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(
      await bt.tick(
        makeContext({
          services: { ok: () => "success", fail: () => "failure" },
        }),
      ),
    ).toBe("failure");
  });

  it("parallel reports running if any running + no failure", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "par",
      nodes: {
        par: { id: "par", kind: "parallel", children: ["a", "b"] },
        a: { id: "a", kind: "action", action: "ok", params: {} },
        b: { id: "b", kind: "action", action: "run", params: {} },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(
      await bt.tick(
        makeContext({
          services: { ok: () => "success", run: () => "running" },
        }),
      ),
    ).toBe("running");
  });
});

describe("BehaviorTreeInterpreter — decorators", () => {
  it("inverter swaps success↔failure and passes running through", async () => {
    const mkTree = (action: string) =>
      BehaviorTreeSchema.parse({
        id: "t",
        name: "t",
        root: "inv",
        nodes: {
          inv: { id: "inv", kind: "inverter", child: "a", params: {} },
          a: { id: "a", kind: "action", action, params: {} },
        },
      });
    const ctx = makeContext({
      services: {
        ok: () => "success",
        bad: () => "failure",
        run: () => "running",
      },
    });
    expect(await new BehaviorTreeInterpreter(mkTree("ok")).tick(ctx)).toBe(
      "failure",
    );
    expect(await new BehaviorTreeInterpreter(mkTree("bad")).tick(ctx)).toBe(
      "success",
    );
    expect(await new BehaviorTreeInterpreter(mkTree("run")).tick(ctx)).toBe(
      "running",
    );
  });

  it("succeed decorator forces success regardless of child outcome", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "s",
      nodes: {
        s: { id: "s", kind: "succeed", child: "a", params: {} },
        a: { id: "a", kind: "action", action: "fail", params: {} },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(
      await bt.tick(makeContext({ services: { fail: () => "failure" } })),
    ).toBe("success");
  });

  it("fail decorator forces failure regardless of child outcome", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "f",
      nodes: {
        f: { id: "f", kind: "fail", child: "a", params: {} },
        a: { id: "a", kind: "action", action: "ok", params: {} },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(
      await bt.tick(makeContext({ services: { ok: () => "success" } })),
    ).toBe("failure");
  });

  it("repeater with maxIterations=3 runs the child exactly 3 times", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "rep",
      nodes: {
        rep: {
          id: "rep",
          kind: "repeater",
          child: "a",
          params: { maxIterations: 3 },
        },
        a: { id: "a", kind: "action", action: "inc", params: {} },
      },
    });
    let count = 0;
    const ctx = makeContext({
      services: {
        inc: () => {
          count += 1;
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("success");
    expect(count).toBe(3);
  });

  it("repeater returns running when child returns running", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "rep",
      nodes: {
        rep: {
          id: "rep",
          kind: "repeater",
          child: "a",
          params: { maxIterations: 5 },
        },
        a: { id: "a", kind: "action", action: "run", params: {} },
      },
    });
    const ctx = makeContext({ services: { run: () => "running" } });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("running");
  });

  it("cooldown gates re-entry until `seconds` elapse", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "cd",
      nodes: {
        cd: {
          id: "cd",
          kind: "cooldown",
          child: "a",
          params: { seconds: 5 },
        },
        a: { id: "a", kind: "action", action: "fire", params: {} },
      },
    });
    let fires = 0;
    const ctx = makeContext({
      services: {
        fire: () => {
          fires += 1;
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("success");
    expect(fires).toBe(1);
    // Second tick immediately — still cooling down.
    expect(await bt.tick(ctx)).toBe("failure");
    expect(fires).toBe(1);
    // Advance past cooldown.
    advance(ctx, 6);
    expect(await bt.tick(ctx)).toBe("success");
    expect(fires).toBe(2);
  });
});

describe("BehaviorTreeInterpreter — safety", () => {
  it("caps visits per tick to prevent runaway loops", async () => {
    // Repeater with infinite iterations + always-success child → would
    // loop forever if not for the visit budget.
    const tree = BehaviorTreeSchema.parse({
      id: "t",
      name: "t",
      root: "rep",
      nodes: {
        rep: {
          id: "rep",
          kind: "repeater",
          child: "a",
          params: { maxIterations: 0 }, // 0 = infinite
        },
        a: { id: "a", kind: "action", action: "ok", params: {} },
      },
    });
    const ctx = makeContext({ services: { ok: () => "success" } });
    const bt = new BehaviorTreeInterpreter(tree, { maxVisitsPerTick: 50 });
    // Returns failure when budget runs out — does not hang.
    expect(await bt.tick(ctx)).toBe("failure");
  });
});

describe("BehaviorTreeInterpreter — realistic AgentBehaviorTicker pattern", () => {
  /**
   * Encodes the core decision tree from `AgentBehaviorTicker.pickBehaviorAction`
   * as a BT:
   *
   *   selector
   *     ├── sequence(inCombat, attackCurrentTarget)
   *     ├── sequence(healthLow, eatFood)
   *     └── sequence(nearbyMobsExist, pickMobAndAttack)
   */
  it("executes attack branch when already in combat", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "agent",
      name: "agent",
      tickIntervalSeconds: 8,
      root: "root",
      nodes: {
        root: {
          id: "root",
          kind: "selector",
          children: ["combatBranch", "healBranch", "engageBranch"],
        },
        combatBranch: {
          id: "combatBranch",
          kind: "sequence",
          children: ["inCombat", "attackCurrent"],
        },
        healBranch: {
          id: "healBranch",
          kind: "sequence",
          children: ["healthLow", "eat"],
        },
        engageBranch: {
          id: "engageBranch",
          kind: "sequence",
          children: ["mobsNearby", "engage"],
        },
        inCombat: {
          id: "inCombat",
          kind: "condition",
          condition: "inCombat",
          params: {},
        },
        healthLow: {
          id: "healthLow",
          kind: "condition",
          condition: "healthBelow",
          params: { threshold: 0.5 },
        },
        mobsNearby: {
          id: "mobsNearby",
          kind: "condition",
          condition: "mobsNearby",
          params: {},
        },
        attackCurrent: {
          id: "attackCurrent",
          kind: "action",
          action: "attackCurrent",
          params: {},
        },
        eat: { id: "eat", kind: "action", action: "eat", params: {} },
        engage: {
          id: "engage",
          kind: "action",
          action: "engage",
          params: {},
        },
      },
    });
    let attackCalled = false;
    let eatCalled = false;
    let engageCalled = false;
    const ctx = makeContext({
      conditions: {
        inCombat: () => true,
        healthBelow: () => true,
        mobsNearby: () => true,
      },
      services: {
        attackCurrent: () => {
          attackCalled = true;
          return "success";
        },
        eat: () => {
          eatCalled = true;
          return "success";
        },
        engage: () => {
          engageCalled = true;
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("success");
    expect(attackCalled).toBe(true);
    expect(eatCalled).toBe(false);
    expect(engageCalled).toBe(false);
  });

  it("falls through to heal branch when not in combat but hurt", async () => {
    const tree = BehaviorTreeSchema.parse({
      id: "agent",
      name: "agent",
      root: "root",
      nodes: {
        root: {
          id: "root",
          kind: "selector",
          children: ["combatBranch", "healBranch"],
        },
        combatBranch: {
          id: "combatBranch",
          kind: "sequence",
          children: ["inCombat", "attackCurrent"],
        },
        healBranch: {
          id: "healBranch",
          kind: "sequence",
          children: ["healthLow", "eat"],
        },
        inCombat: {
          id: "inCombat",
          kind: "condition",
          condition: "inCombat",
          params: {},
        },
        healthLow: {
          id: "healthLow",
          kind: "condition",
          condition: "healthBelow",
          params: {},
        },
        attackCurrent: {
          id: "attackCurrent",
          kind: "action",
          action: "attackCurrent",
          params: {},
        },
        eat: { id: "eat", kind: "action", action: "eat", params: {} },
      },
    });
    let attackCalled = false;
    let eatCalled = false;
    const ctx = makeContext({
      conditions: {
        inCombat: () => false,
        healthBelow: () => true,
      },
      services: {
        attackCurrent: () => {
          attackCalled = true;
          return "success";
        },
        eat: () => {
          eatCalled = true;
          return "success";
        },
      },
    });
    const bt = new BehaviorTreeInterpreter(tree);
    expect(await bt.tick(ctx)).toBe("success");
    expect(attackCalled).toBe(false);
    expect(eatCalled).toBe(true);
  });
});
