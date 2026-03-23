#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const assetsDir = path.join(rootDir, "packages/server/world/assets");
const manifestsDir = path.join(assetsDir, "manifests");

const jsonFiles = [];
const assetReferences = [];
const missingAssets = [];
const metadataPathLeaks = [];
const errors = [];
const warnings = [];

function walk(dir, visitor) {
  if (!existsSync(dir)) return;

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith(".")) continue;
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visitor);
      continue;
    }

    visitor(fullPath);
  }
}

function isObjectRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isBuildingsManifest(value) {
  return (
    isObjectRecord(value) &&
    typeof value.version === "number" &&
    Array.isArray(value.towns) &&
    isObjectRecord(value.buildingTypes) &&
    isObjectRecord(value.sizeDefinitions)
  );
}

function visitJson(value, location) {
  if (typeof value === "string") {
    if (value.startsWith("asset://")) {
      assetReferences.push({ location, value });
    }

    if (
      value.startsWith("/home/") ||
      value.startsWith("/Users/") ||
      /^[A-Za-z]:\\\\/.test(value)
    ) {
      metadataPathLeaks.push({ location, value });
    }

    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      visitJson(entry, `${location}[${index}]`);
    });
    return;
  }

  if (isObjectRecord(value)) {
    for (const [key, child] of Object.entries(value)) {
      visitJson(child, `${location}.${key}`);
    }
  }
}

function resolveAssetPath(assetUrl) {
  const relativePath = assetUrl.replace("asset://", "");
  return path.join(assetsDir, relativePath);
}

function validateBuildingsManifest() {
  const buildingsPath = path.join(manifestsDir, "buildings.json");
  if (!existsSync(buildingsPath)) {
    warnings.push("buildings.json is missing");
    return;
  }

  try {
    const parsed = JSON.parse(readFileSync(buildingsPath, "utf-8"));
    if (!isBuildingsManifest(parsed)) {
      errors.push(
        "buildings.json is present but does not match the expected BuildingsManifest shape",
      );
    }
  } catch (error) {
    errors.push(
      `buildings.json could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`,
    );
  }
}

function scanJsonFiles() {
  walk(assetsDir, (filePath) => {
    if (!filePath.endsWith(".json")) return;
    jsonFiles.push(filePath);

    try {
      const parsed = JSON.parse(readFileSync(filePath, "utf-8"));
      visitJson(parsed, path.relative(rootDir, filePath));
    } catch (error) {
      errors.push(
        `${path.relative(rootDir, filePath)} could not be parsed: ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  });
}

function validateAssetReferences() {
  for (const reference of assetReferences) {
    const fullPath = resolveAssetPath(reference.value);
    if (!existsSync(fullPath) || !statSync(fullPath).isFile()) {
      missingAssets.push(reference);
    }
  }
}

function printSample(title, entries, formatEntry) {
  if (entries.length === 0) return;
  console.log(`\n${title} (${entries.length})`);
  for (const entry of entries.slice(0, 10)) {
    console.log(`  - ${formatEntry(entry)}`);
  }
  if (entries.length > 10) {
    console.log(`  - ... and ${entries.length - 10} more`);
  }
}

function main() {
  if (!existsSync(assetsDir)) {
    console.error(`Assets directory not found: ${assetsDir}`);
    process.exit(1);
  }

  console.log("Validating synced assets...");
  console.log(`Assets root: ${assetsDir}`);

  validateBuildingsManifest();
  scanJsonFiles();
  validateAssetReferences();

  if (metadataPathLeaks.length > 0) {
    warnings.push(
      `Found ${metadataPathLeaks.length} absolute local path references in asset metadata`,
    );
  }

  if (missingAssets.length > 0) {
    errors.push(
      `Found ${missingAssets.length} missing asset:// references in synced JSON content`,
    );
  }

  console.log(`\nScanned ${jsonFiles.length} JSON files`);
  console.log(`Found ${assetReferences.length} asset:// references`);

  printSample("Missing asset references", missingAssets, (entry) => {
    return `${entry.location} -> ${entry.value}`;
  });
  printSample("Absolute metadata paths", metadataPathLeaks, (entry) => {
    return `${entry.location} -> ${entry.value}`;
  });
  printSample("Warnings", warnings, (entry) => entry);
  printSample("Errors", errors, (entry) => entry);

  if (errors.length > 0) {
    console.error("\nAsset validation failed.");
    process.exit(1);
  }

  console.log("\nAsset validation passed.");
}

main();
