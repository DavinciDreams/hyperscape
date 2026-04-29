/**
 * devApi.test.tsx — runtime pack-loading reactivity proof.
 *
 * The agent emits a UIPackManifest. The runtime client renders
 * whatever pack is active. Without a runtime entry point, those
 * two halves only meet at boot — the user has to restart the
 * client every time they want to try a new pack.
 *
 * `installRuntimeDevApi()` installs `window.hyperforge.loadPack` as
 * a one-line bridge: paste the agent's pack JSON into the console,
 * see the rendered HUD swap. This test asserts the bridge actually
 * flips the active pack and re-renders subscribers.
 */

import React, { useEffect } from "react";
import { describe, expect, it, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { installRuntimeDevApi } from "@/ui-framework/devApi";
import { useActiveUIPack } from "@/ui-framework/useActiveUIPack";
import { setActiveUIPack } from "@/ui-framework/uiPackRegistry";

import capturedPackRaw from "./fixtures/agentCapturedPack.json";

const TINY_PACK_JSON = JSON.stringify(capturedPackRaw);

function ActivePackProbe({ onPack }: { onPack: (id: string | null) => void }) {
  const pack = useActiveUIPack();
  useEffect(() => {
    onPack(pack?.id ?? null);
  }, [pack, onPack]);
  return <span data-testid="active-pack-id">{pack?.id ?? "(none)"}</span>;
}

describe("installRuntimeDevApi", () => {
  beforeEach(() => {
    // Clear any state left over from prior tests sharing the registry.
    setActiveUIPack(null);
    // Reset the global so each test re-installs cleanly.
    (globalThis as { hyperforge?: unknown }).hyperforge = undefined;
  });

  it("installs window.hyperforge with three methods", () => {
    const api = installRuntimeDevApi();
    expect(typeof api.loadPack).toBe("function");
    expect(typeof api.clearPack).toBe("function");
    expect(typeof api.getActivePack).toBe("function");

    const fromGlobal = (globalThis as { hyperforge?: typeof api }).hyperforge;
    expect(fromGlobal).toBe(api);
  });

  it("loadPack accepts a JSON string and activates the pack", () => {
    const api = installRuntimeDevApi();
    const loaded = api.loadPack(TINY_PACK_JSON);
    expect(loaded.id).toBe("com.hyperforge.minimal-hud");
    expect(api.getActivePack()?.id).toBe("com.hyperforge.minimal-hud");
  });

  it("loadPack accepts a manifest object directly", () => {
    const api = installRuntimeDevApi();
    const loaded = api.loadPack(capturedPackRaw as never);
    expect(loaded.id).toBe("com.hyperforge.minimal-hud");
  });

  it("clearPack drops the active pointer", () => {
    const api = installRuntimeDevApi();
    api.loadPack(TINY_PACK_JSON);
    expect(api.getActivePack()).not.toBeNull();
    api.clearPack();
    expect(api.getActivePack()).toBeNull();
  });

  it("loadPack throws with structured issues on invalid input", () => {
    const api = installRuntimeDevApi();
    const bad = JSON.stringify({ version: 1, name: "no id" });
    expect(() => api.loadPack(bad)).toThrow(/pack invalid/);
  });

  it("loadPack triggers re-render of useActiveUIPack subscribers", () => {
    const api = installRuntimeDevApi();
    const seen: Array<string | null> = [];
    const captured = render(<ActivePackProbe onPack={(id) => seen.push(id)} />);
    expect(seen[seen.length - 1]).toBeNull();

    act(() => {
      api.loadPack(TINY_PACK_JSON);
    });

    expect(seen[seen.length - 1]).toBe("com.hyperforge.minimal-hud");
    expect(
      captured.container.querySelector('[data-testid="active-pack-id"]')!
        .textContent,
    ).toBe("com.hyperforge.minimal-hud");
    captured.unmount();
  });

  it("clearPack triggers re-render back to null", () => {
    const api = installRuntimeDevApi();
    api.loadPack(TINY_PACK_JSON);
    const seen: Array<string | null> = [];
    const captured = render(<ActivePackProbe onPack={(id) => seen.push(id)} />);
    expect(seen[seen.length - 1]).toBe("com.hyperforge.minimal-hud");

    act(() => {
      api.clearPack();
    });

    expect(seen[seen.length - 1]).toBeNull();
    captured.unmount();
  });
});
