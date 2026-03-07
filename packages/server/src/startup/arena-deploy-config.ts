function hasConfiguredEnv(env: NodeJS.ProcessEnv, name: string): boolean {
  return typeof env[name] === "string" && env[name]!.trim() !== "";
}

export interface ArenaDeployValidation {
  missing: string[];
  warnings: string[];
}

export function validateArenaDeployEnv(
  env: NodeJS.ProcessEnv,
): ArenaDeployValidation {
  const missing: string[] = [];
  const warnings: string[] = [];
  const arenaEnabled =
    env.DUEL_BETTING_ENABLED === "true" ||
    env.DUEL_MARKET_MAKER_ENABLED === "true";

  if (!arenaEnabled) {
    return { missing, warnings };
  }

  const requiredSolanaEnv = [
    "SOLANA_RPC_URL",
    "SOLANA_WS_URL",
    "SOLANA_ARENA_MARKET_PROGRAM_ID",
    "SOLANA_GOLD_MINT",
  ] as const;

  for (const name of requiredSolanaEnv) {
    if (!hasConfiguredEnv(env, name)) {
      missing.push(name);
    }
  }

  if (!hasConfiguredEnv(env, "SOLANA_ARENA_AUTHORITY_SECRET")) {
    warnings.push("SOLANA_ARENA_AUTHORITY_SECRET");
  }

  const bscRpcConfigured =
    hasConfiguredEnv(env, "BSC_RPC_URL") ||
    hasConfiguredEnv(env, "VITE_BSC_RPC_URL");
  const bscClobConfigured =
    hasConfiguredEnv(env, "BSC_GOLD_CLOB_ADDRESS") ||
    hasConfiguredEnv(env, "VITE_BSC_GOLD_CLOB_ADDRESS");
  if (bscRpcConfigured !== bscClobConfigured) {
    warnings.push(
      "BSC_RPC_URL and BSC_GOLD_CLOB_ADDRESS (both required for BSC external points verification)",
    );
  }

  return { missing, warnings };
}
