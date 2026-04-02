function extractOrigin(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }

  try {
    const url = new URL(value.trim());
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function normalizeEmbedOrigin(
  value: string | null | undefined,
): string | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim();
  if (!normalized || normalized === "*" || normalized === "null") {
    return null;
  }

  try {
    const url = new URL(normalized);
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null;
    }
    if (url.pathname !== "/" || url.search || url.hash) {
      return null;
    }
    return url.origin;
  } catch {
    return null;
  }
}

export function parseEmbedAllowedOrigins(
  rawValue: string | null | undefined,
): string[] {
  const trustedOrigins = new Set<string>();

  for (const candidate of (rawValue || "").split(",")) {
    const normalizedOrigin = normalizeEmbedOrigin(candidate);
    if (normalizedOrigin) {
      trustedOrigins.add(normalizedOrigin);
    }
  }

  return [...trustedOrigins];
}

export function resolveTrustedEmbedOrigins(params: {
  currentOrigin: string;
  publicAppUrl?: string | null;
  embedAllowedOrigins?: string | null;
}): string[] {
  const trustedOrigins = new Set<string>();
  const currentOrigin = normalizeEmbedOrigin(params.currentOrigin);
  if (currentOrigin) {
    trustedOrigins.add(currentOrigin);
  }

  const publicAppOrigin = extractOrigin(params.publicAppUrl);
  if (publicAppOrigin) {
    trustedOrigins.add(publicAppOrigin);
  }

  for (const origin of parseEmbedAllowedOrigins(params.embedAllowedOrigins)) {
    trustedOrigins.add(origin);
  }

  return [...trustedOrigins];
}

const BASE_CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://auth.privy.io https://*.privy.io https://static.cloudflareinsights.com https://*.up.railway.app blob:",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "img-src 'self' data: https: blob:",
  "font-src 'self' data: https://fonts.gstatic.com",
  "connect-src 'self' wss: https: ws://localhost:* http://localhost:* data: blob:",
  "frame-src 'self' https://auth.privy.io https://*.privy.io",
  "worker-src 'self' blob:",
  "media-src 'self' blob:",
];

function buildContentSecurityPolicy(
  frameAncestorsSources?: readonly string[],
): string {
  const directives = [...BASE_CONTENT_SECURITY_POLICY];
  if (frameAncestorsSources && frameAncestorsSources.length > 0) {
    directives.push(`frame-ancestors ${frameAncestorsSources.join(" ")}`);
  }
  return `${directives.join("; ")};`;
}

export function buildStreamFrameAncestors(
  embedAllowedOrigins: readonly string[],
): string[] {
  return ["'self'", ...embedAllowedOrigins];
}

export function buildPagesHeaders(params: {
  embedAllowedOrigins?: readonly string[];
}): string {
  const embedAllowedOrigins = params.embedAllowedOrigins ?? [];
  const streamFrameAncestors = buildStreamFrameAncestors(embedAllowedOrigins);
  const rootCsp = buildContentSecurityPolicy();
  const streamCsp = buildContentSecurityPolicy(streamFrameAncestors);

  return `/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  X-XSS-Protection: 1; mode=block
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(self), payment=(), usb=()
  Content-Security-Policy: ${rootCsp}

/stream
  ! X-Frame-Options
  Content-Security-Policy: ${streamCsp}

/stream.html
  ! X-Frame-Options
  Content-Security-Policy: ${streamCsp}

/assets/*
  Cache-Control: public, max-age=31536000, immutable

/images/*
  Cache-Control: public, max-age=86400

/*.js
  Cache-Control: public, max-age=31536000, immutable

/*.css
  Cache-Control: public, max-age=31536000, immutable

/*.woff2
  Cache-Control: public, max-age=31536000, immutable
`;
}
