/**
 * Security Headers Middleware
 * Adds standard security headers to all responses (OWASP recommended).
 */

import { Elysia } from "elysia";

/** Security header key-value pairs applied to every response. */
export const SECURITY_HEADERS: Record<string, string> = {
  // Prevent clickjacking
  "X-Frame-Options": "DENY",
  // Prevent MIME type sniffing
  "X-Content-Type-Options": "nosniff",
  // Enable browser XSS filter
  "X-XSS-Protection": "1; mode=block",
  // Referrer policy — only send origin on cross-origin requests
  "Referrer-Policy": "strict-origin-when-cross-origin",
  // Permissions policy — restrict browser features
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=()",
  // Content Security Policy — restrict resource loading
  "Content-Security-Policy":
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; " +
    "img-src 'self' data: blob: https:; " +
    "connect-src 'self' https: wss:; " +
    "font-src 'self' data:; " +
    "object-src 'none'; " +
    "base-uri 'self'; " +
    "frame-ancestors 'none'",
};

/** Additional production-only headers */
export const PRODUCTION_HEADERS: Record<string, string> = {
  "Strict-Transport-Security": "max-age=31536000; includeSubDomains",
};

export const securityHeaders = new Elysia({
  name: "security-headers",
}).onAfterHandle({ as: "global" }, ({ set }) => {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    set.headers[key] = value;
  }
  if (process.env.NODE_ENV === "production") {
    for (const [key, value] of Object.entries(PRODUCTION_HEADERS)) {
      set.headers[key] = value;
    }
  }
});
