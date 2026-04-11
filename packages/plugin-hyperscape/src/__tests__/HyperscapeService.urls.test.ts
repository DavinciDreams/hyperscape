import { afterEach, describe, expect, it, vi } from "vitest";
import {
  resolveDefaultHyperscapeServerUrl,
  resolveHyperscapeApiBaseUrl,
} from "../services/HyperscapeService.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("HyperscapeService URL resolution", () => {
  it("defaults local runtime sockets to the dedicated uWS port", () => {
    vi.stubEnv("PORT", "5555");
    vi.stubEnv("UWS_PORT", "5556");
    vi.stubEnv("UWS_ENABLED", undefined);
    vi.stubEnv("HYPERSCAPE_SERVER_URL", undefined);
    vi.stubEnv("PUBLIC_WS_URL", undefined);

    expect(resolveDefaultHyperscapeServerUrl()).toBe("ws://localhost:5556/ws");
  });

  it("defaults production runtime sockets to Railway", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("HYPERSCAPE_SERVER_URL", undefined);
    vi.stubEnv("PUBLIC_WS_URL", undefined);

    expect(resolveDefaultHyperscapeServerUrl()).toBe(
      "wss://hyperscape-production.up.railway.app/ws",
    );
  });

  it("falls back to the HTTP port when uWS is disabled", () => {
    vi.stubEnv("PORT", "6001");
    vi.stubEnv("UWS_PORT", "7777");
    vi.stubEnv("UWS_ENABLED", "false");
    vi.stubEnv("HYPERSCAPE_SERVER_URL", undefined);
    vi.stubEnv("PUBLIC_WS_URL", undefined);

    expect(resolveDefaultHyperscapeServerUrl()).toBe("ws://localhost:6001/ws");
  });

  it("maps the dedicated local ws port back to the HTTP API port", () => {
    vi.stubEnv("PORT", "5555");
    vi.stubEnv("UWS_PORT", "5556");
    vi.stubEnv("UWS_ENABLED", undefined);

    expect(resolveHyperscapeApiBaseUrl("ws://localhost:5556/ws")).toBe(
      "http://localhost:5555",
    );
  });

  it("keeps remote deployments on the same host when deriving API URLs", () => {
    vi.stubEnv("PORT", "5555");
    vi.stubEnv("UWS_PORT", "5556");
    vi.stubEnv("UWS_ENABLED", undefined);

    expect(resolveHyperscapeApiBaseUrl("wss://hyperscape.gg/ws")).toBe(
      "https://hyperscape.gg",
    );
  });
});
