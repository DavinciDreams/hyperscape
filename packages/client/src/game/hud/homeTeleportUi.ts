import { getHomeTeleportCooldownMs } from "@hyperforge/shared";

export function readHomeTeleportRemainingMs(event?: unknown): number {
  const payload = event as { remainingMs?: number } | undefined;
  return payload?.remainingMs ?? 0;
}

export function getHomeTeleportCooldownProgress(
  cooldownRemaining: number,
): number {
  const cooldownMs = getHomeTeleportCooldownMs();
  return Math.max(
    0,
    Math.min(100, ((cooldownMs - cooldownRemaining) / cooldownMs) * 100),
  );
}
