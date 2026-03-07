import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import * as anchor from "@coral-xyz/anchor";

function expandHome(filePath: string): string {
  if (!filePath.startsWith("~/")) return filePath;
  return path.join(os.homedir(), filePath.slice(2));
}

function resolveAnchorWalletPath(): string {
  const candidates = [
    process.env.ANCHOR_WALLET,
    "~/.config/solana/hyperscape-keys/deployer.json",
    "~/.config/solana/id.json",
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => expandHome(value));

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return candidates[0] ?? path.join(os.homedir(), ".config/solana/id.json");
}

export function configureAnchorTests(): anchor.AnchorProvider {
  process.env.ANCHOR_WALLET = resolveAnchorWalletPath();
  process.env.ANCHOR_PROVIDER_URL =
    process.env.ANCHOR_PROVIDER_URL || "http://127.0.0.1:8899";

  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);
  return provider;
}
