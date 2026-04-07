function stripTokenFromSegment(segment: string): string {
  return segment
    .split("&")
    .map((part) => part.trim())
    .filter((part) => part.length > 0 && !part.startsWith("streamToken="))
    .join("&");
}

export function redactStreamingSecretsFromUrl(rawUrl: string): string {
  try {
    const url = new URL(rawUrl);
    url.searchParams.delete("streamToken");
    const hashParams = new URLSearchParams(url.hash.replace(/^#/, ""));
    hashParams.delete("streamToken");
    const normalizedHash = hashParams.toString();
    url.hash = normalizedHash ? `#${normalizedHash}` : "";
    return url.toString();
  } catch {
    const hashIndex = rawUrl.indexOf("#");
    const baseWithQuery = hashIndex >= 0 ? rawUrl.slice(0, hashIndex) : rawUrl;
    const rawHash = hashIndex >= 0 ? rawUrl.slice(hashIndex + 1) : "";
    const queryIndex = baseWithQuery.indexOf("?");
    const base =
      queryIndex >= 0 ? baseWithQuery.slice(0, queryIndex) : baseWithQuery;
    const rawQuery = queryIndex >= 0 ? baseWithQuery.slice(queryIndex + 1) : "";
    const sanitizedQuery = stripTokenFromSegment(rawQuery);
    const sanitizedHash = stripTokenFromSegment(rawHash);

    return `${base}${sanitizedQuery ? `?${sanitizedQuery}` : ""}${sanitizedHash ? `#${sanitizedHash}` : ""}`;
  }
}
