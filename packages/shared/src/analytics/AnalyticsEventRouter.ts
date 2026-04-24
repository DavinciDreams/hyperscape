/**
 * Analytics event router.
 *
 * Runtime consumer for `@hyperforge/manifest-schema`'s
 * `analytics-events.ts`. Pure logic: validates a candidate event
 * payload against the authored event spec before the runtime sends
 * it to any sink. Also honors sampling: if `Math.random() >= rate`,
 * the event is dropped.
 *
 * Scope: validation + sampling + property filtering. No network, no
 * sink, no PII masking — caller decides sinks (dashboard, files,
 * remote, no-op) based on the validator's verdict.
 */

import {
  type AnalyticsEvent,
  type AnalyticsEventManifest,
  AnalyticsEventManifestSchema,
  type AnalyticsProp,
} from "@hyperforge/manifest-schema";

export type PropValue = string | number | boolean | Date;

/**
 * Validation verdict. `status === "accept"` means the event may be
 * forwarded to sinks; `"drop"` means a sampling decision dropped it
 * (no error — this is normal); `"reject"` means it doesn't match the
 * manifest and should NOT be forwarded (developer bug).
 */
export type ValidationOutcome =
  | {
      status: "accept";
      event: AnalyticsEvent;
      props: Record<string, PropValue>;
    }
  | { status: "drop"; reason: "sampling"; eventName: string }
  | {
      status: "reject";
      eventName: string;
      errors: readonly AnalyticsValidationError[];
    };

export type AnalyticsValidationError =
  | { kind: "unknown-event"; eventName: string }
  | { kind: "missing-prop"; eventName: string; propName: string }
  | {
      kind: "unknown-prop";
      eventName: string;
      propName: string;
    }
  | {
      kind: "type-mismatch";
      eventName: string;
      propName: string;
      expected: AnalyticsProp["kind"];
      got: string;
    }
  | {
      kind: "enum-mismatch";
      eventName: string;
      propName: string;
      allowed: readonly string[];
      got: string;
    };

export interface ValidateOptions {
  /** Injected sampling rng — defaults to Math.random. */
  rng?: () => number;
  /** Skip sampling entirely — used by tests. */
  skipSampling?: boolean;
}

export class AnalyticsEventRouter {
  private _byName = new Map<string, AnalyticsEvent>();

  constructor(manifest?: AnalyticsEventManifest) {
    if (manifest) this.load(manifest);
  }

  load(manifest: AnalyticsEventManifest): void {
    this._byName.clear();
    for (const e of manifest) this._byName.set(e.name, e);
  }

  loadFromJson(raw: unknown): void {
    this.load(AnalyticsEventManifestSchema.parse(raw));
  }

  isLoaded(): boolean {
    return this._byName.size > 0;
  }

  get size(): number {
    return this._byName.size;
  }

  has(name: string): boolean {
    return this._byName.has(name);
  }

  get(name: string): AnalyticsEvent | undefined {
    return this._byName.get(name);
  }

  /**
   * Validate a candidate event. Returns one of:
   *   - {status:"accept"}  — forward to sinks
   *   - {status:"drop"}    — dropped by sampling, not an error
   *   - {status:"reject"}  — author or caller bug, has errors
   */
  validate(
    eventName: string,
    props: Record<string, PropValue>,
    opts: ValidateOptions = {},
  ): ValidationOutcome {
    const event = this._byName.get(eventName);
    if (!event) {
      return {
        status: "reject",
        eventName,
        errors: [{ kind: "unknown-event", eventName }],
      };
    }
    const errors: AnalyticsValidationError[] = [];

    // Required props present
    for (const p of event.props) {
      if (p.required && !(p.name in props)) {
        errors.push({
          kind: "missing-prop",
          eventName,
          propName: p.name,
        });
      }
    }

    // Unknown props + type checking
    const propSpecByName = new Map<string, AnalyticsProp>();
    for (const p of event.props) propSpecByName.set(p.name, p);
    for (const [name, value] of Object.entries(props)) {
      const spec = propSpecByName.get(name);
      if (!spec) {
        errors.push({ kind: "unknown-prop", eventName, propName: name });
        continue;
      }
      const typeErr = checkPropValue(eventName, spec, value);
      if (typeErr) errors.push(typeErr);
    }

    if (errors.length > 0) {
      return { status: "reject", eventName, errors };
    }

    if (!opts.skipSampling && event.samplingRate < 1) {
      const rng = opts.rng ?? Math.random;
      const r = rng();
      if (r >= event.samplingRate) {
        return { status: "drop", reason: "sampling", eventName };
      }
    }
    return { status: "accept", event, props };
  }
}

function checkPropValue(
  eventName: string,
  spec: AnalyticsProp,
  value: PropValue,
): AnalyticsValidationError | null {
  const got =
    typeof value === "object" && value instanceof Date ? "date" : typeof value;
  switch (spec.kind) {
    case "string":
      if (typeof value !== "string") {
        return {
          kind: "type-mismatch",
          eventName,
          propName: spec.name,
          expected: spec.kind,
          got,
        };
      }
      return null;
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        return {
          kind: "type-mismatch",
          eventName,
          propName: spec.name,
          expected: spec.kind,
          got,
        };
      }
      return null;
    case "integer":
      if (typeof value !== "number" || !Number.isInteger(value)) {
        return {
          kind: "type-mismatch",
          eventName,
          propName: spec.name,
          expected: spec.kind,
          got,
        };
      }
      return null;
    case "boolean":
      if (typeof value !== "boolean") {
        return {
          kind: "type-mismatch",
          eventName,
          propName: spec.name,
          expected: spec.kind,
          got,
        };
      }
      return null;
    case "timestamp":
      if (
        !(value instanceof Date) &&
        !(typeof value === "number" && Number.isFinite(value))
      ) {
        return {
          kind: "type-mismatch",
          eventName,
          propName: spec.name,
          expected: spec.kind,
          got,
        };
      }
      return null;
    case "enum":
      if (typeof value !== "string") {
        return {
          kind: "type-mismatch",
          eventName,
          propName: spec.name,
          expected: spec.kind,
          got,
        };
      }
      if (!spec.enumValues || !spec.enumValues.includes(value)) {
        return {
          kind: "enum-mismatch",
          eventName,
          propName: spec.name,
          allowed: spec.enumValues ?? [],
          got: value,
        };
      }
      return null;
  }
}
