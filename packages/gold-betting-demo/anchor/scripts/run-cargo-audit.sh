#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
IGNORED_ADVISORY="RUSTSEC-2025-0141"

cd "$ROOT_DIR"

AUDIT_JSON="$(mktemp)"
trap 'rm -f "$AUDIT_JSON"' EXIT

cargo audit --json "$@" > "$AUDIT_JSON"

node - "$AUDIT_JSON" "$IGNORED_ADVISORY" "${ANCHOR_AUDIT_STRICT:-0}" <<'NODE'
const fs = require("fs");

const [, , reportPath, ignoredAdvisory, strictFlag] = process.argv;
const strict = strictFlag === "1";
const report = JSON.parse(fs.readFileSync(reportPath, "utf8"));

const vulnerabilities = report.vulnerabilities?.list ?? [];
const warningsByKind = report.warnings ?? {};
const warnings = Object.entries(warningsByKind).flatMap(([kind, entries]) =>
  (entries ?? []).map((entry) => ({
    kind,
    advisoryId: entry.advisory?.id ?? null,
    packageName: entry.package?.name ?? "unknown",
    title: entry.advisory?.title ?? entry.kind ?? kind,
  })),
);

const allowedWarnings = strict
  ? []
  : warnings.filter((warning) => warning.advisoryId === ignoredAdvisory);
const blockingWarnings = strict
  ? warnings
  : warnings.filter((warning) => warning.advisoryId !== ignoredAdvisory);

if (vulnerabilities.length > 0 || blockingWarnings.length > 0) {
  if (vulnerabilities.length > 0) {
    console.error("[anchor-audit] Vulnerabilities found:");
    for (const vulnerability of vulnerabilities) {
      const pkg = vulnerability.package?.name ?? "unknown";
      const id = vulnerability.advisory?.id ?? "unknown";
      const title = vulnerability.advisory?.title ?? "unknown";
      console.error(`- ${id} in ${pkg}: ${title}`);
    }
  }

  if (blockingWarnings.length > 0) {
    console.error("[anchor-audit] Blocking warnings found:");
    for (const warning of blockingWarnings) {
      const id = warning.advisoryId ?? warning.kind;
      console.error(`- ${id} in ${warning.packageName}: ${warning.title}`);
    }
  }

  process.exit(1);
}

if (allowedWarnings.length > 0) {
  console.log(`[anchor-audit] Ignoring ${ignoredAdvisory}.`);
  console.log("[anchor-audit] Reason: RustSec marks all 'bincode' releases as unmaintained, with no patched version.");
  console.log("[anchor-audit] Current Anchor/Solana Rust dependencies still require 'bincode', so this is an explicit upstream risk acceptance rather than a hidden failure.");
} else {
  console.log("[anchor-audit] No vulnerabilities or warnings found.");
}
NODE
