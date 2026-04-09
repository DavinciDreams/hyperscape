import { describe, expect, it } from "vitest";
import {
  summarizeCloudflareLiveWebhook,
  verifyCloudflareWebhookSecret,
} from "../../../src/streaming/cloudflare-authority.js";

describe("cloudflare-authority", () => {
  it("verifies the Cloudflare notification secret header", () => {
    expect(
      verifyCloudflareWebhookSecret(
        {
          "cf-webhook-auth": "super-secret",
        },
        "super-secret",
      ),
    ).toBe(true);
    expect(
      verifyCloudflareWebhookSecret(
        {
          "cf-webhook-auth": "wrong-secret",
        },
        "super-secret",
      ),
    ).toBe(false);
  });

  it("summarizes live webhook payloads into webhook and lifecycle snapshots", () => {
    const summary = summarizeCloudflareLiveWebhook({
      payload: {
        alert_type: "stream_live_input.disconnected",
        name: "Stream Live Input Disconnected",
        event: {
          input_id: "live-input-123",
          video_id: "video-456",
          timestamp: "2026-04-09T02:00:00.000Z",
          error_code: "publish_disconnected",
          error_message: "Publisher disconnected unexpectedly",
        },
      },
      receivedAt: 1_234_567,
    });

    expect(summary.webhook).toEqual({
      eventType: "stream_live_input.disconnected",
      eventName: "Stream Live Input Disconnected",
      liveInputId: "live-input-123",
      videoId: "video-456",
      occurredAt: Date.parse("2026-04-09T02:00:00.000Z"),
      receivedAt: 1_234_567,
    });
    expect(summary.lifecycle).toEqual({
      eventType: "stream_live_input.disconnected",
      eventName: "Stream Live Input Disconnected",
      liveInputId: "live-input-123",
      videoId: "video-456",
      status: "disconnected",
      errorCode: "publish_disconnected",
      errorMessage: "Publisher disconnected unexpectedly",
      occurredAt: Date.parse("2026-04-09T02:00:00.000Z"),
      receivedAt: 1_234_567,
    });
  });
});
