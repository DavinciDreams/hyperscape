import type { PublicRuntimeEnv, StreamingWindow } from "./streamingWindow";

const INVALID_ENV_VALUES = new Set(["undefined", "null"]);

export function normalizePublicEnvValue(value?: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const trimmed = value.trim();
  if (!trimmed || INVALID_ENV_VALUES.has(trimmed)) {
    return undefined;
  }

  return trimmed;
}

export function getPublicRuntimeEnv(): PublicRuntimeEnv | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as StreamingWindow).env;
}

export function resolvePublicEnvValue(
  runtimeValue?: string,
  buildValue?: string,
): string {
  return (
    normalizePublicEnvValue(runtimeValue) ??
    normalizePublicEnvValue(buildValue) ??
    ""
  );
}

export function resolvePrivyAppId(buildValue?: string): string {
  return resolvePublicEnvValue(
    getPublicRuntimeEnv()?.PUBLIC_PRIVY_APP_ID,
    buildValue,
  );
}

export function isConfiguredPrivyAppId(appId: string): boolean {
  return appId.length > 0 && !appId.includes("your-privy-app-id");
}
