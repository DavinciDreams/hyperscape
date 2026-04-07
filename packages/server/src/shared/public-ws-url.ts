const PRODUCTION_HYPERSCAPE_APP_URL = "https://hyperscape.club";
const PRODUCTION_HYPERSCAPE_API_URL =
  "https://hyperscape-production.up.railway.app";
const PRODUCTION_HYPERSCAPE_WS_URL =
  "wss://hyperscape-production.up.railway.app/ws";
const LOCAL_DEV_HYPERSCAPE_APP_URL = "http://localhost:3333";
const LOCAL_DEV_HYPERSCAPE_API_URL = "http://localhost:4001";

export function isProductionRuntime(nodeEnv = process.env.NODE_ENV): boolean {
  return nodeEnv === "production";
}

export function getDefaultPublicWsUrl(): string {
  if (isProductionRuntime()) {
    return PRODUCTION_HYPERSCAPE_WS_URL;
  }

  const host = process.env.SERVER_HOST || "localhost";
  const port =
    process.env.UWS_ENABLED === "false"
      ? process.env.PORT || "5555"
      : process.env.UWS_PORT || "5556";

  return `ws://${host}:${port}/ws`;
}

export function getDefaultElizaOsApiUrl(): string {
  return isProductionRuntime()
    ? PRODUCTION_HYPERSCAPE_API_URL
    : LOCAL_DEV_HYPERSCAPE_API_URL;
}

export function getDefaultPublicAppUrl(): string {
  return isProductionRuntime()
    ? PRODUCTION_HYPERSCAPE_APP_URL
    : LOCAL_DEV_HYPERSCAPE_APP_URL;
}
