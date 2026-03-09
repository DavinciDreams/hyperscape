import { createHash } from "node:crypto";

export function resolveStreamingViewerAccessToken(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const explicitToken = (env.STREAMING_VIEWER_ACCESS_TOKEN || "").trim();
  if (explicitToken) {
    return explicitToken;
  }

  const jwtSecret = (env.JWT_SECRET || "").trim();
  if (!jwtSecret) {
    return "";
  }

  return createHash("sha256")
    .update("hyperscape-stream-viewer:")
    .update(jwtSecret)
    .digest("hex");
}
