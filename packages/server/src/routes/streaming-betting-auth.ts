import { timingSafeEqual } from "node:crypto";

export function hasValidBettingFeedToken(
  requiredToken: string,
  providedToken: string | null | undefined,
): boolean {
  const expected = requiredToken.trim();
  const presented = providedToken?.trim() ?? "";
  if (!expected || !presented) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, "utf8");
  const presentedBytes = Buffer.from(presented, "utf8");
  if (expectedBytes.length !== presentedBytes.length) {
    return false;
  }

  return timingSafeEqual(expectedBytes, presentedBytes);
}
