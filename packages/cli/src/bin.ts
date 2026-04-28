#!/usr/bin/env node
/**
 * `hyperforge` binary entrypoint.
 *
 * Parses argv, calls `dispatch`, prints the result, exits with the
 * right code. Pure plumbing — all logic lives in `dispatch.ts` and
 * the per-command modules so it can be unit-tested without spawning
 * a process.
 */

import { dispatch } from "./dispatch.js";
import { parseArgs } from "./parseArgs.js";

function main(): void {
  const args = parseArgs(process.argv.slice(2));
  const result = dispatch(args);
  if (result.exitCode === 0) {
    process.stdout.write(result.text + "\n");
  } else {
    process.stderr.write(result.text + "\n");
  }
  process.exit(result.exitCode);
}

main();
