import { createPublicKey } from "crypto";
import jsonwebtoken, { type Jwt, type JwtPayload } from "jsonwebtoken";
import { verifyJWT } from "../../shared/utils.js";

type VerifiedAuthToken = {
  userId: string;
  issuer: "hyperscape" | "auth0";
};

type JwksKey = Record<string, unknown> & {
  kid?: string;
  alg?: string;
  use?: string;
};

type JwksResponse = {
  keys?: JwksKey[];
};

const AUTH0_JWKS_CACHE_MS = 60 * 60 * 1000;
const auth0PemCache = new Map<string, { pem: string; expiresAt: number }>();

function getBearerToken(authorization: string | undefined): string | null {
  if (!authorization?.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

function normalizeAuth0Domain(value: string | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed
    .replace(/^https?:\/\//i, "")
    .replace(/\/+$/, "")
    .trim();
}

function getAuth0Issuer(): string | null {
  const domain = normalizeAuth0Domain(
    process.env.AUTH0_DOMAIN || process.env.PUBLIC_AUTH0_DOMAIN,
  );
  return domain ? `https://${domain}/` : null;
}

function getAuth0Audience(): string | undefined {
  return (
    process.env.AUTH0_AUDIENCE || process.env.PUBLIC_AUTH0_AUDIENCE || undefined
  );
}

async function verifyHyperscapeToken(
  token: string,
): Promise<VerifiedAuthToken | null> {
  const payload = await verifyJWT(token);
  const userId = typeof payload?.userId === "string" ? payload.userId : null;
  return userId ? { userId, issuer: "hyperscape" } : null;
}

async function fetchAuth0Pem(issuer: string, kid: string): Promise<string> {
  const cacheKey = `${issuer}${kid}`;
  const cached = auth0PemCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.pem;
  }

  const response = await fetch(`${issuer}.well-known/jwks.json`);
  if (!response.ok) {
    throw new Error(`Auth0 JWKS request failed: HTTP ${response.status}`);
  }

  const jwks = (await response.json()) as JwksResponse;
  const jwk = (jwks.keys || []).find((key) => key.kid === kid);
  if (!jwk) {
    throw new Error(`Auth0 signing key ${kid} was not found`);
  }

  const keyInput = {
    key: jwk,
    format: "jwk",
  } as Parameters<typeof createPublicKey>[0];
  const pem = createPublicKey(keyInput)
    .export({ type: "spki", format: "pem" })
    .toString();
  auth0PemCache.set(cacheKey, {
    pem,
    expiresAt: Date.now() + AUTH0_JWKS_CACHE_MS,
  });
  return pem;
}

function verifyAuth0Jwt(
  token: string,
  pem: string,
  issuer: string,
): Promise<JwtPayload | null> {
  return new Promise((resolve) => {
    jsonwebtoken.verify(
      token,
      pem,
      {
        algorithms: ["RS256"],
        audience: getAuth0Audience(),
        issuer,
      },
      (error, decoded) => {
        if (error || !decoded || typeof decoded === "string") {
          resolve(null);
          return;
        }
        resolve(decoded as JwtPayload);
      },
    );
  });
}

async function verifyAuth0Token(
  token: string,
): Promise<VerifiedAuthToken | null> {
  const issuer = getAuth0Issuer();
  if (!issuer) return null;

  const decoded = jsonwebtoken.decode(token, { complete: true }) as Jwt | null;
  const kid =
    decoded?.header && typeof decoded.header.kid === "string"
      ? decoded.header.kid
      : null;
  if (!kid) return null;

  const pem = await fetchAuth0Pem(issuer, kid);
  const payload = await verifyAuth0Jwt(token, pem, issuer);
  const subject = typeof payload?.sub === "string" ? payload.sub : null;
  return subject ? { userId: subject, issuer: "auth0" } : null;
}

export async function verifyBearerAuthToken(
  authorization: string | undefined,
): Promise<VerifiedAuthToken | null> {
  const token = getBearerToken(authorization);
  if (!token) return null;

  const hyperscapeToken = await verifyHyperscapeToken(token);
  if (hyperscapeToken) return hyperscapeToken;

  return verifyAuth0Token(token);
}
