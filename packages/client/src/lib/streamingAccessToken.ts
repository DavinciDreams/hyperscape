type StreamingAccessTokenResolution = {
  token: string | null;
  nextUrl: string | null;
};

let cachedStreamingAccessToken: string | null | undefined;

export function resolveStreamingAccessTokenFromHref(
  href: string,
): StreamingAccessTokenResolution {
  const url = new URL(href);
  const searchParams = new URLSearchParams(url.search);
  const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));

  const token =
    hashParams.get("streamToken")?.trim() ||
    searchParams.get("streamToken")?.trim() ||
    null;

  const shouldScrubSecrets =
    searchParams.has("streamToken") ||
    hashParams.has("streamToken") ||
    searchParams.has("sessionToken") ||
    hashParams.has("sessionToken");

  if (!shouldScrubSecrets) {
    return {
      token,
      nextUrl: null,
    };
  }

  searchParams.delete("streamToken");
  hashParams.delete("streamToken");
  searchParams.delete("sessionToken");
  hashParams.delete("sessionToken");

  const nextSearch = searchParams.toString();
  const nextHash = hashParams.toString();
  const nextUrl = `${url.pathname}${nextSearch ? `?${nextSearch}` : ""}${nextHash ? `#${nextHash}` : ""}`;

  return {
    token,
    nextUrl,
  };
}

export function primeStreamingAccessTokenFromWindow(
  targetWindow: Window,
): string | null {
  if (cachedStreamingAccessToken !== undefined) {
    return cachedStreamingAccessToken;
  }

  const resolved = resolveStreamingAccessTokenFromHref(
    targetWindow.location.href,
  );
  cachedStreamingAccessToken = resolved.token;

  if (resolved.nextUrl) {
    targetWindow.history.replaceState(
      targetWindow.history.state,
      "",
      resolved.nextUrl,
    );
  }

  return cachedStreamingAccessToken;
}

export function getStreamingAccessToken(): string | null {
  if (cachedStreamingAccessToken !== undefined) {
    return cachedStreamingAccessToken;
  }

  if (typeof window === "undefined") {
    return null;
  }

  return primeStreamingAccessTokenFromWindow(window);
}

export function resetStreamingAccessTokenForTests(): void {
  cachedStreamingAccessToken = undefined;
}
