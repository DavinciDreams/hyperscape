/**
 * Tests for the FriendsSocialProvider singleton.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { friendsSocialProvider } from "../FriendsSocialProvider";

beforeEach(() => {
  friendsSocialProvider.unload();
});
afterEach(() => {
  friendsSocialProvider.unload();
});

describe("FriendsSocialProvider", () => {
  it("starts unloaded", () => {
    expect(friendsSocialProvider.isLoaded()).toBe(false);
    expect(friendsSocialProvider.getManifest()).toBeNull();
  });

  it("loadRaw() accepts empty blob and fills defaults", () => {
    const parsed = friendsSocialProvider.loadRaw({});
    expect(parsed.enabled).toBe(true);
    expect(parsed.friends).toBeDefined();
    expect(parsed.ignore).toBeDefined();
    expect(parsed.recent).toBeDefined();
    expect(parsed.onlineStatus).toBeDefined();
    expect(friendsSocialProvider.isLoaded()).toBe(true);
  });

  it("loadRaw() accepts {enabled:false} baseline", () => {
    const parsed = friendsSocialProvider.loadRaw({ enabled: false });
    expect(parsed.enabled).toBe(false);
  });

  it("loadRaw() accepts custom friends scope", () => {
    const parsed = friendsSocialProvider.loadRaw({
      friends: { scope: "perAccount" },
      ignore: { scope: "perAccount" },
    });
    expect(parsed.friends.scope).toBe("perAccount");
    expect(parsed.ignore.scope).toBe("perAccount");
  });

  it("loadRaw() rejects mismatched friends/ignore scope", () => {
    expect(() =>
      friendsSocialProvider.loadRaw({
        friends: { scope: "perAccount" },
        ignore: { scope: "perCharacter" },
      }),
    ).toThrow();
  });

  it("load() installs an already-validated manifest", () => {
    const parsed = friendsSocialProvider.loadRaw({});
    friendsSocialProvider.unload();
    friendsSocialProvider.load(parsed);
    expect(friendsSocialProvider.isLoaded()).toBe(true);
  });

  it("hotReload() replaces the manifest", () => {
    friendsSocialProvider.loadRaw({});
    const parsed = friendsSocialProvider.loadRaw({ enabled: false });
    friendsSocialProvider.hotReload(parsed);
    expect(friendsSocialProvider.getManifest()?.enabled).toBe(false);
  });

  it("hotReload(null) clears the manifest", () => {
    friendsSocialProvider.loadRaw({});
    friendsSocialProvider.hotReload(null);
    expect(friendsSocialProvider.isLoaded()).toBe(false);
  });

  it("unload() clears a loaded manifest", () => {
    friendsSocialProvider.loadRaw({});
    friendsSocialProvider.unload();
    expect(friendsSocialProvider.isLoaded()).toBe(false);
  });
});
