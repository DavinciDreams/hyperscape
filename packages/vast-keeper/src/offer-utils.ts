export interface VastOfferLike {
  cpu_ram?: number;
  cpu_cores_effective?: number;
  dph?: number;
  dph_total?: number;
  disk_space?: number;
  geolocation?: string;
  gpu_ram?: number;
  gpu_name?: string;
  reliability?: number;
}

export const DEFAULT_US_STREAM_SEARCH_QUERY =
  "gpu_display_active=true geolocation in [US] num_gpus=1 rented=False dph <= 2.5";

const MIN_CPU_CORES = 8;
const MIN_CPU_RAM_MB = 16000;
const MIN_DISK_GB = 80;
const MIN_GPU_RAM_MB = 10000;
const MIN_RELIABILITY = 0.96;

const WEST_REGION_MARKERS = [
  "arizona",
  "california",
  "nevada",
  "oregon",
  "utah",
  "washington",
];

const PREFERRED_GPU_ORDER = [
  "RTX 2080 TI",
  "RTX 3080",
  "RTX 3080 TI",
  "RTX 3090",
  "RTX 4070",
  "RTX 4070S TI",
  "RTX A4000",
  "RTX A4500",
  "RTX A5000",
  "A10",
  "L4",
  "RTX 4090",
  "RTX 5090",
];

function getHourlyPrice(offer: VastOfferLike): number {
  const price = offer.dph_total ?? offer.dph;
  return typeof price === "number" ? price : Number.POSITIVE_INFINITY;
}

function getReliabilityScore(offer: VastOfferLike): number {
  return typeof offer.reliability === "number" ? offer.reliability : 0;
}

function getWestRegionScore(offer: VastOfferLike): number {
  const location = (offer.geolocation || "").trim().toLowerCase();
  if (!location) return 1;
  return WEST_REGION_MARKERS.some((marker) => location.includes(marker)) ? 0 : 1;
}

function getGpuPreferenceScore(offer: VastOfferLike): number {
  const gpuName = (offer.gpu_name || "").trim().toUpperCase();
  if (!gpuName) return PREFERRED_GPU_ORDER.length;
  const preferredIndex = PREFERRED_GPU_ORDER.findIndex((entry) =>
    gpuName.includes(entry),
  );
  return preferredIndex === -1 ? PREFERRED_GPU_ORDER.length : preferredIndex;
}

export function filterOffersForStream<T extends VastOfferLike>(offers: T[]): T[] {
  return offers.filter((offer) => {
    return (
      typeof offer.reliability === "number" &&
      offer.reliability >= MIN_RELIABILITY &&
      typeof offer.cpu_ram === "number" &&
      offer.cpu_ram >= MIN_CPU_RAM_MB &&
      typeof offer.cpu_cores_effective === "number" &&
      offer.cpu_cores_effective >= MIN_CPU_CORES &&
      typeof offer.gpu_ram === "number" &&
      offer.gpu_ram >= MIN_GPU_RAM_MB &&
      typeof offer.disk_space === "number" &&
      offer.disk_space >= MIN_DISK_GB
    );
  });
}

export function sortOffersByPreference<T extends VastOfferLike>(
  offers: T[],
): T[] {
  return offers.sort((left, right) => {
    const westScoreDelta = getWestRegionScore(left) - getWestRegionScore(right);
    if (westScoreDelta !== 0) return westScoreDelta;

    const gpuScoreDelta =
      getGpuPreferenceScore(left) - getGpuPreferenceScore(right);
    if (gpuScoreDelta !== 0) return gpuScoreDelta;

    const priceDelta = getHourlyPrice(left) - getHourlyPrice(right);
    if (priceDelta !== 0) return priceDelta;

    return getReliabilityScore(right) - getReliabilityScore(left);
  });
}
