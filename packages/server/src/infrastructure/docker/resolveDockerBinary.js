import fs from "node:fs";
import os from "node:os";

/**
 * Resolve the docker binary path once so server code and maintenance scripts
 * do not drift on macOS versus Linux installations.
 *
 * @returns {string}
 */
export function resolveDockerBinary() {
  const candidates = [
    process.env.DOCKER_BIN,
    "/usr/local/bin/docker",
    "/opt/homebrew/bin/docker",
    "/Applications/Docker.app/Contents/Resources/bin/docker",
    `${os.homedir()}/.docker/bin/docker`,
    "docker",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate === "docker") {
      return candidate;
    }
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch {
      // keep searching
    }
  }

  return "docker";
}
