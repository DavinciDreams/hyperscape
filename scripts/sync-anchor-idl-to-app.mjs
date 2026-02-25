#!/usr/bin/env node
/**
 * sync-anchor-idl-to-app.mjs
 *
 * Copies canonical Anchor-generated IDL files from anchor/target to the app.
 * Run after every `anchor build` to keep app IDLs in sync.
 *
 * Usage:
 *   node scripts/sync-anchor-idl-to-app.mjs          # copy IDLs
 *   node scripts/sync-anchor-idl-to-app.mjs --check   # CI mode: fail if out of sync
 */

import { readFileSync, copyFileSync, existsSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ANCHOR_IDL_DIR = join(
  ROOT,
  "packages/gold-betting-demo/anchor/target/idl",
);
const ANCHOR_TYPES_DIR = join(
  ROOT,
  "packages/gold-betting-demo/anchor/target/types",
);
const APP_IDL_DIR = join(ROOT, "packages/gold-betting-demo/app/src/idl");

const PROGRAMS = ["gold_clob_market", "fight_oracle", "gold_perps_market"];

const isCheck = process.argv.includes("--check");

let driftFound = false;

for (const program of PROGRAMS) {
  const jsonFile = `${program}.json`;
  const tsFile = `${program}.ts`;

  const anchorJson = join(ANCHOR_IDL_DIR, jsonFile);
  const anchorTs = join(ANCHOR_TYPES_DIR, tsFile);
  const appJson = join(APP_IDL_DIR, jsonFile);
  const appTs = join(APP_IDL_DIR, tsFile);

  for (const [src, dst, label] of [
    [anchorJson, appJson, jsonFile],
    [anchorTs, appTs, tsFile],
  ]) {
    if (!existsSync(src)) {
      if (isCheck) {
        console.error(`✗  Source artifact missing: ${src} — cannot validate ${label}`);
        driftFound = true;
        continue;
      } else {
        console.warn(`⚠  Source missing: ${src} — skipping ${label}`);
        continue;
      }
    }

    if (isCheck) {
      if (!existsSync(dst)) {
        console.error(`✗  Missing in app: ${label}`);
        driftFound = true;
        continue;
      }
      const srcContent = readFileSync(src, "utf8");
      const dstContent = readFileSync(dst, "utf8");
      if (srcContent !== dstContent) {
        console.error(`✗  IDL drift detected: ${label}`);
        driftFound = true;
      } else {
        console.log(`✓  ${label} in sync`);
      }
    } else {
      copyFileSync(src, dst);
      console.log(`✓  Synced ${label}`);
    }
  }
}

if (isCheck && driftFound) {
  console.error(
    "\n❌ IDL drift detected! Run: node scripts/sync-anchor-idl-to-app.mjs",
  );
  process.exit(1);
} else if (isCheck) {
  console.log("\n✅ All IDLs in sync.");
}
