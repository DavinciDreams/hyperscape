#!/usr/bin/env node
/**
 * `hyperforge-plugin` binary shim.
 *
 * Resolves the built CLI entry in `dist/cli.js` and hands it
 * `process.argv.slice(2)` plus real stdio writers. All logic lives
 * in `src/cli.ts` — this file is pure plumbing.
 */
import { runCli } from "../dist/cli.js";

const exitCode = await runCli(process.argv.slice(2), {
  stdout: (chunk) => process.stdout.write(chunk),
  stderr: (chunk) => process.stderr.write(chunk),
  cwd: () => process.cwd(),
});

process.exit(exitCode);
