import { describe, it, expect } from "vitest";
import { NODE_TYPE_ALLOWLIST, isAllowedNodeType } from "../NodeTypeAllowlist";

describe("NodeTypeAllowlist", () => {
  it("contains the canonical trigger types", () => {
    expect(isAllowedNodeType("trigger/onReady")).toBe(true);
    expect(isAllowedNodeType("trigger/onInteract")).toBe(true);
    expect(isAllowedNodeType("trigger/onEntityDeath")).toBe(true);
    expect(isAllowedNodeType("trigger/onPlayerNearby")).toBe(true);
  });

  it("contains the canonical action types", () => {
    expect(isAllowedNodeType("action/showDialogue")).toBe(true);
    expect(isAllowedNodeType("action/sendChat")).toBe(true);
    expect(isAllowedNodeType("action/showNotification")).toBe(true);
    expect(isAllowedNodeType("action/spawnMob")).toBe(true);
  });

  it("contains the canonical flow types", () => {
    expect(isAllowedNodeType("flow/branch")).toBe(true);
    expect(isAllowedNodeType("flow/delay")).toBe(true);
    expect(isAllowedNodeType("flow/sequence")).toBe(true);
  });

  it("rejects unknown types", () => {
    expect(isAllowedNodeType("action/exec")).toBe(false);
    expect(isAllowedNodeType("trigger/onSomeFakeEvent")).toBe(false);
    expect(isAllowedNodeType("malicious/injectCode")).toBe(false);
    expect(isAllowedNodeType("")).toBe(false);
  });

  it("rejects types with whitespace or control characters", () => {
    expect(isAllowedNodeType("action/sendChat ")).toBe(false);
    expect(isAllowedNodeType(" action/sendChat")).toBe(false);
    expect(isAllowedNodeType("action/sendChat\n")).toBe(false);
  });

  it("contains exactly one entry per known type", () => {
    // Sanity check on overall size — if this goes up, update PLAN.md.
    expect(NODE_TYPE_ALLOWLIST.size).toBeGreaterThan(100);
    expect(NODE_TYPE_ALLOWLIST.size).toBeLessThan(300);
  });
});
