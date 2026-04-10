import { describe, it, expect } from "vitest";
import {
  SECURITY_HEADERS,
  PRODUCTION_HEADERS,
} from "../../../server/middleware/securityHeaders";

describe("securityHeaders — exported header constants", () => {
  it("includes X-Frame-Options: DENY", () => {
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
  });

  it("includes X-Content-Type-Options: nosniff", () => {
    expect(SECURITY_HEADERS["X-Content-Type-Options"]).toBe("nosniff");
  });

  it("includes X-XSS-Protection", () => {
    expect(SECURITY_HEADERS["X-XSS-Protection"]).toBe("1; mode=block");
  });

  it("includes Referrer-Policy", () => {
    expect(SECURITY_HEADERS["Referrer-Policy"]).toBe(
      "strict-origin-when-cross-origin",
    );
  });

  it("includes Permissions-Policy restricting dangerous features", () => {
    const pp = SECURITY_HEADERS["Permissions-Policy"];
    expect(pp).toContain("camera=()");
    expect(pp).toContain("microphone=()");
    expect(pp).toContain("geolocation=()");
    expect(pp).toContain("payment=()");
  });

  it("includes Content-Security-Policy with secure defaults", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("CSP allows necessary sources for the app", () => {
    const csp = SECURITY_HEADERS["Content-Security-Policy"];
    expect(csp).toContain("connect-src 'self' https: wss:");
    expect(csp).toContain("img-src 'self' data: blob: https:");
    expect(csp).toContain("font-src 'self' data:");
  });

  it("does not include HSTS in base headers (production-only)", () => {
    expect(SECURITY_HEADERS["Strict-Transport-Security"]).toBeUndefined();
  });
});

describe("securityHeaders — production headers", () => {
  it("includes HSTS with long max-age", () => {
    expect(PRODUCTION_HEADERS["Strict-Transport-Security"]).toBe(
      "max-age=31536000; includeSubDomains",
    );
  });

  it("HSTS max-age is at least 1 year (31536000 seconds)", () => {
    const hsts = PRODUCTION_HEADERS["Strict-Transport-Security"];
    const match = hsts.match(/max-age=(\d+)/);
    expect(match).not.toBeNull();
    expect(parseInt(match![1], 10)).toBeGreaterThanOrEqual(31536000);
  });
});

describe("securityHeaders — completeness", () => {
  it("has all OWASP recommended headers", () => {
    const required = [
      "X-Frame-Options",
      "X-Content-Type-Options",
      "Content-Security-Policy",
      "Referrer-Policy",
    ];
    for (const header of required) {
      expect(SECURITY_HEADERS[header]).toBeDefined();
    }
  });

  it("frame-ancestors in CSP is consistent with X-Frame-Options", () => {
    // Both should deny framing
    expect(SECURITY_HEADERS["X-Frame-Options"]).toBe("DENY");
    expect(SECURITY_HEADERS["Content-Security-Policy"]).toContain(
      "frame-ancestors 'none'",
    );
  });
});
