export function getDefaultPublicWsUrl(): string {
  const host = process.env.SERVER_HOST || "localhost";
  const port =
    process.env.UWS_ENABLED === "false"
      ? process.env.PORT || "5555"
      : process.env.UWS_PORT || "5556";

  return `ws://${host}:${port}/ws`;
}
