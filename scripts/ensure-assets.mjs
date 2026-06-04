#!/usr/bin/env node
/**
 * Ensure Assets Script
 *
 * Clones the HyperscapeAI/assets repo into packages/server/world/assets/
 * so the server has access to manifests, models, audio, and textures.
 *
 * Behavior:
 * - CI/Production: Shallow clone without LFS (manifests only, ~fast)
 * - Development: Full clone with LFS pull (~200MB binary assets)
 *
 * The assets directory is gitignored — this script is the sole mechanism
 * for populating it.
 */

import { existsSync, readdirSync, rmSync, mkdirSync, readFileSync } from "fs";
import { execSync } from "child_process";
import { fileURLToPath } from "url";
import path from "path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(__dirname, "..");
const assetsDir = path.join(rootDir, "packages/server/world/assets");
const assetsRepo = "https://github.com/HyperscapeAI/assets.git";

// Local CDN URL for development
const LOCAL_CDN_URL = "http://localhost:8080";

function dirHasNonHiddenFiles(dir) {
  if (!existsSync(dir)) return false;
  try {
    const files = readdirSync(dir);
    return files.some((f) => !f.startsWith("."));
  } catch {
    return false;
  }
}

function hasManifests(dir) {
  return dirHasNonHiddenFiles(path.join(dir, "manifests"));
}

function hasFullAssets(dir) {
  // Local development needs the full binary assets (world/, models/, audio/, etc).
  // Manifests-only is treated as "missing" so we auto-download real assets.
  const hasWorld = dirHasNonHiddenFiles(path.join(dir, "world"));
  const hasModels = dirHasNonHiddenFiles(path.join(dir, "models"));
  return hasWorld && hasModels;
}

function isLfsPointer(file) {
  if (!existsSync(file)) return false;
  const header = readFileSync(file, { encoding: "utf8", flag: "r" }).slice(
    0,
    64,
  );
  return header.startsWith("version https://git-lfs.github.com/spec/v1");
}

function hasHydratedBinaryAssets(dir) {
  const probes = [
    path.join(dir, "emotes/emote-idle.glb"),
    path.join(dir, "models/npcs/shopkeeper/shopkeeper.vrm"),
    path.join(dir, "models/stations/bank-chest/bank-chest.glb"),
  ];

  return probes.every((file) => existsSync(file) && !isLfsPointer(file));
}

function isGitRepo(dir) {
  return existsSync(path.join(dir, ".git"));
}

function checkGitLfs() {
  try {
    execSync("git lfs version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

function printLfsInstallInstructions() {
  console.error(`
⚠️  Git LFS is required for game assets (local development only)

Install it for your platform:
  macOS:   brew install git-lfs
  Ubuntu:  sudo apt install git-lfs
  Windows: Download from https://git-lfs.com

Then re-run:
  bun install

Note: In CI/production, manifests are committed to the repo.
`);
}

function isCI() {
  // Check for common CI/deployment environment variables
  return !!(
    process.env.CI ||
    process.env.RAILWAY_ENVIRONMENT ||
    process.env.RAILWAY_SERVICE_ID ||
    process.env.VERCEL ||
    process.env.NETLIFY ||
    process.env.GITHUB_ACTIONS ||
    process.env.GITLAB_CI ||
    process.env.CIRCLECI ||
    process.env.DOCKER_BUILD ||
    process.env.SKIP_ASSETS
  );
}

async function main() {
  console.log("📦 Checking game assets...");

  const ci = isCI();

  // In CI: only need manifests (no binary assets), but still must clone
  if (ci && hasManifests(assetsDir)) {
    console.log("✅ Assets manifests already present (CI)");
    return;
  }

  // In dev: check for full assets (models, world data, etc.)
  if (!ci && hasFullAssets(assetsDir)) {
    // Ensure LFS objects are present if this is a git repo (safe no-op if up-to-date)
    if (isGitRepo(assetsDir)) {
      execSync(`git -C "${assetsDir}" lfs pull`, { stdio: "inherit" });
      if (hasHydratedBinaryAssets(assetsDir)) {
        console.log("✅ Assets already present (full asset pack found)");
        return;
      }
      console.log("🧹 Removing assets directory with unresolved LFS pointers...");
      rmSync(assetsDir, { recursive: true, force: true });
    } else if (hasHydratedBinaryAssets(assetsDir)) {
      console.log("✅ Assets already present (full asset pack found)");
      return;
    } else {
      console.log("🧹 Removing partial assets directory with LFS pointers...");
      rmSync(assetsDir, { recursive: true, force: true });
    }
  }

  // Dev environments need git-lfs for binary assets
  if (!ci) {
    if (!checkGitLfs()) {
      printLfsInstallInstructions();
      process.exit(1);
    }

    // Initialize git-lfs (safe to run multiple times, ignore errors if already set up)
    try {
      execSync("git lfs install", { stdio: "ignore" });
    } catch {
      // May fail if already initialized - that's ok
    }
  }

  const label = ci ? "manifests" : "full asset pack (~200MB)";
  console.log(`📥 Downloading game assets (${label})...`);
  console.log(`   From: ${assetsRepo}`);
  console.log(`   To: ${assetsDir}`);

  try {
    // Ensure parent directory exists
    const parentDir = path.dirname(assetsDir);
    mkdirSync(parentDir, { recursive: true });

    // If we have a partial/manifest-only directory, remove it so clone succeeds.
    if (existsSync(assetsDir) && !isGitRepo(assetsDir)) {
      console.log("🧹 Removing partial assets directory...");
      rmSync(assetsDir, { recursive: true, force: true });
    }

    if (!existsSync(assetsDir) || !isGitRepo(assetsDir)) {
      // Clone with depth 1 for faster download
      // CI: GIT_LFS_SKIP_SMUDGE=1 skips binary LFS objects (only need manifests)
      execSync(`git clone --depth 1 ${assetsRepo} "${assetsDir}"`, {
        stdio: "inherit",
        cwd: rootDir,
        env: ci ? { ...process.env, GIT_LFS_SKIP_SMUDGE: "1" } : process.env,
      });
    }

    // Dev: pull LFS binary assets (models, audio, textures)
    if (!ci) {
      execSync(`git -C "${assetsDir}" lfs pull`, { stdio: "inherit" });
      if (!hasHydratedBinaryAssets(assetsDir)) {
        throw new Error("Downloaded assets still contain Git LFS pointers");
      }
    }

    console.log("✅ Assets downloaded successfully!");
    if (!ci) {
      console.log("   Run 'bun run assets:sync' to update assets later");
    }
  } catch (error) {
    console.error("❌ Failed to download assets:", error);
    console.error("   You can manually clone:");
    console.error(`   git clone ${assetsRepo} ${assetsDir}`);
    process.exit(1);
  }
}

main();
