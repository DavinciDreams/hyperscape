import { afterEach, describe, expect, it } from "vitest";
import {
  isConfiguredPrivyAppId,
  getPublicRuntimeEnv,
  normalizePublicEnvValue,
  resolvePublicEnvValue,
  resolvePrivyAppId,
} from "../../../src/lib/publicEnv";

describe("publicEnv", () => {
  afterEach(() => {
    if (typeof window !== "undefined") {
      delete (window as Window & { env?: unknown }).env;
    }
  });

  it("prefers runtime values over build-time values", () => {
    expect(resolvePublicEnvValue("runtime-value", "build-value")).toBe(
      "runtime-value",
    );
  });

  it("falls back to build-time values when runtime is missing", () => {
    expect(resolvePublicEnvValue(undefined, "build-value")).toBe("build-value");
    expect(resolvePublicEnvValue("undefined", "build-value")).toBe(
      "build-value",
    );
  });

  it("normalizes empty and sentinel values", () => {
    expect(normalizePublicEnvValue("")).toBeUndefined();
    expect(normalizePublicEnvValue("   ")).toBeUndefined();
    expect(normalizePublicEnvValue("undefined")).toBeUndefined();
    expect(normalizePublicEnvValue("null")).toBeUndefined();
    expect(normalizePublicEnvValue(" cmgk-app-id ")).toBe("cmgk-app-id");
  });

  it("validates Privy app ids", () => {
    expect(isConfiguredPrivyAppId("cmgk4zu56005kjj0bcaae0rei")).toBe(true);
    expect(isConfiguredPrivyAppId("your-privy-app-id")).toBe(false);
    expect(isConfiguredPrivyAppId("")).toBe(false);
  });

  it("reads the Privy app id from runtime env", () => {
    (window as Window & { env?: Record<string, string> }).env = {
      PUBLIC_PRIVY_APP_ID: "cmgk4zu56005kjj0bcaae0rei",
    };

    expect(getPublicRuntimeEnv()?.PUBLIC_PRIVY_APP_ID).toBe(
      "cmgk4zu56005kjj0bcaae0rei",
    );
    expect(resolvePrivyAppId("")).toBe("cmgk4zu56005kjj0bcaae0rei");
  });
});
