import { rmSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const targets = ["dist", "tsconfig.tsbuildinfo"];

for (const target of targets) {
  rmSync(resolve(root, target), {
    recursive: true,
    force: true,
    maxRetries: 10,
    retryDelay: 100,
  });
}
