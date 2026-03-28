import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const requiredSelectors = [
  ".inset-0",
  ".top-4",
  ".gap-2",
  ".p-6",
  ".px-4",
  ".py-4",
  ".pr-5",
  ".h-48",
  ".bg-black\\/80",
  ".bg-white\\/20",
  ".border-white\\/20",
  ".shadow-2xl",
];

async function main() {
  const packageRoot = path.resolve(import.meta.dirname, "..");
  const assetsDir = path.join(packageRoot, "dist", "assets");
  const entries = await readdir(assetsDir, { withFileTypes: true });
  const cssFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".css"))
    .map((entry) => entry.name)
    .sort();

  if (cssFiles.length === 0) {
    throw new Error(`No built CSS artifacts found in ${assetsDir}`);
  }

  const cssContents = await Promise.all(
    cssFiles.map((file) => readFile(path.join(assetsDir, file), "utf8")),
  );
  const combinedCss = cssContents.join("\n");

  const versionInfo = {
    tailwindcss: await resolvePackageVersion("tailwindcss"),
    "@tailwindcss/postcss": await resolvePackageVersion("@tailwindcss/postcss"),
  };

  console.log("[verify:tailwind-artifact] Resolved package versions:");
  console.log(`- tailwindcss: ${versionInfo.tailwindcss}`);
  console.log(`- @tailwindcss/postcss: ${versionInfo["@tailwindcss/postcss"]}`);

  console.log("[verify:tailwind-artifact] CSS artifacts:");
  for (const file of cssFiles) {
    const filePath = path.join(assetsDir, file);
    const fileStat = await stat(filePath);
    console.log(`- ${file} (${fileStat.size} bytes)`);
  }

  const missingSelectors = requiredSelectors.filter(
    (selector) => !combinedCss.includes(selector),
  );

  if (missingSelectors.length > 0) {
    throw new Error(
      `Missing required CSS selectors: ${missingSelectors.join(", ")}`,
    );
  }

  console.log(
    `[verify:tailwind-artifact] Verified ${requiredSelectors.length} required selectors.`,
  );
}

async function resolvePackageVersion(packageName) {
  const resolvedEntry = require.resolve(packageName);
  const packageDir = findPackageRoot(path.dirname(resolvedEntry));
  const packageJson = JSON.parse(
    await readFile(path.join(packageDir, "package.json"), "utf8"),
  );
  return packageJson.version;
}

function findPackageRoot(startDir) {
  let currentDir = startDir;

  while (true) {
    const candidate = path.join(currentDir, "package.json");
    try {
      require(candidate);
      return currentDir;
    } catch {
      const parentDir = path.dirname(currentDir);
      if (parentDir === currentDir) {
        throw new Error(`Unable to find package.json above ${startDir}`);
      }
      currentDir = parentDir;
    }
  }
}

main().catch((error) => {
  console.error(
    `[verify:tailwind-artifact] ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exit(1);
});
