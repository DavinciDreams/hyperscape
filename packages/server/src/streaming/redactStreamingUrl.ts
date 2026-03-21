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
    return rawUrl.replace(
      /([?#&])streamToken=[^&#]*/g,
      (_match, prefix: string) => (prefix === "?" ? prefix : ""),
    );
  }
}
