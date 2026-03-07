import { spawn } from "node:child_process";
import { resolve } from "node:path";

const ROOT = process.cwd();

function runStep(name, command, args, cwd) {
  return new Promise((resolveStep, rejectStep) => {
    console.log(`\n[deep-pass] ${name}`);
    console.log(`[deep-pass] cwd=${cwd}`);
    console.log(`[deep-pass] cmd=${command} ${args.join(" ")}`);
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", rejectStep);
    child.once("exit", (code, signal) => {
      if (signal) {
        rejectStep(new Error(`${name} terminated by signal ${signal}`));
        return;
      }
      if ((code ?? 1) !== 0) {
        rejectStep(new Error(`${name} failed with exit code ${code ?? 1}`));
        return;
      }
      resolveStep();
    });
  });
}

function runBestEffort(command, args, cwd) {
  return new Promise((resolveStep) => {
    const child = spawn(command, args, {
      cwd,
      stdio: "inherit",
      env: process.env,
    });
    child.once("error", () => resolveStep());
    child.once("exit", () => resolveStep());
  });
}

async function runStepWithRetries(
  name,
  command,
  args,
  cwd,
  retries,
  beforeRetry,
) {
  let attempt = 0;
  while (true) {
    try {
      await runStep(
        attempt === 0 ? name : `${name} (retry ${attempt})`,
        command,
        args,
        cwd,
      );
      return;
    } catch (error) {
      if (attempt >= retries) {
        throw error;
      }
      attempt += 1;
      console.warn(
        `[deep-pass] ${name} failed (${error.message}). Retrying after cleanup...`,
      );
      if (beforeRetry) {
        await beforeRetry();
      }
    }
  }
}

async function cleanupLocalSolanaValidator() {
  await runBestEffort(
    "bash",
    [
      "-lc",
      `
for port in 8899 8900; do
  pids=$(lsof -tiTCP:$port -sTCP:LISTEN || true)
  if [[ -n "$pids" ]]; then
    for pid in $pids; do
      kill "$pid" >/dev/null 2>&1 || true
    done
  fi
done
pkill -f "solana-test-validator --ledger .anchor/test-ledger" >/dev/null 2>&1 || true
pkill -f "anchor test" >/dev/null 2>&1 || true
sleep 1
`,
    ],
    ROOT,
  );
}

async function main() {
  const evmDir = resolve(ROOT, "packages/evm-contracts");
  const solanaDir = resolve(ROOT, "packages/gold-betting-demo/anchor");

  await runStep("EVM tests (includes fuzz)", "bun", ["run", "test"], evmDir);
  await runStep("EVM Foundry tests", "bun", ["run", "test:foundry"], evmDir);
  await runStep("EVM Slither analysis", "bun", ["run", "analyze:slither"], evmDir);
  await runStep(
    "EVM 100-wallet simulation",
    "bun",
    ["run", "simulate:localnet"],
    evmDir,
  );

  await cleanupLocalSolanaValidator();
  await runStep("Solana Clippy", "bun", ["run", "lint:rust"], solanaDir);
  await runStep("Solana Rust unit tests", "bun", ["run", "test:rust"], solanaDir);
  await runStep("Solana Rust audit", "bun", ["run", "audit"], solanaDir);
  await runStepWithRetries(
    "Solana tests (includes randomized invariants)",
    "bun",
    ["run", "test"],
    solanaDir,
    1,
    cleanupLocalSolanaValidator,
  );
  await cleanupLocalSolanaValidator();
  await runStepWithRetries(
    "Solana localnet simulation",
    "bun",
    ["run", "simulate:localnet"],
    solanaDir,
    1,
    cleanupLocalSolanaValidator,
  );
  await cleanupLocalSolanaValidator();

  await runStep(
    "Simulation report verification",
    "node",
    ["scripts/verify-betting-simulations.mjs"],
    ROOT,
  );

  console.log("\n[deep-pass] SUCCESS: all checks passed");
}

main().catch((error) => {
  console.error(`\n[deep-pass] FAILED: ${error.message}`);
  process.exit(1);
});
