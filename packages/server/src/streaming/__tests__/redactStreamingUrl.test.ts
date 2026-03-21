import { describe, expect, it } from "vitest";
import { redactStreamingSecretsFromUrl } from "../redactStreamingUrl";

describe("redactStreamingSecretsFromUrl", () => {
  it("removes streamToken from query strings and hash fragments", () => {
    expect(
      redactStreamingSecretsFromUrl(
        "https://example.com/stream?page=1&streamToken=query-secret#streamToken=hash-secret&mode=stream",
      ),
    ).toBe("https://example.com/stream?page=1#mode=stream");
  });

  it("leaves unrelated URL parts untouched", () => {
    expect(
      redactStreamingSecretsFromUrl(
        "https://example.com/stream?page=1#mode=stream",
      ),
    ).toBe("https://example.com/stream?page=1#mode=stream");
  });
});
