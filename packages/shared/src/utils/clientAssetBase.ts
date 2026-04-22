type RuntimeAssetEnv = {
  PUBLIC_API_URL?: string;
  PUBLIC_CDN_URL?: string;
  PUBLIC_ASSETS_URL?: string;
};

type BrowserAssetWindow = Window & {
  __CDN_URL?: string;
  __ASSETS_URL?: string;
};

function normalizeBaseUrl(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

function isProblematicAssetHost(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "0.0.0.0" ||
    hostname === "::1" ||
    hostname.endsWith(".sslip.io")
  );
}

function getRuntimeAssetEnv(): RuntimeAssetEnv | undefined {
  return (globalThis as { env?: RuntimeAssetEnv }).env;
}

function getRuntimeAssetBase(): string | undefined {
  const runtimeEnv = getRuntimeAssetEnv();
  const candidate = runtimeEnv?.PUBLIC_ASSETS_URL ?? runtimeEnv?.PUBLIC_CDN_URL;
  if (!candidate || candidate === "undefined") return undefined;
  return candidate;
}

function getRuntimeApiBase(): string | undefined {
  const runtimeEnv = getRuntimeAssetEnv();
  const candidate = runtimeEnv?.PUBLIC_API_URL;
  if (!candidate || candidate === "undefined") return undefined;
  return candidate;
}

export function resolveClientAssetBase(
  assetBaseUrl: string | undefined,
  apiBaseUrl: string | undefined,
  pageUrl: string,
): string | null {
  if (!assetBaseUrl) return null;

  try {
    const page = new URL(pageUrl);
    const asset = new URL(assetBaseUrl, page);
    const runtimeAssetBase = getRuntimeAssetBase();

    if (
      asset.origin !== page.origin &&
      isProblematicAssetHost(asset.hostname) &&
      runtimeAssetBase
    ) {
      return normalizeBaseUrl(new URL(runtimeAssetBase, page).toString());
    }

    if (
      asset.origin !== page.origin &&
      isProblematicAssetHost(asset.hostname) &&
      (getRuntimeApiBase() || apiBaseUrl)
    ) {
      const api = new URL(getRuntimeApiBase() || apiBaseUrl!, page);
      return normalizeBaseUrl(new URL("/game-assets", api.origin).toString());
    }

    return normalizeBaseUrl(asset.toString());
  } catch {
    return normalizeBaseUrl(assetBaseUrl);
  }
}

export function getRuntimeClientAssetBase(buildPublicCdnUrl?: string): string {
  let assetBase =
    buildPublicCdnUrl ||
    (typeof process !== "undefined" ? process.env.PUBLIC_CDN_URL : undefined) ||
    "http://localhost:5555/game-assets";
  let windowProvidedAssetBase = false;

  if (typeof window !== "undefined") {
    const windowWithCdn = window as BrowserAssetWindow;
    if (windowWithCdn.__ASSETS_URL) {
      assetBase = windowWithCdn.__ASSETS_URL;
      windowProvidedAssetBase = true;
    } else if (windowWithCdn.__CDN_URL) {
      assetBase = windowWithCdn.__CDN_URL;
      windowProvidedAssetBase = true;
    } else if (
      typeof import.meta !== "undefined" &&
      import.meta.env?.PUBLIC_CDN_URL
    ) {
      assetBase =
        import.meta.env.PUBLIC_CDN_URL || "http://localhost:5555/game-assets";
    }

    const resolved =
      resolveClientAssetBase(
        assetBase,
        getRuntimeApiBase(),
        window.location.href,
      ) || assetBase;
    return resolved;
  }

  if (
    !windowProvidedAssetBase &&
    typeof process !== "undefined" &&
    process.env.PUBLIC_CDN_URL &&
    !assetBase.includes("localhost")
  ) {
    assetBase = process.env.PUBLIC_CDN_URL;
  }

  return assetBase;
}
