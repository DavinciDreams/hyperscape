/**
 * Turns a {@link PluginBrowserToastGroup} into rendering-agnostic
 * display data: a deterministic English phrasing plus a structured
 * `{key, params}` pair the editor can pipe into its localization
 * layer. No DOM, no icons, no colors — the UI decides those.
 *
 * Pure transform. Never throws.
 */

import type { PluginRowSummarySeverity } from "./PluginBrowserRowSummary.js";
import type { PluginBrowserToastGroup } from "./PluginBrowserToastGrouping.js";
import type { PluginBrowserToastKind } from "./PluginBrowserToastRouter.js";

export interface PluginBrowserToastLocalizationKeys {
  readonly titleKey: string;
  readonly titleParams: Readonly<Record<string, string | number>>;
  readonly subtitleKey: string | null;
  readonly subtitleParams: Readonly<Record<string, string | number>> | null;
}

export interface PluginBrowserToastDisplay {
  readonly pluginId: string;
  readonly severity: PluginRowSummarySeverity;
  /** English fallback title. */
  readonly title: string;
  /** English fallback subtitle. Null when the group has no additionals. */
  readonly subtitle: string | null;
  /** Short badge chips (kind, and severity when it differs from kind's default). */
  readonly badges: readonly string[];
  /** Structured keys + interpolation params for the localization layer. */
  readonly localization: PluginBrowserToastLocalizationKeys;
  /** Deterministic English ARIA label — speaks the whole intent. */
  readonly ariaLabel: string;
}

export function formatPluginBrowserToastGroup(
  group: PluginBrowserToastGroup,
): PluginBrowserToastDisplay {
  const { pluginId, primary, additional, severity } = group;
  const kind = primary.kind;

  const titleKey = TITLE_KEYS[kind];
  const titleParams = buildTitleParams(group);
  const title = renderTitle(kind, titleParams);

  const hasAdditional = additional.length > 0;
  const subtitleKey = hasAdditional ? "plugin.toast.moreChanges" : null;
  const subtitleParams = hasAdditional ? { count: additional.length } : null;
  const subtitle = hasAdditional
    ? additional.length === 1
      ? "+1 more change"
      : `+${additional.length} more changes`
    : null;

  const badges: string[] = [KIND_BADGE[kind]];
  if (severity !== primary.severity) {
    badges.push(severity);
  }

  const ariaLabel = subtitle === null ? title : `${title}. ${subtitle}.`;

  return {
    pluginId,
    severity,
    title,
    subtitle,
    badges,
    localization: {
      titleKey,
      titleParams,
      subtitleKey,
      subtitleParams,
    },
    ariaLabel,
  };
}

function buildTitleParams(
  group: PluginBrowserToastGroup,
): Record<string, string | number> {
  const { pluginId, primary } = group;
  const params: Record<string, string | number> = { pluginId };
  switch (primary.kind) {
    case "regressed":
    case "recovered":
      params.severity = primary.severity;
      break;
    case "label-changed":
      params.previousLabel = primary.previous?.label ?? "";
      params.currentLabel = primary.current?.label ?? "";
      break;
    default:
      break;
  }
  return params;
}

function renderTitle(
  kind: PluginBrowserToastKind,
  params: Record<string, string | number>,
): string {
  const pluginId = String(params.pluginId);
  switch (kind) {
    case "regressed":
      return `${pluginId} regressed to ${params.severity}`;
    case "recovered":
      return `${pluginId} recovered to ${params.severity}`;
    case "added":
      return `${pluginId} installed`;
    case "removed":
      return `${pluginId} uninstalled`;
    case "label-changed":
      return `${pluginId}: ${params.previousLabel} → ${params.currentLabel}`;
  }
}

const TITLE_KEYS: Record<PluginBrowserToastKind, string> = {
  regressed: "plugin.toast.regressed",
  recovered: "plugin.toast.recovered",
  added: "plugin.toast.added",
  removed: "plugin.toast.removed",
  "label-changed": "plugin.toast.labelChanged",
};

const KIND_BADGE: Record<PluginBrowserToastKind, string> = {
  regressed: "regressed",
  recovered: "recovered",
  added: "added",
  removed: "removed",
  "label-changed": "label",
};
