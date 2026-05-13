#!/usr/bin/env node
/**
 * Import a Hill unified_manifest.json into Hyperscape's local asset root.
 *
 * The script copies optimized GLB/thumbnail files into packages/server/world/assets
 * and merges the Hill vegetation patch into manifests/vegetation.json. It can also
 * seed missing local manifests from a CDN URL so local dev matches the deployed
 * asset layout before applying Hill-generated assets.
 */

import fs from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const DEFAULT_ASSETS_ROOT = "packages/server/world/assets";
const DEFAULT_VEGETATION_URL =
  "https://assets.hyperscape.club/manifests/vegetation.json";
const DEFAULT_BIOMES_URL = "https://assets.hyperscape.club/manifests/biomes.json";

function parseArgs(argv) {
  const args = {
    assetsRoot: DEFAULT_ASSETS_ROOT,
    copyFiles: true,
    seedVegetationUrl: DEFAULT_VEGETATION_URL,
    seedBiomesUrl: DEFAULT_BIOMES_URL,
    biomes: ["plains", "forest"],
    dryRun: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = () => {
      i += 1;
      if (i >= argv.length) throw new Error(`${arg} requires a value`);
      return argv[i];
    };

    if (arg === "--manifest") args.manifest = next();
    else if (arg === "--assets-root") args.assetsRoot = next();
    else if (arg === "--seed-vegetation-url") args.seedVegetationUrl = next();
    else if (arg === "--seed-biomes-url") args.seedBiomesUrl = next();
    else if (arg === "--biomes") {
      args.biomes = next()
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);
    } else if (arg === "--no-copy") args.copyFiles = false;
    else if (arg === "--no-seed") {
      args.seedVegetationUrl = "";
      args.seedBiomesUrl = "";
    } else if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!args.manifest) throw new Error("--manifest is required");
  return args;
}

function printHelp() {
  console.log(`Usage:
  node scripts/import-hill-manifest.mjs --manifest /tank/3d-catalog/.../unified_manifest.json

Options:
  --assets-root <dir>          Default: ${DEFAULT_ASSETS_ROOT}
  --biomes <ids>               Comma-separated biome ids to patch. Default: plains,forest
  --seed-vegetation-url <url>  Seed vegetation.json when local file is missing.
  --seed-biomes-url <url>      Seed biomes.json when local file is missing.
  --no-seed                    Do not fetch missing base manifests.
  --no-copy                    Merge manifests without copying files.
  --dry-run                    Print summary without writing files.
`);
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

async function writeJson(filePath, value, dryRun) {
  if (dryRun) return;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function seedJsonIfMissing(filePath, url, label, dryRun) {
  if (await pathExists(filePath)) return false;
  if (!url) return false;

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`${label} seed failed: HTTP ${response.status}`);
  }
  const value = await response.json();
  await writeJson(filePath, value, dryRun);
  return true;
}

function getHyperscapePatches(manifest, target) {
  return (
    manifest?.exports?.hyperscape?.manifest_patches?.[target] ??
    manifest?.exports?.hyperscape?.manifestPatches?.[target] ??
    []
  );
}

function assetFileGroups(manifest) {
  const out = [];
  for (const asset of manifest.assets ?? []) {
    const identity = asset.identity ?? {};
    const slug =
      identity.slug ??
      asset.pack_slug ??
      manifest.source?.slug ??
      manifest.source?.catalog_slug;
    const prop =
      identity.prop_slug ??
      identity.propId ??
      asset.name ??
      String(asset.id ?? "").split(":").pop();
    if (!slug || !prop) continue;
    const webp = asset.files?.optimized_webp ?? {};

    for (const [tier, record] of Object.entries(webp)) {
      if (!record?.path) continue;
      out.push({
        source: record.path,
        dest: path.join(
          "models",
          "hill",
          slug,
          `${slug}_${prop}_${tier}.glb`,
        ),
      });
    }

    const thumbnail = asset.media?.thumbnail?.path ?? asset.media?.thumbnail_path;
    if (thumbnail) {
      out.push({
        source: thumbnail,
        dest: path.join("icons", "hill", slug, `${slug}_${prop}.png`),
      });
    }
  }
  return out;
}

async function copyAssetFiles(manifest, assetsRoot, dryRun) {
  const copied = [];
  for (const file of assetFileGroups(manifest)) {
    if (!(await pathExists(file.source))) {
      console.warn(`[Hill Import] Missing source file: ${file.source}`);
      continue;
    }
    const dest = path.join(assetsRoot, file.dest);
    copied.push(dest);
    if (!dryRun) {
      await fs.mkdir(path.dirname(dest), { recursive: true });
      await fs.copyFile(file.source, dest);
    }
  }
  return copied;
}

function normalizeVegetationEntry(entry, manifest) {
  const lods = entry.lods ?? {};
  const toAssetModelPath = (value) => {
    if (!value) return undefined;
    return value.startsWith("models/") ? value : path.posix.join("models", value);
  };
  const model = toAssetModelPath(lods.lod0 ?? lods.default ?? entry.model);
  const lod1Model = toAssetModelPath(lods.lod1);
  const lod2Model = toAssetModelPath(lods.lod2);

  return {
    id: entry.id,
    model,
    ...(lod1Model ? { lod1Model } : {}),
    ...(lod2Model ? { lod2Model } : {}),
    category: entry.category ?? "tree",
    baseScale: entry.baseScale ?? 1,
    scaleVariation: entry.scaleVariation ?? [0.9, 1.1],
    randomRotation: entry.randomRotation ?? true,
    weight: entry.weight ?? 1,
    ...(entry.minSlope !== undefined ? { minSlope: entry.minSlope } : {}),
    ...(entry.maxSlope !== undefined ? { maxSlope: entry.maxSlope } : {}),
    alignToNormal: entry.alignToNormal ?? true,
    yOffset: entry.yOffset ?? 0,
    lod: {
      lod1Distance: 70,
      lod2Distance: 140,
      imposterDistance: 240,
      fadeDistance: 420,
    },
    hill: {
      manifest:
        manifest.source?.slug ??
        manifest.source?.catalog_slug ??
        manifest.product?.title ??
        "unknown",
      visibility: manifest.licensing?.visibility,
      license: manifest.licensing?.license,
      lod3Model: toAssetModelPath(lods.lod3),
    },
  };
}

function mergeVegetationManifest(base, entries) {
  const manifest = base && Array.isArray(base.assets) ? base : { version: 1, assets: [] };
  const byId = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  for (const entry of entries) {
    byId.set(entry.id, entry);
  }
  return {
    ...manifest,
    description:
      manifest.description ??
      "Vegetation asset definitions for procedural world generation",
    assets: Array.from(byId.values()).sort((a, b) => a.id.localeCompare(b.id)),
  };
}

function buildHillLayer(assetIds) {
  return {
    category: "tree",
    density: 4,
    assets: assetIds,
    minSpacing: 14,
    clustering: true,
    clusterSize: 3,
    noiseScale: 0.025,
    noiseThreshold: 0.42,
    avoidWater: true,
    avoidSteepSlopes: true,
    minHeight: 6,
  };
}

function mergeBiomeLayers(biomes, targetBiomeIds, assetIds) {
  if (!Array.isArray(biomes)) return biomes;
  const targets = new Set(targetBiomeIds);
  const hillLayer = buildHillLayer(assetIds);

  return biomes.map((biome) => {
    if (!targets.has(biome.id)) return biome;
    const vegetation = biome.vegetation ?? { enabled: true, layers: [] };
    const layers = Array.isArray(vegetation.layers) ? vegetation.layers : [];
    const existingIndex = layers.findIndex(
      (layer) => layer.category === "tree" && layer.assets?.some((id) => assetIds.includes(id)),
    );
    const nextLayers =
      existingIndex >= 0
        ? layers.map((layer, index) => (index === existingIndex ? hillLayer : layer))
        : [...layers, hillLayer];

    return {
      ...biome,
      vegetation: {
        ...vegetation,
        enabled: true,
        layers: nextLayers,
      },
    };
  });
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const manifest = await readJson(args.manifest);
  const assetsRoot = path.resolve(args.assetsRoot);
  const manifestsDir = path.join(assetsRoot, "manifests");
  const vegetationPath = path.join(manifestsDir, "vegetation.json");
  const biomesPath = path.join(manifestsDir, "biomes.json");

  await seedJsonIfMissing(
    vegetationPath,
    args.seedVegetationUrl,
    "vegetation.json",
    args.dryRun,
  );
  await seedJsonIfMissing(biomesPath, args.seedBiomesUrl, "biomes.json", args.dryRun);

  const vegetationPatches = getHyperscapePatches(manifest, "vegetation");
  const vegetationEntries = vegetationPatches.map((entry) =>
    normalizeVegetationEntry(entry, manifest),
  );
  const assetIds = vegetationEntries.map((entry) => entry.id);

  const baseVegetation = (await pathExists(vegetationPath))
    ? await readJson(vegetationPath)
    : { version: 1, assets: [] };
  const nextVegetation = mergeVegetationManifest(baseVegetation, vegetationEntries);
  await writeJson(vegetationPath, nextVegetation, args.dryRun);

  let biomesPatched = false;
  if (await pathExists(biomesPath)) {
    const baseBiomes = await readJson(biomesPath);
    const nextBiomes = mergeBiomeLayers(baseBiomes, args.biomes, assetIds);
    await writeJson(biomesPath, nextBiomes, args.dryRun);
    biomesPatched = true;
  }

  const manifestCopyPath = path.join(
    manifestsDir,
    "hill",
    `${manifest.source?.slug ?? manifest.source?.catalog_slug ?? "hill_asset"}.unified_manifest.json`,
  );
  await writeJson(manifestCopyPath, manifest, args.dryRun);

  const copied = args.copyFiles
    ? await copyAssetFiles(manifest, assetsRoot, args.dryRun)
    : [];

  console.log(
    JSON.stringify(
      {
        manifest: args.manifest,
        assetsRoot,
        vegetationEntries: vegetationEntries.length,
        copiedFiles: copied.length,
        vegetationPath,
        biomesPath: biomesPatched ? biomesPath : null,
        patchedBiomes: biomesPatched ? args.biomes : [],
        dryRun: args.dryRun,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
