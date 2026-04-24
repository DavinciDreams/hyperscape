import {
  LocalizationBundleSchema,
  LocalizationManifestSchema,
} from "@hyperforge/manifest-schema";
import { describe, expect, it } from "vitest";
import {
  LocalizationCatalog,
  MessageFormatError,
  UnknownLocaleError,
  formatMessage,
} from "../LocalizationCatalog.js";

function bundle() {
  return LocalizationBundleSchema.parse({
    base: "en",
    locales: [
      {
        locale: "en",
        strings: {
          "ui.greet": "Hello, {name}!",
          "ui.farewell": "Goodbye",
          "inv.apples":
            "{count, plural, =0 {no apples} one {# apple} other {# apples}}",
          "pronoun.use":
            "{gender, select, male {he} female {she} other {they}}",
          "ui.nested": "{count, plural, one {just {name}} other {{name} +#}}",
        },
      },
      {
        locale: "es",
        fallback: "en",
        strings: {
          "ui.greet": "¡Hola, {name}!",
          "inv.apples":
            "{count, plural, =0 {sin manzanas} one {# manzana} other {# manzanas}}",
          // intentionally missing ui.farewell, pronoun.use, ui.nested
        },
      },
    ],
  });
}

describe("LocalizationCatalog — registry basics", () => {
  it("bundle load sets active locale to base", () => {
    const cat = new LocalizationCatalog(bundle());
    expect(cat.activeLocale).toBe("en");
    expect(cat.baseLocale).toBe("en");
    expect(cat.availableLocales).toEqual(["en", "es"]);
  });

  it("setActiveLocale switches + validates", () => {
    const cat = new LocalizationCatalog(bundle());
    cat.setActiveLocale("es");
    expect(cat.activeLocale).toBe("es");
    expect(() => cat.setActiveLocale("ghost")).toThrow(UnknownLocaleError);
  });

  it("has() checks direct (no fallback walk)", () => {
    const cat = new LocalizationCatalog(bundle());
    cat.setActiveLocale("es");
    expect(cat.has("ui.greet")).toBe(true);
    expect(cat.has("ui.farewell")).toBe(false);
  });

  it("loadFromJson accepts a single manifest", () => {
    const cat = new LocalizationCatalog();
    cat.loadFromJson({
      locale: "en",
      strings: { k: "v" },
    });
    expect(cat.activeLocale).toBe("en");
    expect(cat.format("k")).toBe("v");
  });

  it("loadFromJson accepts a bundle", () => {
    const cat = new LocalizationCatalog();
    cat.loadFromJson(bundle());
    expect(cat.availableLocales).toEqual(["en", "es"]);
  });

  it("missingKeys surfaces parity gaps against base", () => {
    const cat = new LocalizationCatalog(bundle());
    const missing = cat.missingKeys("es");
    expect(missing).toEqual(
      expect.arrayContaining(["ui.farewell", "pronoun.use", "ui.nested"]),
    );
    expect(missing).toHaveLength(3);
  });
});

describe("LocalizationCatalog — fallback", () => {
  it("resolves through fallback chain", () => {
    const cat = new LocalizationCatalog(bundle());
    cat.setActiveLocale("es");
    expect(cat.format("ui.farewell")).toBe("Goodbye");
  });

  it("unknown key returns the key itself", () => {
    const cat = new LocalizationCatalog(bundle());
    expect(cat.format("ghost.key")).toBe("ghost.key");
  });

  it("fallback chain doesn't loop on cyclic fallback pointers", () => {
    const cat = new LocalizationCatalog();
    cat.loadManifests([
      LocalizationManifestSchema.parse({
        locale: "aa",
        fallback: "bb",
        strings: {},
      }),
      LocalizationManifestSchema.parse({
        locale: "bb",
        fallback: "aa",
        strings: {},
      }),
    ]);
    expect(cat.format("nothing")).toBe("nothing");
  });
});

describe("formatMessage — interpolation", () => {
  it("simple placeholder", () => {
    expect(formatMessage("Hello, {name}!", { name: "Alice" }, "en")).toBe(
      "Hello, Alice!",
    );
  });

  it("numeric placeholder is stringified", () => {
    expect(
      formatMessage("HP: {hp}/{maxHp}", { hp: 30, maxHp: 100 }, "en"),
    ).toBe("HP: 30/100");
  });

  it("unknown placeholder leaves {name} literally", () => {
    expect(formatMessage("Hello, {name}!", {}, "en")).toBe("Hello, {name}!");
  });

  it("escaped braces are literal", () => {
    expect(formatMessage("use '{' for a brace", {}, "en")).toBe(
      "use { for a brace",
    );
  });

  it("double single-quote escapes to literal quote", () => {
    expect(formatMessage("it''s fine", {}, "en")).toBe("it's fine");
  });
});

describe("formatMessage — plural", () => {
  const t = "{count, plural, =0 {no apples} one {# apple} other {# apples}}";

  it("exact =0 match", () => {
    expect(formatMessage(t, { count: 0 }, "en")).toBe("no apples");
  });

  it("Intl one category (en: count=1)", () => {
    expect(formatMessage(t, { count: 1 }, "en")).toBe("1 apple");
  });

  it("other category expands #", () => {
    expect(formatMessage(t, { count: 5 }, "en")).toBe("5 apples");
  });

  it("large number goes through other", () => {
    expect(formatMessage(t, { count: 1000 }, "en")).toBe("1000 apples");
  });

  it("missing value throws MessageFormatError", () => {
    expect(() => formatMessage(t, {}, "en")).toThrow(MessageFormatError);
  });
});

describe("formatMessage — select", () => {
  const t = "{gender, select, male {he} female {she} other {they}}";

  it("matching case", () => {
    expect(formatMessage(t, { gender: "male" }, "en")).toBe("he");
    expect(formatMessage(t, { gender: "female" }, "en")).toBe("she");
  });

  it("falls through to other", () => {
    expect(formatMessage(t, { gender: "nonbinary" }, "en")).toBe("they");
  });

  it("missing value falls through to other", () => {
    expect(formatMessage(t, {}, "en")).toBe("they");
  });
});

describe("formatMessage — nesting", () => {
  it("nested placeholder inside plural body with # expansion", () => {
    const t = "{count, plural, one {just {name}} other {{name} +#}}";
    expect(formatMessage(t, { count: 1, name: "coin" }, "en")).toBe(
      "just coin",
    );
    expect(formatMessage(t, { count: 5, name: "coin" }, "en")).toBe("coin +5");
  });

  it("select inside plural branch", () => {
    const t =
      "{count, plural, one {{gender, select, male {he} other {they}}} other {{count} friends}}";
    expect(formatMessage(t, { count: 1, gender: "male" }, "en")).toBe("he");
    expect(formatMessage(t, { count: 3 }, "en")).toBe("3 friends");
  });
});

describe("formatMessage — errors", () => {
  it("unmatched brace throws", () => {
    expect(() => formatMessage("Hello, {name", {}, "en")).toThrow(
      MessageFormatError,
    );
  });

  it("unknown placeholder type throws", () => {
    expect(() =>
      formatMessage("{name, bogus, a {x}}", { name: "a" }, "en"),
    ).toThrow(MessageFormatError);
  });

  it("plural missing other branch throws", () => {
    expect(() => formatMessage("{n, plural, one {#}}", { n: 5 }, "en")).toThrow(
      MessageFormatError,
    );
  });

  it("non-numeric plural value throws", () => {
    expect(() =>
      formatMessage("{n, plural, other {x}}", { n: "oops" }, "en"),
    ).toThrow(MessageFormatError);
  });
});

describe("LocalizationCatalog — integration with dialogue-style keys", () => {
  it("formats a dialogue line via catalog", () => {
    const cat = new LocalizationCatalog(
      LocalizationBundleSchema.parse({
        base: "en",
        locales: [
          {
            locale: "en",
            strings: {
              "npc.shopkeeper.greet":
                "Welcome, {name}! You have {count, plural, =0 {no gold} one {# coin} other {# coins}}.",
            },
          },
        ],
      }),
    );
    expect(
      cat.format("npc.shopkeeper.greet", { name: "Alice", count: 0 }),
    ).toBe("Welcome, Alice! You have no gold.");
    expect(
      cat.format("npc.shopkeeper.greet", { name: "Alice", count: 1 }),
    ).toBe("Welcome, Alice! You have 1 coin.");
    expect(
      cat.format("npc.shopkeeper.greet", { name: "Alice", count: 42 }),
    ).toBe("Welcome, Alice! You have 42 coins.");
  });
});
