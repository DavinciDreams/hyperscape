import { describe, expect, it } from "vitest";
import { createPluginBrowserFavorites } from "../PluginBrowserFavorites.js";

describe("createPluginBrowserFavorites — defaults", () => {
  it("starts empty", () => {
    const f = createPluginBrowserFavorites();
    expect(f.size()).toBe(0);
    expect(f.favoriteIds()).toEqual([]);
  });

  it("isFavorite returns false for any id when empty", () => {
    const f = createPluginBrowserFavorites();
    expect(f.isFavorite("anything")).toBe(false);
  });
});

describe("createPluginBrowserFavorites — initialFavorites", () => {
  it("seeds from initialFavorites", () => {
    const f = createPluginBrowserFavorites({
      initialFavorites: ["a", "b", "c"],
    });
    expect(f.size()).toBe(3);
    expect(f.isFavorite("a")).toBe(true);
    expect(f.isFavorite("b")).toBe(true);
    expect(f.isFavorite("c")).toBe(true);
  });

  it("dedupes duplicates in initialFavorites", () => {
    const f = createPluginBrowserFavorites({
      initialFavorites: ["a", "a", "b", "a"],
    });
    expect(f.size()).toBe(2);
    expect(f.favoriteIds()).toEqual(["a", "b"]);
  });

  it("drops empty strings from initialFavorites", () => {
    const f = createPluginBrowserFavorites({
      initialFavorites: ["a", "", "b"],
    });
    expect(f.size()).toBe(2);
    expect(f.favoriteIds()).toEqual(["a", "b"]);
  });

  it("drops non-string entries from initialFavorites", () => {
    const f = createPluginBrowserFavorites({
      initialFavorites: ["a", null as unknown as string, "b"],
    });
    expect(f.size()).toBe(2);
    expect(f.favoriteIds()).toEqual(["a", "b"]);
  });
});

describe("createPluginBrowserFavorites — add", () => {
  it("returns true on first add", () => {
    const f = createPluginBrowserFavorites();
    expect(f.add("a")).toBe(true);
    expect(f.isFavorite("a")).toBe(true);
  });

  it("returns false on duplicate add", () => {
    const f = createPluginBrowserFavorites();
    f.add("a");
    expect(f.add("a")).toBe(false);
    expect(f.size()).toBe(1);
  });

  it("returns false on empty id", () => {
    const f = createPluginBrowserFavorites();
    expect(f.add("")).toBe(false);
    expect(f.size()).toBe(0);
  });

  it("returns false on non-string id", () => {
    const f = createPluginBrowserFavorites();
    expect(f.add(null as unknown as string)).toBe(false);
    expect(f.size()).toBe(0);
  });
});

describe("createPluginBrowserFavorites — remove", () => {
  it("returns true when id was present", () => {
    const f = createPluginBrowserFavorites({ initialFavorites: ["a"] });
    expect(f.remove("a")).toBe(true);
    expect(f.isFavorite("a")).toBe(false);
  });

  it("returns false when id is unknown", () => {
    const f = createPluginBrowserFavorites();
    expect(f.remove("never-added")).toBe(false);
  });

  it("returns false on empty id", () => {
    const f = createPluginBrowserFavorites({ initialFavorites: ["a"] });
    expect(f.remove("")).toBe(false);
    expect(f.size()).toBe(1);
  });
});

describe("createPluginBrowserFavorites — toggle", () => {
  it("flips off → on", () => {
    const f = createPluginBrowserFavorites();
    f.toggle("a");
    expect(f.isFavorite("a")).toBe(true);
  });

  it("flips on → off", () => {
    const f = createPluginBrowserFavorites({ initialFavorites: ["a"] });
    f.toggle("a");
    expect(f.isFavorite("a")).toBe(false);
  });

  it("is a no-op on empty id", () => {
    const f = createPluginBrowserFavorites();
    f.toggle("");
    expect(f.size()).toBe(0);
  });
});

describe("createPluginBrowserFavorites — isFavorite", () => {
  it("returns false for empty id", () => {
    const f = createPluginBrowserFavorites({ initialFavorites: ["a"] });
    expect(f.isFavorite("")).toBe(false);
  });

  it("returns false for unknown id", () => {
    const f = createPluginBrowserFavorites({ initialFavorites: ["a"] });
    expect(f.isFavorite("b")).toBe(false);
  });
});

describe("createPluginBrowserFavorites — favoriteIds", () => {
  it("preserves insertion order across add()", () => {
    const f = createPluginBrowserFavorites();
    f.add("b");
    f.add("a");
    f.add("c");
    expect(f.favoriteIds()).toEqual(["b", "a", "c"]);
  });

  it("re-adding an existing id does NOT move it", () => {
    const f = createPluginBrowserFavorites();
    f.add("a");
    f.add("b");
    f.add("c");
    f.add("a"); // no-op
    expect(f.favoriteIds()).toEqual(["a", "b", "c"]);
  });

  it("removing then re-adding places id at the end", () => {
    const f = createPluginBrowserFavorites();
    f.add("a");
    f.add("b");
    f.add("c");
    f.remove("a");
    f.add("a");
    expect(f.favoriteIds()).toEqual(["b", "c", "a"]);
  });
});

describe("createPluginBrowserFavorites — clear", () => {
  it("empties the set", () => {
    const f = createPluginBrowserFavorites({
      initialFavorites: ["a", "b", "c"],
    });
    f.clear();
    expect(f.size()).toBe(0);
    expect(f.favoriteIds()).toEqual([]);
  });

  it("is a no-op on an already empty set", () => {
    const f = createPluginBrowserFavorites();
    f.clear();
    expect(f.size()).toBe(0);
  });
});
