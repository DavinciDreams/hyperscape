/**
 * Localization catalog + minimal ICU MessageFormat formatter.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s `localization.ts`.
 * Indexes locale bundles by tag, selects an active locale, and formats
 * translation keys with named placeholders, pluralization, and select
 * branching.
 *
 * Scope: pure logic. Uses `Intl.PluralRules` (built-in) for per-locale
 * plural selectors — no dep on `intl-messageformat` or other formatter
 * libraries.
 *
 * Supported syntax (deliberately a subset of ICU):
 * - Plain text:                 `Hello world`
 * - Named placeholders:          `Hello {name}`
 * - Plural (Intl.PluralRules):   `{count, plural, one {# apple} other {# apples}}`
 *   - `#` inside a plural body expands to the numeric value.
 *   - Explicit-number selectors are also supported: `=0 {no apples} ...`.
 * - Select:                      `{gender, select, male {he} female {she} other {they}}`
 * - Escaping:                    `'{'` → literal `{`; `''` → literal `'`.
 *
 * Missing-key resolution walks the active locale's `fallback` chain;
 * if nothing resolves, the key itself is returned so the UI at least
 * shows the key string rather than an empty label.
 */

import {
  type LocalizationBundle,
  LocalizationBundleSchema,
  type LocalizationManifest,
  LocalizationManifestSchema,
} from "@hyperforge/manifest-schema";

export type FormatValue = string | number | boolean;
export type FormatValues = Record<string, FormatValue>;

export class UnknownLocaleError extends Error {
  readonly locale: string;
  readonly availableLocales: readonly string[];
  constructor(locale: string, availableLocales: readonly string[]) {
    super(
      `locale "${locale}" not loaded. Available: ${
        availableLocales.length > 0
          ? availableLocales.join(", ")
          : "(none loaded)"
      }`,
    );
    this.name = "UnknownLocaleError";
    this.locale = locale;
    this.availableLocales = availableLocales;
  }
}

export class MessageFormatError extends Error {
  readonly template: string;
  constructor(message: string, template: string) {
    super(`${message} — template: ${JSON.stringify(template)}`);
    this.name = "MessageFormatError";
    this.template = template;
  }
}

export class LocalizationCatalog {
  private localesByTag = new Map<string, LocalizationManifest>();
  private activeLocaleTag: string | null = null;
  private baseLocaleTag: string | null = null;

  constructor(bundleOrManifests?: LocalizationBundle | LocalizationManifest[]) {
    if (bundleOrManifests === undefined) return;
    if (Array.isArray(bundleOrManifests)) {
      this.loadManifests(bundleOrManifests);
    } else {
      this.loadBundle(bundleOrManifests);
    }
  }

  /** Load a full bundle (editor-loads-everything case). */
  loadBundle(bundle: LocalizationBundle): void {
    this.localesByTag.clear();
    for (const manifest of bundle.locales) {
      this.localesByTag.set(manifest.locale, manifest);
    }
    this.baseLocaleTag = bundle.base;
    this.activeLocaleTag = bundle.base;
  }

  /** Load a flat list of locale manifests — active locale defaults to the first one. */
  loadManifests(manifests: LocalizationManifest[]): void {
    if (manifests.length === 0) {
      throw new Error("loadManifests() requires at least one manifest");
    }
    this.localesByTag.clear();
    for (const m of manifests) this.localesByTag.set(m.locale, m);
    this.baseLocaleTag = manifests[0]!.locale;
    this.activeLocaleTag = manifests[0]!.locale;
  }

  /**
   * Validate-and-load raw JSON. Accepts either a `LocalizationBundle`
   * (with `base` + `locales`) or a single `LocalizationManifest`.
   */
  loadFromJson(raw: unknown): void {
    if (raw !== null && typeof raw === "object" && "locales" in raw) {
      this.loadBundle(LocalizationBundleSchema.parse(raw));
      return;
    }
    this.loadManifests([LocalizationManifestSchema.parse(raw)]);
  }

  setActiveLocale(locale: string): void {
    if (!this.localesByTag.has(locale)) {
      throw new UnknownLocaleError(locale, this.availableLocales);
    }
    this.activeLocaleTag = locale;
  }

  get activeLocale(): string {
    if (this.activeLocaleTag === null) {
      throw new Error(
        "LocalizationCatalog has no active locale — load a bundle first",
      );
    }
    return this.activeLocaleTag;
  }

  get baseLocale(): string | null {
    return this.baseLocaleTag;
  }

  get availableLocales(): readonly string[] {
    return Array.from(this.localesByTag.keys());
  }

  /** Does the given (or active) locale define `key` directly (no fallback walk)? */
  has(key: string, locale?: string): boolean {
    const tag = locale ?? this.activeLocale;
    const manifest = this.localesByTag.get(tag);
    if (manifest === undefined) return false;
    return key in manifest.strings;
  }

  /**
   * Resolve a key through the fallback chain, returning the raw
   * unformatted template or `undefined` if nothing matches.
   */
  resolveTemplate(key: string, locale?: string): string | undefined {
    const startTag = locale ?? this.activeLocale;
    const visited = new Set<string>();
    let cursor: string | undefined = startTag;
    while (cursor !== undefined && !visited.has(cursor)) {
      visited.add(cursor);
      const manifest = this.localesByTag.get(cursor);
      if (manifest === undefined) break;
      const template = manifest.strings[key];
      if (template !== undefined) return template;
      cursor = manifest.fallback;
    }
    return undefined;
  }

  /**
   * Resolve and format `key` against `values`. Unknown keys return the
   * key itself (so the UI degrades gracefully) rather than throwing.
   */
  format(key: string, values: FormatValues = {}, locale?: string): string {
    const tag = locale ?? this.activeLocale;
    const template = this.resolveTemplate(key, tag);
    if (template === undefined) return key;
    return formatMessage(template, values, tag);
  }

  /** Keys present in `baseLocale` but missing in `locale`. Empty if full parity. */
  missingKeys(locale: string): readonly string[] {
    if (this.baseLocaleTag === null) return [];
    const base = this.localesByTag.get(this.baseLocaleTag);
    const other = this.localesByTag.get(locale);
    if (base === undefined || other === undefined) {
      throw new UnknownLocaleError(
        other === undefined ? locale : this.baseLocaleTag,
        this.availableLocales,
      );
    }
    const result: string[] = [];
    for (const k of Object.keys(base.strings)) {
      if (!(k in other.strings)) result.push(k);
    }
    return result;
  }
}

// --- formatter -------------------------------------------------------

/**
 * Format an ICU-style template. Handles interpolation, plural, select,
 * and escaping. Unknown placeholders surface as `{name}` literally so
 * authoring gaps are visible at runtime.
 */
export function formatMessage(
  template: string,
  values: FormatValues,
  locale: string,
): string {
  return renderMessage(template, values, locale, null);
}

function renderMessage(
  template: string,
  values: FormatValues,
  locale: string,
  pluralArg: number | null,
): string {
  let out = "";
  let i = 0;
  while (i < template.length) {
    const ch = template[i]!;
    // ICU escape: '{' or '}' wrapped in single quotes, '' for literal quote.
    if (ch === "'") {
      if (template[i + 1] === "'") {
        out += "'";
        i += 2;
        continue;
      }
      // Quoted span until the next standalone `'`.
      i++;
      while (i < template.length && template[i] !== "'") {
        out += template[i];
        i++;
      }
      // Skip the closing quote (if any).
      if (template[i] === "'") i++;
      continue;
    }
    if (ch === "#" && pluralArg !== null) {
      out += String(pluralArg);
      i++;
      continue;
    }
    if (ch === "{") {
      const end = findMatchingBrace(template, i);
      if (end === -1) {
        throw new MessageFormatError("unmatched opening brace", template);
      }
      const inner = template.slice(i + 1, end);
      out += renderPlaceholder(inner, values, locale, template);
      i = end + 1;
      continue;
    }
    out += ch;
    i++;
  }
  return out;
}

/**
 * Return index of the `}` matching the `{` at `start`. Respects nesting
 * and ICU escaping (`'{'`).
 */
function findMatchingBrace(s: string, start: number): number {
  let depth = 0;
  let i = start;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "'") {
      if (s[i + 1] === "'") {
        i += 2;
        continue;
      }
      i++;
      while (i < s.length && s[i] !== "'") i++;
      if (s[i] === "'") i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") {
      depth--;
      if (depth === 0) return i;
    }
    i++;
  }
  return -1;
}

/**
 * Render a placeholder body (the part between `{` and `}`).
 * Three shapes:
 *   - `name`                                     → interpolation
 *   - `name, plural, selector {body} selector {body}`
 *   - `name, select, selector {body} selector {body}`
 */
function renderPlaceholder(
  inner: string,
  values: FormatValues,
  locale: string,
  template: string,
): string {
  const trimmed = inner.trim();
  const firstComma = splitFirstTopComma(trimmed);
  if (firstComma === -1) {
    // Simple interpolation.
    const raw = values[trimmed];
    if (raw === undefined) return `{${trimmed}}`;
    return String(raw);
  }
  const name = trimmed.slice(0, firstComma).trim();
  const rest = trimmed.slice(firstComma + 1).trim();
  const secondComma = splitFirstTopComma(rest);
  if (secondComma === -1) {
    throw new MessageFormatError(
      `placeholder "${name}" has a type but no body`,
      template,
    );
  }
  const type = rest.slice(0, secondComma).trim();
  const body = rest.slice(secondComma + 1).trim();
  if (type === "plural") {
    return renderPlural(name, body, values, locale, template);
  }
  if (type === "select") {
    return renderSelect(name, body, values, locale, template);
  }
  throw new MessageFormatError(
    `unknown placeholder type "${type}" (supported: plural, select)`,
    template,
  );
}

/**
 * Find the first comma not inside braces or quotes. Returns -1 if none.
 */
function splitFirstTopComma(s: string): number {
  let depth = 0;
  let i = 0;
  while (i < s.length) {
    const ch = s[i]!;
    if (ch === "'") {
      if (s[i + 1] === "'") {
        i += 2;
        continue;
      }
      i++;
      while (i < s.length && s[i] !== "'") i++;
      if (s[i] === "'") i++;
      continue;
    }
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    else if (ch === "," && depth === 0) return i;
    i++;
  }
  return -1;
}

/**
 * Parse `selector {body} selector {body}` into an array of branches.
 */
function parseBranches(
  body: string,
  template: string,
): Array<{ selector: string; body: string }> {
  const branches: Array<{ selector: string; body: string }> = [];
  let i = 0;
  while (i < body.length) {
    // Skip whitespace.
    while (i < body.length && /\s/.test(body[i]!)) i++;
    if (i >= body.length) break;
    // Read selector (until '{').
    const selStart = i;
    while (i < body.length && body[i] !== "{") i++;
    const selector = body.slice(selStart, i).trim();
    if (selector === "") {
      throw new MessageFormatError("branch missing selector", template);
    }
    if (body[i] !== "{") {
      throw new MessageFormatError(
        `branch "${selector}" missing opening brace`,
        template,
      );
    }
    const bodyEnd = findMatchingBrace(body, i);
    if (bodyEnd === -1) {
      throw new MessageFormatError(
        `branch "${selector}" has unmatched brace`,
        template,
      );
    }
    branches.push({ selector, body: body.slice(i + 1, bodyEnd) });
    i = bodyEnd + 1;
  }
  return branches;
}

function renderPlural(
  name: string,
  body: string,
  values: FormatValues,
  locale: string,
  template: string,
): string {
  const raw = values[name];
  if (typeof raw !== "number") {
    throw new MessageFormatError(
      `plural placeholder "${name}" requires a numeric value`,
      template,
    );
  }
  const branches = parseBranches(body, template);
  // Explicit-number selectors (=0, =1, ...) win if they match exactly.
  for (const branch of branches) {
    if (branch.selector.startsWith("=")) {
      const n = Number(branch.selector.slice(1));
      if (!Number.isNaN(n) && n === raw) {
        return renderMessage(branch.body, values, locale, raw);
      }
    }
  }
  const category = new Intl.PluralRules(locale).select(raw);
  const match =
    branches.find((b) => b.selector === category) ??
    branches.find((b) => b.selector === "other");
  if (match === undefined) {
    throw new MessageFormatError(
      `plural "${name}" missing "other" branch`,
      template,
    );
  }
  return renderMessage(match.body, values, locale, raw);
}

function renderSelect(
  name: string,
  body: string,
  values: FormatValues,
  locale: string,
  template: string,
): string {
  const raw = values[name];
  const branches = parseBranches(body, template);
  const str = raw === undefined ? undefined : String(raw);
  const match =
    (str !== undefined
      ? branches.find((b) => b.selector === str)
      : undefined) ?? branches.find((b) => b.selector === "other");
  if (match === undefined) {
    throw new MessageFormatError(
      `select "${name}" missing "other" branch`,
      template,
    );
  }
  return renderMessage(match.body, values, locale, null);
}
