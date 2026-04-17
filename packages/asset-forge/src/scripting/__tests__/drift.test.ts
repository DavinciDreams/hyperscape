/**
 * Editor ↔ Runtime drift regression test.
 *
 * Guarantees that every node type registered at runtime
 * (TriggerEvaluator.DEFAULT_TRIGGER_MAPPINGS, ActionExecutor handlers,
 * ConditionEvaluator evaluators) has a matching editor definition in
 * nodeLibrary.ts, and vice versa.
 *
 * If this test fails, it means someone added a runtime handler without
 * a matching editor node (users can't author that behavior) OR added an
 * editor node without a runtime handler (users can wire up a node that
 * silently does nothing).
 */

import fs from "node:fs";
import path from "node:path";
import { describe, it, expect } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..", "..", "..");
const EDITOR_LIBRARY = path.join(
  REPO_ROOT,
  "packages/asset-forge/src/scripting/nodeLibrary.ts",
);
const TRIGGER_EVALUATOR = path.join(
  REPO_ROOT,
  "packages/shared/src/systems/shared/scripting/TriggerEvaluator.ts",
);
const ACTION_EXECUTOR = path.join(
  REPO_ROOT,
  "packages/shared/src/systems/shared/scripting/ActionExecutor.ts",
);
const CONDITION_EVALUATOR = path.join(
  REPO_ROOT,
  "packages/shared/src/systems/shared/scripting/ConditionEvaluator.ts",
);

function extract(filePath: string, pattern: RegExp): Set<string> {
  const source = fs.readFileSync(filePath, "utf8");
  const matches = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = pattern.exec(source)) !== null) {
    matches.add(m[1]);
  }
  return matches;
}

function editorNodesOfCategory(category: string): Set<string> {
  return extract(
    EDITOR_LIBRARY,
    new RegExp(`type:\\s*"(${category}/[^"]+)"`, "g"),
  );
}

function runtimeTriggers(): Set<string> {
  return extract(TRIGGER_EVALUATOR, /triggerType:\s*"(trigger\/[^"]+)"/g);
}

function runtimeActions(): Set<string> {
  return extract(ACTION_EXECUTOR, /this\.register\("(action\/[^"]+)"/g);
}

function runtimeConditions(): Set<string> {
  return extract(CONDITION_EVALUATOR, /this\.register\("(condition\/[^"]+)"/g);
}

function difference(a: Set<string>, b: Set<string>): string[] {
  return [...a].filter((x) => !b.has(x)).sort();
}

describe("scripting editor ↔ runtime drift", () => {
  it("every runtime trigger has a matching editor node", () => {
    const runtime = runtimeTriggers();
    const editor = editorNodesOfCategory("trigger");
    const missing = difference(runtime, editor);
    expect(missing).toEqual([]);
  });

  it("every editor trigger node has a matching runtime trigger", () => {
    const runtime = runtimeTriggers();
    const editor = editorNodesOfCategory("trigger");
    // Special-dispatch triggers are NOT routed through TriggerEvaluator
    // mappings. They are invoked directly by the interpreter:
    //   - trigger/onFunctionCall: sub-graph entry point, found by type in
    //     ScriptGraphInterpreter when flow/callGraph executes.
    //   - trigger/onCustomEvent: dynamic event-name matching via
    //     action/emitCustomEvent; ScriptingSystem subscribes to the emitted
    //     event name directly, not via a static mapping.
    const SPECIAL_DISPATCH = new Set([
      "trigger/onFunctionCall",
      "trigger/onCustomEvent",
    ]);
    const orphaned = difference(editor, runtime).filter(
      (t) => !SPECIAL_DISPATCH.has(t),
    );
    expect(orphaned).toEqual([]);
  });

  it("every runtime action has a matching editor node", () => {
    const runtime = runtimeActions();
    const editor = editorNodesOfCategory("action");
    const missing = difference(runtime, editor);
    expect(missing).toEqual([]);
  });

  it("every editor action node has a matching runtime action", () => {
    const runtime = runtimeActions();
    const editor = editorNodesOfCategory("action");
    const orphaned = difference(editor, runtime);
    expect(orphaned).toEqual([]);
  });

  it("every runtime condition has a matching editor node", () => {
    const runtime = runtimeConditions();
    const editor = editorNodesOfCategory("condition");
    const missing = difference(runtime, editor);
    expect(missing).toEqual([]);
  });

  it("every editor condition node has a matching runtime condition", () => {
    const runtime = runtimeConditions();
    const editor = editorNodesOfCategory("condition");
    const orphaned = difference(editor, runtime);
    // Pure-logic editor conditions (and/or/not/compareNumber/compareString/
    // random/entityType) have no runtime entry because they're evaluated
    // inline by the interpreter, not via ConditionRegistry.
    const inlinePureLogic = new Set([
      "condition/and",
      "condition/or",
      "condition/not",
      "condition/compareNumber",
      "condition/compareString",
      "condition/random",
      "condition/entityType",
    ]);
    const real = orphaned.filter((t) => !inlinePureLogic.has(t));
    expect(real).toEqual([]);
  });
});
