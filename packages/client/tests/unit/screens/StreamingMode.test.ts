import { describe, it, expect } from "vitest";
import { shouldDismissStreamingLoading } from "../../../src/screens/StreamingMode";

describe("shouldDismissStreamingLoading", () => {
  it("allows dismissal once the server state is ready even before worldReady flips", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: false,
        terrainReady: true,
        hasStreamingState: true,
        needsCameraLock: false,
        cameraLocked: false,
      }),
    ).toBe(true);
  });

  it("keeps the overlay up until the camera is locked when required", () => {
    expect(
      shouldDismissStreamingLoading({
        connected: true,
        worldReady: true,
        terrainReady: true,
        hasStreamingState: true,
        needsCameraLock: true,
        cameraLocked: false,
      }),
    ).toBe(false);
  });
});
