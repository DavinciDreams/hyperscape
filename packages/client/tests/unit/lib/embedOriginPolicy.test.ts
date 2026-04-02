import { describe, expect, it } from "vitest";
import {
  buildPagesHeaders,
  parseEmbedAllowedOrigins,
} from "../../../src/lib/embedOriginPolicy";

describe("embedOriginPolicy", () => {
  it("parses an explicit origin allowlist and drops invalid entries", () => {
    expect(
      parseEmbedAllowedOrigins(
        "https://bsc.example.com, https://sol.example.com, *, null, https://bsc.example.com/path",
      ),
    ).toEqual(["https://bsc.example.com", "https://sol.example.com"]);
  });

  it("builds route-specific Pages headers for the stream surface", () => {
    const headers = buildPagesHeaders({
      embedAllowedOrigins: [
        "https://enoomian-staging.hyperbet-bsc-enoomian-staging.pages.dev",
        "https://enoomian-staging.hyperbet-solana-enoomian-staging.pages.dev",
      ],
    });

    expect(headers).toContain("/*");
    expect(headers).toContain("X-Frame-Options: DENY");
    expect(headers).toContain("/stream");
    expect(headers).toContain("/stream.html");
    expect(headers).toContain("! X-Frame-Options");
    expect(headers).toContain(
      "frame-ancestors 'self' https://enoomian-staging.hyperbet-bsc-enoomian-staging.pages.dev https://enoomian-staging.hyperbet-solana-enoomian-staging.pages.dev",
    );
  });
});
